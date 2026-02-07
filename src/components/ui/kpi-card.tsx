"use client";

import { Card, CardContent } from "@/components/ui/card";

interface KPICardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: "up" | "down" | "neutral";
}

export function KPICard({ title, value, subtitle, trend }: KPICardProps) {
  const trendColor =
    trend === "up"
      ? "text-emerald-400"
      : trend === "down"
        ? "text-red-400"
        : "text-zinc-400";

  return (
    <Card className="border-zinc-800 bg-zinc-900/50">
      <CardContent className="p-4">
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          {title}
        </p>
        <p className={`mt-1 text-2xl font-bold ${trendColor}`}>
          {typeof value === "number"
            ? value.toLocaleString("es-AR")
            : value}
        </p>
        {subtitle && (
          <p className="mt-1 text-xs text-zinc-500">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}
