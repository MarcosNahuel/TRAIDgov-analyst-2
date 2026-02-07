"use client";

import { memo } from "react";
import { ResponsiveLine } from "@nivo/line";
import { formatBudgetAmount } from "@/lib/chart-utils";

interface LineSeriesPoint {
  x: string | number;
  y: number;
}

interface LineSeries {
  id: string;
  data: LineSeriesPoint[];
}

interface BudgetLineProps {
  data: LineSeries[];
  title: string;
}

function BudgetLineInner({ data, title }: BudgetLineProps) {
  if (!data?.length || !data[0]?.data?.length) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <p className="text-sm text-zinc-400">Sin datos para el grafico de lineas</p>
      </div>
    );
  }

  return (
    <div className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <h3 className="mb-3 text-base font-semibold text-white">{title}</h3>
      <div className="h-[420px]">
        <ResponsiveLine
          data={data}
          margin={{ top: 20, right: 110, bottom: 50, left: 80 }}
          xScale={{ type: "point" }}
          yScale={{ type: "linear", min: "auto", max: "auto", stacked: false }}
          curve="monotoneX"
          animate={false}
          axisBottom={{
            tickSize: 0,
            tickPadding: 8,
            tickRotation: -45,
          }}
          axisLeft={{
            tickSize: 0,
            tickPadding: 8,
            format: (v) => formatBudgetAmount(Number(v)),
          }}
          enableGridX={false}
          colors={{ scheme: "purple_orange" }}
          lineWidth={2}
          pointSize={8}
          pointColor={{ theme: "background" }}
          pointBorderWidth={2}
          pointBorderColor={{ from: "serieColor" }}
          enableArea
          areaOpacity={0.1}
          useMesh
          legends={[
            {
              anchor: "bottom-right",
              direction: "column",
              justify: false,
              translateX: 100,
              translateY: 0,
              itemsSpacing: 4,
              itemWidth: 80,
              itemHeight: 20,
              itemTextColor: "#a1a1aa",
              symbolSize: 12,
              symbolShape: "circle",
            },
          ]}
          theme={{
            text: { fill: "#a1a1aa", fontSize: 11 },
            axis: {
              ticks: { text: { fill: "#a1a1aa", fontSize: 10 } },
            },
            grid: { line: { stroke: "#27272a" } },
            crosshair: { line: { stroke: "#a1a1aa", strokeWidth: 1 } },
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

export const BudgetLine = memo(BudgetLineInner);
export default BudgetLine;
