"use client";

import { useState } from "react";

interface ProvenanceBannerProps {
  queryCount: number;
  lastSQL?: string;
}

export function ProvenanceBanner({ queryCount, lastSQL }: ProvenanceBannerProps) {
  const [showSQL, setShowSQL] = useState(false);

  return (
    <div className="py-2 px-4">
      <div className="flex items-center gap-1 text-[11px] text-zinc-500">
        <span>Fuente: presupuestoabierto.gob.ar &middot; Presupuesto Nacional 2024</span>
        {queryCount > 0 && (
          <span>
            &middot; {queryCount} consulta{queryCount !== 1 ? "s" : ""}
          </span>
        )}
        {lastSQL && (
          <button
            onClick={() => setShowSQL((prev) => !prev)}
            className="ml-1 rounded px-1.5 py-0.5 text-[11px] text-violet-400 transition-colors hover:bg-zinc-800 hover:text-violet-300"
          >
            {showSQL ? "Ocultar SQL" : "Ver SQL"}
          </button>
        )}
      </div>
      {showSQL && lastSQL && (
        <div className="mt-2 max-h-40 overflow-y-auto rounded-lg bg-zinc-900/80 p-3 font-mono text-xs text-zinc-400 whitespace-pre-wrap">
          {lastSQL}
        </div>
      )}
    </div>
  );
}
