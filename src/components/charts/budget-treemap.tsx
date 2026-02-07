"use client";

import { ResponsiveTreeMap } from "@nivo/treemap";

interface TreemapData {
  name: string;
  value?: number;
  children?: TreemapData[];
}

interface BudgetTreemapProps {
  data: TreemapData;
  title: string;
}

export function BudgetTreemap({ data, title }: BudgetTreemapProps) {
  if (!data?.children?.length && !data?.value) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <p className="text-sm text-zinc-400">Sin datos para el treemap</p>
      </div>
    );
  }

  return (
    <div className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <h3 className="mb-3 text-base font-semibold text-white">{title}</h3>
      <div className="h-[420px]">
        <ResponsiveTreeMap
          data={data}
          identity="name"
          value="value"
          margin={{ top: 10, right: 10, bottom: 10, left: 10 }}
          labelSkipSize={32}
          label={(node) => `${node.id} (${((node.value / 1_000_000) | 0).toLocaleString("es-AR")}M)`}
          labelTextColor={{ from: "color", modifiers: [["darker", 2.5]] }}
          parentLabelPosition="left"
          parentLabelTextColor={{ from: "color", modifiers: [["darker", 3]] }}
          colors={{ scheme: "purple_orange" }}
          borderColor={{ from: "color", modifiers: [["darker", 0.3]] }}
          borderWidth={1}
          nodeOpacity={1}
          theme={{
            text: { fontSize: 11 },
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
