import { tool } from "ai";
import { z } from "zod/v3";
import { createServerSupabaseClient } from "@/lib/db/supabase";

const PREVIEW_LIMIT = 200;

// Regex de comandos no permitidos
const FORBIDDEN_SQL = /\b(DROP|DELETE|INSERT|UPDATE|ALTER|CREATE|TRUNCATE|GRANT|REVOKE)\b/i;

function validateSQL(query: string): string | null {
  const normalized = query.trim().replace(/^\s+/g, "").toUpperCase();
  if (!normalized.startsWith("SELECT") && !normalized.startsWith("WITH")) {
    return "Solo queries SELECT y WITH (CTEs) estan permitidas.";
  }
  if (FORBIDDEN_SQL.test(query)) {
    return "Query contiene comandos no permitidos.";
  }
  return null;
}

/**
 * Genera warnings de sanity check sobre los resultados de una query.
 */
function generateWarnings(rows: Record<string, unknown>[]): string[] {
  const warnings: string[] = [];

  if (rows.length === 0) {
    warnings.push(
      "La query no devolvio resultados. Posibles causas: " +
      "filtro de periodo incorrecto, nombre de dimension mal escrito, " +
      "o datos no cargados para ese anio."
    );
    return warnings;
  }

  if (rows.length >= PREVIEW_LIMIT) {
    warnings.push(
      `Resultados truncados a ${PREVIEW_LIMIT} filas. ` +
      "Usa agregacion (SUM/GROUP BY) para datos mas concisos."
    );
  }

  // Chequeo de magnitudes en columnas numericas
  const numericCols = Object.keys(rows[0] ?? {}).filter(
    k => typeof rows[0][k] === "number"
  );
  for (const col of numericCols) {
    const vals = rows.map(r => r[col] as number).filter(v => v != null);
    if (vals.some(v => v < 0)) {
      warnings.push(
        `Columna "${col}" tiene valores negativos. ` +
        "En presupuesto esto puede indicar reducciones o ajustes."
      );
    }
    const max = Math.max(...vals.map(Math.abs));
    if (max > 1e15) {
      warnings.push(
        `Columna "${col}" tiene valores muy grandes (${max}). ` +
        "Verificar si la query necesita /1000000 para expresar en millones."
      );
    }
  }

  return warnings;
}

/**
 * Tool 1: executeSQL
 * Ejecuta queries SELECT de solo lectura contra la base de presupuesto nacional.
 */
export const executeSQL = tool({
  description: `Ejecuta una query SQL SELECT contra la base de datos del Presupuesto Nacional Argentino (2019-2025, datos mensuales).
Solo queries SELECT permitidas. Los resultados estan en millones de pesos.
Usa esta herramienta para obtener datos antes de responder cualquier pregunta.
Para preguntas que requieren 2+ queries distintas (comparaciones, cruces), usa planQueries en su lugar.`,
  inputSchema: z.object({
    query: z.string().describe("Query SQL SELECT valida para PostgreSQL"),
    explanation: z.string().describe("Que busca esta query en 1 linea"),
  }),
  execute: async ({ query, explanation }) => {
    const error = validateSQL(query);
    if (error) return { error };

    try {
      const supabase = createServerSupabaseClient();
      const t0 = performance.now();
      const { data, error: dbError } = await supabase.rpc("execute_readonly_query", {
        sql_query: query,
      });
      const latencyMs = Math.round(performance.now() - t0);

      if (dbError) {
        return {
          error: dbError.message,
          hint: "Revisa nombres de tablas y columnas en el schema. Usa unaccent(LOWER(...)) para filtros de texto.",
          latency_ms: latencyMs,
        };
      }

      const rows = Array.isArray(data) ? data : data ? [data] : [];
      const warnings = generateWarnings(rows as Record<string, unknown>[]);

      return {
        explanation,
        rowCount: rows.length,
        data: rows.slice(0, PREVIEW_LIMIT),
        sql: query,
        truncated: rows.length > PREVIEW_LIMIT,
        warnings,
        latency_ms: latencyMs,
      };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Error desconocido";
      return { error: message };
    }
  },
});

/**
 * Tool 2: planQueries
 * Ejecuta multiples queries SQL en paralelo para preguntas complejas.
 */
