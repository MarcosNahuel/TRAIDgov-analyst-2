"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

interface InsightNavigationProps {
  current: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}

export function InsightNavigation({
  current,
  total,
  onPrev,
  onNext,
}: InsightNavigationProps) {
  if (total === 0) return null;

  return (
    <div className="flex items-center justify-between border-b border-zinc-800/50 bg-zinc-900/30 px-6 py-3">
      <div className="flex items-center gap-4">
        <button
          onClick={onPrev}
          disabled={current <= 0}
          className="rounded-lg bg-zinc-800 p-2 transition-colors hover:bg-zinc-700 disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4 text-zinc-300" />
        </button>
        <div className="text-center">
          <span className="text-sm text-zinc-400">Insight</span>
          <span className="mx-2 font-bold text-white">{current + 1}</span>
          <span className="text-sm text-zinc-400">de {total}</span>
        </div>
        <button
          onClick={onNext}
          disabled={current >= total - 1}
          className="rounded-lg bg-zinc-800 p-2 transition-colors hover:bg-zinc-700 disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4 text-zinc-300" />
        </button>
      </div>
    </div>
  );
}
