import { tool } from "ai";
import { z } from "zod/v3";
import { createServerSupabaseClient } from "@/lib/db/supabase";

const PREVIEW_LIMIT = 200;

/**
 * Tool 1: executeSQL
 * Ejecuta queries SELECT de solo lectura contra la base de presupuesto nacional.
 */
export const executeSQL = tool({
  description: `Ejecuta una query SQL SELECT contra la base de datos del Presupuesto Nacional Argentino (2019-2025, datos mensuales).
Solo queries SELECT permitidas. Los resultados estan en millones de pesos.
Usa esta herramienta para obtener datos antes de responder cualquier pregunta.`,
  inputSchema: z.object({
    query: z.string().describe("Query SQL SELECT valida para PostgreSQL"),
    explanation: z.string().describe("Que busca esta query en 1 linea"),
  }),
  execute: async ({ query, explanation }) => {
    const normalized = query.trim().replace(/^\s+/g, "").toUpperCase();
    if (!normalized.startsWith("SELECT") && !normalized.startsWith("WITH")) {
      return { error: "Solo queries SELECT y WITH (CTEs) estan permitidas." };
    }

    if (
      /\b(DROP|DELETE|INSERT|UPDATE|ALTER|CREATE|TRUNCATE|GRANT|REVOKE)\b/i.test(
        query
      )
    ) {
      return { error: "Query contiene comandos no permitidos." };
    }

    try {
      const supabase = createServerSupabaseClient();
      const { data, error } = await supabase.rpc("execute_readonly_query", {
        sql_query: query,
      });

      if (error) {
        return {
          error: error.message,
          hint: "Revisa nombres de tablas y columnas en el schema. Usa unaccent(LOWER(...)) para filtros de texto.",
        };
      }

      const rows = Array.isArray(data) ? data : data ? [data] : [];

      return {
        explanation,
        rowCount: rows.length,
        data: rows.slice(0, PREVIEW_LIMIT),
        sql: query,
        truncated: rows.length > PREVIEW_LIMIT,
      };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Error desconocido";
      return { error: message };
    }
  },
});

/**
 * Tool 2: generateDashboard
 * Genera un DashboardSpec completo: KPIs, graficos, tablas y analisis narrativo.
 * NO tiene execute — el frontend renderiza directamente desde los args.
 */
export const generateDashboard = tool({
  description: `Genera un dashboard completo con KPIs, graficos, tablas y analisis narrativo.
Usa esta herramienta DESPUES de executeSQL para presentar los datos de forma visual e insightful.
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
 * Tool 3: rememberFact
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
