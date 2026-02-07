"use client";

import { BudgetSankey } from "@/components/charts/budget-sankey";
import { BudgetTreemap } from "@/components/charts/budget-treemap";
import { BudgetBar } from "@/components/charts/budget-bar";
import { BudgetPie } from "@/components/charts/budget-pie";
import { BudgetLine } from "@/components/charts/budget-line";
import type { ChartConfig } from "@/lib/types";

interface ChartRendererProps {
  chart: ChartConfig;
}

export function ChartRenderer({ chart }: ChartRendererProps) {
  switch (chart.type) {
    case "sankey":
      return (
        <BudgetSankey
          data={
            chart.data as {
              nodes: { id: string }[];
              links: { source: string; target: string; value: number }[];
            }
          }
          title={chart.title}
        />
      );

    case "treemap":
      return (
        <BudgetTreemap
          data={
            chart.data as {
              name: string;
              children?: { name: string; value?: number }[];
            }
          }
          title={chart.title}
        />
      );

    case "bar":
      return (
        <BudgetBar
          data={chart.data as Record<string, unknown>[]}
          title={chart.title}
          layout={chart.config?.layout}
          keys={chart.config?.keys}
          indexBy={chart.config?.indexBy}
        />
      );

    case "pie":
      return (
        <BudgetPie
          data={chart.data as { id: string; label: string; value: number }[]}
          title={chart.title}
        />
      );

    case "line":
      return (
        <BudgetLine
          data={
            chart.data as {
              id: string;
              data: { x: string | number; y: number }[];
            }[]
          }
          title={chart.title}
        />
      );

    default:
      return (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
          <p className="text-sm text-zinc-400">
            Tipo de gráfico no soportado: {chart.type}
          </p>
        </div>
      );
  }
}
