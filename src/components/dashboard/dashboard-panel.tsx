"use client";

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { InsightNavigation } from "./insight-navigation";
import { ProvenanceBanner } from "./provenance-banner";
import { KpiCardGrid } from "./kpi-card-grid";
import { ChartRenderer } from "./chart-renderer";
import { NarrativePanel } from "./narrative-panel";
import { DataTableExport } from "./data-table-export";
import type { DashboardState } from "@/lib/types";

interface DashboardPanelProps {
  dashboards: DashboardState[];
  currentIndex: number;
  onNavigate: (direction: "prev" | "next") => void;
}

export function DashboardPanel({
  dashboards,
  currentIndex,
  onNavigate,
}: DashboardPanelProps) {
  const current = dashboards[currentIndex];

  if (!dashboards.length) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-800/50">
          <Sparkles className="h-7 w-7 text-zinc-600" />
        </div>
        <h2 className="text-lg font-semibold text-zinc-400">Dashboard</h2>
        <p className="mt-2 max-w-sm text-sm text-zinc-600">
          Hacé una pregunta sobre el presupuesto y los insights aparecerán acá
          con gráficos, KPIs y análisis detallado.
        </p>
      </div>
    );
  }

  if (!current) return null;

  const { spec, queryCount, lastSQL } = current;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Navigation */}
      <InsightNavigation
        current={currentIndex}
        total={dashboards.length}
        onPrev={() => onNavigate("prev")}
        onNext={() => onNavigate("next")}
      />

      {/* Provenance */}
      <ProvenanceBanner queryCount={queryCount ?? 0} lastSQL={lastSQL} />

      {/* Dashboard content */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
        {/* Title */}
        <motion.div
          key={currentIndex}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-4 w-4 text-violet-400" />
            <h1 className="text-lg font-bold text-white">{spec.title}</h1>
          </div>
          {spec.conclusion && (
            <p className="rounded-lg bg-gradient-to-r from-violet-500/10 to-pink-500/5 px-3 py-2 text-sm font-medium text-violet-300">
              {spec.conclusion}
            </p>
          )}
        </motion.div>

        {/* KPIs */}
        <KpiCardGrid kpis={spec.kpis} />

        {/* Charts */}
        {spec.charts?.length > 0 && (
          <div
            className={
              spec.charts.length === 1
                ? ""
                : "grid grid-cols-1 gap-4 lg:grid-cols-2"
            }
          >
            {spec.charts.map((chart, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 + idx * 0.1 }}
              >
                <ChartRenderer chart={chart} />
              </motion.div>
            ))}
          </div>
        )}

        {/* Narrative */}
        {spec.narrative && <NarrativePanel narrative={spec.narrative} />}

        {/* Tables */}
        {spec.tables?.map((table, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.3 }}
          >
            <DataTableExport table={table} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}
