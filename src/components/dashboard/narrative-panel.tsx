"use client";

import { motion } from "framer-motion";
import { Sparkles, AlertTriangle } from "lucide-react";
import type { Narrative } from "@/lib/types";

interface NarrativePanelProps {
  narrative: Narrative;
}

export function NarrativePanel({ narrative }: NarrativePanelProps) {
  if (!narrative?.headline) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
      className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 space-y-4"
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-pink-600">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-white">Análisis AI</h3>
          <p className="text-[10px] text-zinc-500">Razonamiento profundo</p>
        </div>
      </div>

      {/* Headline */}
      <div className="rounded-lg bg-gradient-to-r from-violet-500/10 to-pink-500/5 px-4 py-3">
        <span className="text-[10px] font-medium uppercase tracking-wider text-violet-400">
          Conclusión
        </span>
        <p className="mt-1 text-base font-bold text-white">
          {narrative.headline}
        </p>
      </div>

      {/* Summary */}
      {narrative.summary && (
        <div>
          <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Resumen Ejecutivo
          </span>
          <p className="mt-1 text-sm leading-relaxed text-zinc-300">
            {narrative.summary}
          </p>
        </div>
      )}

      {/* Insights */}
      {narrative.insights?.length > 0 && (
        <div className="space-y-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Insights
          </span>
          {narrative.insights.map((insight, idx) => (
            <div key={idx} className="flex items-start gap-3">
              <div className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-violet-400" />
              <p className="text-sm text-zinc-300">{insight}</p>
            </div>
          ))}
        </div>
      )}

      {/* Callouts */}
      {narrative.callouts && narrative.callouts.length > 0 && (
        <div className="space-y-2">
          {narrative.callouts.map((callout, idx) => (
            <div
              key={idx}
              className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/10 p-3"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-400" />
              <p className="text-sm text-amber-300">{callout}</p>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
