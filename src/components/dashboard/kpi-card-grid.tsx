"use client";

import { motion } from "framer-motion";
import { TrendingUp, TrendingDown } from "lucide-react";
import type { KpiCardData } from "@/lib/types";

function formatKpiValue(value: number, format: string): string {
  if (format === "percent") {
    return `${value.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`;
  }
  if (format === "currency") {
    if (Math.abs(value) >= 1_000_000_000) {
      return `$${(value / 1_000_000_000).toLocaleString("es-AR", { maximumFractionDigits: 1 })}B`;
    }
    if (Math.abs(value) >= 1_000_000) {
      return `$${(value / 1_000_000).toLocaleString("es-AR", { maximumFractionDigits: 1 })}M`;
    }
    return `$${value.toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
  }
  return value.toLocaleString("es-AR", { maximumFractionDigits: 1 });
}

interface KpiCardGridProps {
  kpis: KpiCardData[];
}

export function KpiCardGrid({ kpis }: KpiCardGridProps) {
  if (!kpis?.length) return null;

  const cols = kpis.length <= 2 ? "grid-cols-2" : kpis.length === 3 ? "grid-cols-3" : "grid-cols-2 md:grid-cols-4";

  return (
    <div className={`grid ${cols} gap-3`}>
      {kpis.map((kpi, idx) => (
        <motion.div
          key={idx}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: idx * 0.05 }}
          className="relative overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 backdrop-blur-sm transition-colors hover:border-zinc-700"
        >
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            {kpi.label}
          </p>
          <p className="mt-1 text-2xl font-bold text-white">
            {formatKpiValue(kpi.value, kpi.format)}
          </p>
          {kpi.delta !== undefined && (
            <div
              className={`mt-1 flex items-center gap-1 text-xs font-medium ${
                kpi.trend === "up"
                  ? "text-emerald-400"
                  : kpi.trend === "down"
                    ? "text-red-400"
                    : "text-zinc-400"
              }`}
            >
              {kpi.trend === "up" && <TrendingUp className="h-3 w-3" />}
              {kpi.trend === "down" && <TrendingDown className="h-3 w-3" />}
              <span>{Math.abs(kpi.delta).toLocaleString("es-AR", { maximumFractionDigits: 1 })}%</span>
            </div>
          )}
          {kpi.trend && (
            <div
              className={`absolute bottom-0 left-0 right-0 h-0.5 ${
                kpi.trend === "up"
                  ? "bg-gradient-to-r from-emerald-500/50 to-transparent"
                  : kpi.trend === "down"
                    ? "bg-gradient-to-r from-red-500/50 to-transparent"
                    : ""
              }`}
            />
          )}
        </motion.div>
      ))}
    </div>
  );
}
