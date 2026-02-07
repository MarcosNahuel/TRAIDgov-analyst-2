"use client";

import { ResponsiveBar, type BarDatum } from "@nivo/bar";

interface BudgetBarProps {
  data: Record<string, unknown>[];
  title: string;
  layout?: "horizontal" | "vertical";
  keys?: string[];
  indexBy?: string;
}

export function BudgetBar({
  data,
  title,
  layout = "horizontal",
  keys,
  indexBy,
}: BudgetBarProps) {
  if (!data?.length) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <p className="text-sm text-zinc-400">Sin datos para el gráfico de barras</p>
      </div>
    );
  }

  // Auto-detectar keys si no se proporcionan
  const firstRow = data[0];
  const detectedIndexBy =
    indexBy ||
    Object.keys(firstRow).find(
      (k) => typeof firstRow[k] === "string"
    ) ||
    "categoria";

  const detectedKeys =
    keys ||
    Object.keys(firstRow).filter(
      (k) => k !== detectedIndexBy && typeof firstRow[k] === "number"
    );

  return (
    <div className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <h3 className="mb-3 text-base font-semibold text-white">{title}</h3>
      <div className="h-[420px]">
        <ResponsiveBar
          data={data as BarDatum[]}
          keys={detectedKeys}
          indexBy={detectedIndexBy}
          layout={layout}
          margin={
            layout === "horizontal"
              ? { top: 10, right: 20, bottom: 40, left: 180 }
              : { top: 10, right: 20, bottom: 80, left: 60 }
          }
          padding={0.3}
          valueScale={{ type: "linear" }}
          indexScale={{ type: "band", round: true }}
          colors={{ scheme: "purple_orange" }}
          borderRadius={3}
          borderColor={{ from: "color", modifiers: [["darker", 1.6]] }}
          axisBottom={
            layout === "vertical"
              ? {
                  tickSize: 0,
                  tickPadding: 8,
                  tickRotation: -45,
                }
              : { tickSize: 0, tickPadding: 8 }
          }
          axisLeft={{
            tickSize: 0,
            tickPadding: 8,
          }}
          enableGridY={layout === "vertical"}
          enableGridX={layout === "horizontal"}
          enableLabel={false}
          theme={{
            text: { fill: "#a1a1aa", fontSize: 11 },
            axis: {
              ticks: { text: { fill: "#a1a1aa", fontSize: 10 } },
            },
            grid: { line: { stroke: "#27272a" } },
            tooltip: {
              container: {
                background: "#18181b",
                color: "#fafafa",
                fontSize: 12,
                borderRadius: 8,
                boxShadow: "0 4px 12px rgba(0,0,0,0.5)",
              },
            },
          }}
        />
      </div>
    </div>
  );
}
