// DashboardSpec — Contrato entre LLM y UI

export interface DashboardSpec {
  title: string;
  conclusion: string;
  kpis: KpiCardData[];
  charts: ChartConfig[];
  tables?: TableConfig[];
  narrative: Narrative;
}

export interface KpiCardData {
  label: string;
  value: number;
  format: "currency" | "number" | "percent";
  delta?: number;
  trend?: "up" | "down" | "neutral";
}

export interface ChartConfig {
  type: "bar" | "sankey" | "treemap" | "pie" | "line";
  title: string;
  data: unknown;
  config?: {
    layout?: "horizontal" | "vertical";
    colors?: string[];
    keys?: string[];
    indexBy?: string;
  };
}

export interface TableConfig {
  title: string;
  columns: string[];
  rows: Record<string, unknown>[];
  downloadable: boolean;
}

export interface Narrative {
  headline: string;
  summary: string;
  insights: string[];
  callouts?: string[];
}

export interface DashboardState {
  spec: DashboardSpec;
  timestamp: number;
  queryCount?: number;
  lastSQL?: string;
}
