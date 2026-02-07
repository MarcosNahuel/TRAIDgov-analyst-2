import { tool } from "ai";
import { z } from "zod/v3";
import { createServerSupabaseClient } from "@/lib/db/supabase";

const PREVIEW_LIMIT = 200;

/**
 * Tool 1: executeSQL
 * Ejecuta queries SELECT de solo lectura contra la base de presupuesto nacional.
 */
export const executeSQL = tool({
  description: `Ejecuta una query SQL SELECT contra la base de datos del Presupuesto Nacional Argentino 2024.
Solo queries SELECT permitidas. Los resultados están en pesos argentinos.
Usá esta herramienta para obtener datos antes de responder cualquier pregunta sobre presupuesto.`,
  inputSchema: z.object({
    query: z.string().describe("Query SQL SELECT válida para PostgreSQL"),
    explanation: z.string().describe("Qué busca esta query en 1 línea"),
  }),
  execute: async ({ query, explanation }) => {
    const normalized = query.trim().replace(/^\s+/g, "").toUpperCase();
    if (!normalized.startsWith("SELECT") && !normalized.startsWith("WITH")) {
      return { error: "Solo queries SELECT y WITH (CTEs) están permitidas." };
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
          hint: "Revisá nombres de tablas y columnas en el schema. Usá unaccent(LOWER(...)) para filtros de texto.",
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
 * Genera un DashboardSpec completo: KPIs, gráficos, tablas y análisis narrativo.
 * NO tiene execute — el frontend renderiza directamente desde los args.
 */
export const generateDashboard = tool({
  description: `Genera un dashboard completo con KPIs, gráficos, tablas y análisis narrativo.
Usá esta herramienta DESPUÉS de executeSQL para presentar los datos de forma visual e insightful.
El dashboard se renderiza en un panel dedicado a la derecha del chat.

Incluí siempre:
- 2-4 KPIs con las métricas principales
- 1-3 gráficos apropiados al tipo de datos
- 1 tabla con los datos detallados (opcional)
- Análisis narrativo con headline, resumen, insights y alertas

Tipos de gráfico disponibles:
- bar: rankings y comparaciones (top N, vs entre categorías)
- sankey: flujos de dinero (origen → destino)
- treemap: distribución proporcional (jerarquías de gasto)
- pie: composición porcentual (partes del total)
- line: evolución temporal (series mensuales)`,
  inputSchema: z.object({
    title: z.string().describe("Título descriptivo del dashboard"),
    conclusion: z.string().describe("Resumen conciso de 1-2 oraciones que responde la pregunta. Se muestra en el chat."),
    kpis: z.array(z.object({
      label: z.string().describe("Nombre de la métrica"),
      value: z.number().describe("Valor numérico"),
      format: z.enum(["currency", "number", "percent"]).describe("Formato de display"),
      delta: z.number().optional().describe("Porcentaje de cambio (ej: -15.3 para subejecución)"),
      trend: z.enum(["up", "down", "neutral"]).optional(),
    })).describe("2-4 KPI cards con métricas principales"),
    charts: z.array(z.object({
      type: z.enum(["bar", "sankey", "treemap", "pie", "line"]),
      title: z.string(),
      data: z.any().describe("Payload JSON específico para Nivo según el type"),
      config: z.object({
        layout: z.enum(["horizontal", "vertical"]).optional(),
        colors: z.array(z.string()).optional(),
        keys: z.array(z.string()).optional(),
        indexBy: z.string().optional(),
      }).optional(),
    })).describe("1-3 gráficos Nivo"),
    tables: z.array(z.object({
      title: z.string(),
      columns: z.array(z.string()),
      rows: z.array(z.record(z.string(), z.any())),
      downloadable: z.boolean(),
    })).optional().describe("0-1 tablas con datos detallados"),
    narrative: z.object({
      headline: z.string().describe("Conclusión principal en 1 oración"),
      summary: z.string().describe("Resumen ejecutivo en 2-3 oraciones"),
      insights: z.array(z.string()).describe("3-5 insights específicos con datos"),
      callouts: z.array(z.string()).optional().describe("Alertas sobre subejecución, anomalías, etc."),
    }).describe("Análisis AI profundo"),
  }),
});
