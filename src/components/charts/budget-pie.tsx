"use client";

import { ResponsivePie } from "@nivo/pie";

interface PieData {
  id: string;
  label: string;
  value: number;
}

interface BudgetPieProps {
  data: PieData[];
  title: string;
}

export function BudgetPie({ data, title }: BudgetPieProps) {
  if (!data?.length) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <p className="text-sm text-zinc-400">Sin datos para el gráfico de torta</p>
      </div>
    );
  }

  return (
    <div className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <h3 className="mb-3 text-base font-semibold text-white">{title}</h3>
      <div className="h-[420px]">
        <ResponsivePie
          data={data}
          margin={{ top: 30, right: 120, bottom: 30, left: 20 }}
          innerRadius={0.5}
          padAngle={0.7}
          cornerRadius={3}
          activeOuterRadiusOffset={8}
          colors={{ scheme: "purple_orange" }}
          borderWidth={1}
          borderColor={{ from: "color", modifiers: [["darker", 0.2]] }}
          arcLinkLabelsSkipAngle={10}
          arcLinkLabelsTextColor="#a1a1aa"
          arcLinkLabelsThickness={2}
          arcLinkLabelsColor={{ from: "color" }}
          arcLabelsSkipAngle={10}
          arcLabelsTextColor={{ from: "color", modifiers: [["darker", 2]] }}
          legends={[
            {
              anchor: "right",
              direction: "column",
              justify: false,
              translateX: 100,
              translateY: 0,
              itemsSpacing: 4,
              itemWidth: 80,
              itemHeight: 18,
              itemTextColor: "#a1a1aa",
              itemDirection: "left-to-right",
              symbolSize: 12,
              symbolShape: "circle",
            },
          ]}
          theme={{
            text: { fill: "#a1a1aa", fontSize: 11 },
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
