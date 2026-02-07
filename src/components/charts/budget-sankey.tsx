"use client";

import { memo } from "react";
import { ResponsiveSankey } from "@nivo/sankey";

interface SankeyNode {
  id: string;
  [key: string]: unknown;
}

interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

interface BudgetSankeyProps {
  data: { nodes: SankeyNode[]; links: SankeyLink[] };
  title: string;
}

function BudgetSankeyInner({ data, title }: BudgetSankeyProps) {
  if (!data?.nodes?.length || !data?.links?.length) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <p className="text-sm text-zinc-400">Sin datos para el grafico Sankey</p>
      </div>
    );
  }

  const nodeIds = new Set(data.nodes.map((n) => n.id));
  const safeLinks = data.links.filter(
    (link) =>
      link.source !== link.target &&
      link.value > 0 &&
      nodeIds.has(link.source) &&
      nodeIds.has(link.target)
  );

  if (safeLinks.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <p className="text-sm text-zinc-400">Sin flujos validos para visualizar</p>
      </div>
    );
  }

  const safeData = { nodes: data.nodes, links: safeLinks };

  return (
    <div className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <h3 className="mb-3 text-base font-semibold text-white">{title}</h3>
      <div className="h-[420px]">
        <ResponsiveSankey
          data={safeData}
          margin={{ top: 20, right: 160, bottom: 20, left: 20 }}
          align="justify"
          colors={{ scheme: "purple_orange" }}
          nodeOpacity={1}
          nodeHoverOthersOpacity={0.35}
          nodeThickness={18}
          nodeSpacing={24}
          nodeBorderWidth={0}
          nodeBorderRadius={3}
          linkOpacity={0.5}
          linkHoverOpacity={0.8}
          linkHoverOthersOpacity={0.1}
          enableLinkGradient
          animate={false}
          labelPosition="outside"
          labelOrientation="horizontal"
          labelPadding={12}
          labelTextColor={{ from: "color", modifiers: [["brighter", 1]] }}
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

export const BudgetSankey = memo(BudgetSankeyInner);
export default BudgetSankey;
