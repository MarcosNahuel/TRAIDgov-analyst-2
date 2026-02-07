import type { ChartConfig } from "@/lib/types";

/**
 * Formatea un monto en millones de pesos a formato legible.
 */
export function formatBudgetAmount(millions: number): string {
  if (Math.abs(millions) >= 1_000_000) {
    return `${(millions / 1_000_000).toFixed(1)} B`;
  }
  if (Math.abs(millions) >= 1_000) {
    return `${(millions / 1_000).toFixed(1)} MM`;
  }
  if (Math.abs(millions) >= 1) {
    return `${millions.toFixed(0)} M`;
  }
  return `${millions.toFixed(2)} M`;
}

/**
 * Valida que un chart tenga data renderizable.
 * Si no, retorna fallback para mostrar tabla en vez de chart roto.
 */
export function validateChartData(chart: ChartConfig): {
  valid: boolean;
  fallbackReason?: string;
} {
  if (!chart.data) return { valid: false, fallbackReason: "Sin datos" };

  if (chart.type === "bar" && Array.isArray(chart.data) && chart.data.length === 0) {
    return { valid: false, fallbackReason: "Array de barras vacio" };
  }

  if (chart.type === "pie" && Array.isArray(chart.data) && chart.data.length === 0) {
    return { valid: false, fallbackReason: "Array de pie vacio" };
  }

  if (chart.type === "line" && Array.isArray(chart.data) && chart.data.length === 0) {
    return { valid: false, fallbackReason: "Array de series vacio" };
  }

  if (chart.type === "sankey") {
    const d = chart.data as { nodes?: unknown[]; links?: unknown[] };
    if (!d.nodes?.length || !d.links?.length) {
      return { valid: false, fallbackReason: "Sankey sin nodos o links" };
    }
  }

  if (chart.type === "treemap") {
    const d = chart.data as { children?: unknown[]; value?: number };
    if (!d.children?.length && !d.value) {
      return { valid: false, fallbackReason: "Treemap sin children ni value" };
    }
  }

  // Verificar que haya al menos un valor numerico en arrays
  if (Array.isArray(chart.data) && chart.data.length > 0) {
    const hasNumeric = chart.data.some((d: Record<string, unknown>) =>
      Object.values(d).some(v => typeof v === "number" && !isNaN(v as number))
    );
    if (!hasNumeric) {
      return { valid: false, fallbackReason: "Datos sin valores numericos" };
    }
  }

  return { valid: true };
}