export const planQueries = tool({
  description: `Planifica y ejecuta multiples queries SQL en paralelo.
Usa esta tool cuando necesites datos de 2 o mas consultas distintas para responder
(ej: comparar anios, cruzar dimensiones, obtener datos de multiples fuentes).
Es mas preciso y eficiente que llamar executeSQL multiples veces.
Cada query debe ser SELECT valida y tener un label descriptivo.`,
  inputSchema: z.object({
    queries: z.array(z.object({
      query: z.string().describe("Query SQL SELECT valida"),
      label: z.string().describe("Nombre descriptivo del resultado"),
    })).min(2).max(5),
  }),
  execute: async ({ queries }) => {
    // Validar todas las queries primero
    for (const q of queries) {
      const err = validateSQL(q.query);
      if (err) {
        return { error: `Query "${q.label}": ${err}` };
      }
    }

    const supabase = createServerSupabaseClient();

    // Ejecutar en paralelo
    const results = await Promise.all(
      queries.map(async (q) => {
        const start = performance.now();
        try {
          const { data, error } = await supabase.rpc("execute_readonly_query", {
            sql_query: q.query,
          });
          const rows = Array.isArray(data) ? data : data ? [data] : [];
          const warnings = generateWarnings(rows as Record<string, unknown>[]);
          return {
            label: q.label,
            rowCount: rows.length,
            data: rows.slice(0, PREVIEW_LIMIT),
            latency_ms: Math.round(performance.now() - start),
            error: error?.message ?? null,
            warnings,
          };
        } catch (e: unknown) {
          return {
            label: q.label,
            rowCount: 0,
            data: [],
            latency_ms: Math.round(performance.now() - start),
            error: e instanceof Error ? e.message : "Error desconocido",
            warnings: [],
          };
        }
      })
    );

    return { results };
  },
});

/**
 * Tool 3: generateDashboard
 * Genera un DashboardSpec completo: KPIs, graficos, tablas y analisis narrativo.
 * NO tiene execute — el frontend renderiza directamente desde los args.
 */
export const generateDashboard = tool({
  description: `Genera un dashboard completo con KPIs, graficos, tablas y analisis narrativo.
Usa esta herramienta DESPUES de executeSQL o planQueries para presentar los datos de forma visual e insightful.
El dashboard se renderiza en un panel dedicado a la derecha del chat.

Inclui siempre:
- 2-4 KPIs con las metricas principales
- 1-3 graficos apropiados al tipo de datos
- 1 tabla con los datos detallados (opcional)
- Analisis narrativo con headline, resumen, insights y alertas

Tipos de grafico disponibles:
- bar: rankings y comparaciones (top N, vs entre categorias)
- sankey: flujos de dinero (origen -> destino)
- treemap: distribucion proporcional (jerarquias de gasto)
- pie: composicion porcentual (partes del total)
- line: evolucion temporal (series mensuales)`,
  inputSchema: z.object({
    title: z.string().describe("Titulo descriptivo del dashboard"),
    conclusion: z.string().describe("Resumen conciso de 1-2 oraciones que responde la pregunta. Se muestra en el chat."),
    kpis: z.array(z.object({
      label: z.string().describe("Nombre de la metrica"),
      value: z.number().describe("Valor numerico"),
      format: z.enum(["currency", "number", "percent"]).describe("Formato de display"),
      delta: z.number().optional().describe("Porcentaje de cambio (ej: -15.3 para subejecucion)"),
      trend: z.enum(["up", "down", "neutral"]).optional(),
    })).describe("2-4 KPI cards con metricas principales"),
    charts: z.array(z.object({
      type: z.enum(["bar", "sankey", "treemap", "pie", "line"]),
      title: z.string(),
      data: z.any().describe("Payload JSON especifico para Nivo segun el type"),
      config: z.object({
        layout: z.enum(["horizontal", "vertical"]).optional(),
        colors: z.array(z.string()).optional(),
        keys: z.array(z.string()).optional(),
        indexBy: z.string().optional(),
      }).optional(),
    })).describe("1-3 graficos Nivo"),
    tables: z.array(z.object({
      title: z.string(),
      columns: z.array(z.string()),
      rows: z.array(z.record(z.string(), z.any())),
      downloadable: z.boolean(),
    })).optional().describe("0-1 tablas con datos detallados"),
    narrative: z.object({
      headline: z.string().describe("Conclusion principal en 1 oracion"),
      summary: z.string().describe("Resumen ejecutivo en 2-3 oraciones"),
      insights: z.array(z.string()).describe("3-5 insights especificos con datos"),
      callouts: z.array(z.string()).optional().describe("Alertas sobre subejecucion, anomalias, etc."),
    }).describe("Analisis AI profundo"),
  }),
});

/**
 * Tool 4: rememberFact
 * Guarda hechos o preferencias del usuario para futuras conversaciones.
 */
export const rememberFact = tool({
  description: `Guarda un hecho o preferencia del usuario para recordarlo en futuras conversaciones. Usa esta herramienta cuando el usuario exprese:
- Una preferencia explicita ("siempre quiero ver en pesos constantes")
- Un contexto relevante ("trabajo en el Ministerio de Salud")
- Una correccion ("cuando digo educacion me refiero a la funcion, no jurisdiccion")
No guardes informacion obvia o redundante.`,
  inputSchema: z.object({
    content: z.string().describe("Hecho o preferencia a recordar, en 1 oracion"),
    category: z.enum(["preference", "fact", "correction"]),
  }),
  execute: async ({ content, category }) => {
    const supabase = createServerSupabaseClient();
    const { error } = await supabase
      .from("agent_memories")
      .insert({ content, category });
    if (error) return { saved: false, error: error.message };
    return { saved: true, content };
  },
});
