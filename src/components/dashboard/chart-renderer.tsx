"use client";

import dynamic from "next/dynamic";
import { validateChartData } from "@/lib/chart-utils";
import { ChartErrorBoundary } from "@/components/dashboard/chart-error-boundary";
import type { ChartConfig } from "@/lib/types";

// Dynamic imports — code-splitting de Nivo (no SSR)
const BudgetSankey = dynamic(() => import("@/components/charts/budget-sankey"), { ssr: false });
const BudgetTreemap = dynamic(() => import("@/components/charts/budget-treemap"), { ssr: false });
const BudgetBar = dynamic(() => import("@/components/charts/budget-bar"), { ssr: false });
const BudgetPie = dynamic(() => import("@/components/charts/budget-pie"), { ssr: false });
const BudgetLine = dynamic(() => import("@/components/charts/budget-line"), { ssr: false });

interface ChartRendererProps {
  chart: ChartConfig;
}

function DataFallback({ chart, reason }: { chart: ChartConfig; reason: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <h3 className="mb-2 text-base font-semibold text-white">{chart.title}</h3>
      <p className="mb-3 text-xs text-amber-400">Grafico no disponible: {reason}</p>
      {Array.isArray(chart.data) && chart.data.length > 0 && (
        <div className="max-h-[300px] overflow-auto">
          <table className="w-full text-xs text-zinc-300">
            <thead>
              <tr className="border-b border-zinc-700">
                {Object.keys(chart.data[0] as Record<string, unknown>).map((key) => (
                  <th key={key} className="px-2 py-1 text-left font-medium text-zinc-400">
                    {key}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(chart.data as Record<string, unknown>[]).slice(0, 20).map((row, i) => (
                <tr key={i} className="border-b border-zinc-800/50">
                  {Object.values(row).map((val, j) => (
                    <td key={j} className="px-2 py-1">
                      {typeof val === "number" ? val.toLocaleString("es-AR") : String(val ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function ChartRenderer({ chart }: ChartRendererProps) {
  // Validar data antes de renderizar
  const validation = validateChartData(chart);
  if (!validation.valid) {
    return <DataFallback chart={chart} reason={validation.fallbackReason!} />;
  }

  const renderChart = () => {
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
              Tipo de grafico no soportado: {chart.type}
            </p>
          </div>
        );
    }
  };

  return (
    <ChartErrorBoundary chartTitle={chart.title}>
      {renderChart()}
    </ChartErrorBoundary>
  );
}
