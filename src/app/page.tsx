"use client";

import { useChat } from "@ai-sdk/react";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { MessageList } from "@/components/ai/message-list";
import { DashboardPanel } from "@/components/dashboard/dashboard-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { motion } from "framer-motion";
import type { DashboardSpec, DashboardState } from "@/lib/types";

const SUGGESTED_QUESTIONS = [
  "Cuánto gastó el Ministerio de Salud en 2024?",
  "Top 10 programas con mayor ejecución presupuestaria",
  "Qué jurisdicción tiene mayor subejecución?",
  "Distribución del gasto por finalidad",
  "Comparame gastos en personal vs transferencias",
  "Cuánto se destinó a cada provincia?",
];

export default function HomePage() {
  const { messages, sendMessage, status } = useChat();

  const [input, setInput] = useState("");
  const [manualIndex, setManualIndex] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isLoading = status === "streaming" || status === "submitted";

  // Derivar dashboards de los mensajes
  const dashboards = useMemo<DashboardState[]>(() => {
    const result: DashboardState[] = [];
    for (const message of messages) {
      if (message.role !== "assistant") continue;

      // Rastrear consultas SQL por mensaje
      let sqlCount = 0;
      let lastSql: string | undefined;

      for (const part of message.parts) {
        if (!part.type.startsWith("tool-")) continue;
        const p = part as unknown as {
          type: string;
          state: string;
          input?: Record<string, unknown>;
          output?: Record<string, unknown>;
        };
        const toolName = p.type.slice(5);

        // Contar llamadas a executeSQL
        if (toolName === "executeSQL" && p.state === "output-available") {
          sqlCount++;
          // Extraer el SQL: input.query (el LLM lo genera) o output.sql (executeSQL lo devuelve)
          if (p.input?.query) {
            lastSql = p.input.query as string;
          } else if (p.output?.sql) {
            lastSql = p.output.sql as string;
          }
        }

        if (toolName !== "generateDashboard") continue;
        if (p.state !== "input-available" && p.state !== "output-available")
          continue;
        if (!p.input) continue;

        const spec = p.input as unknown as DashboardSpec;
        if (spec.title && spec.kpis) {
          result.push({ spec, timestamp: 0, queryCount: sqlCount, lastSQL: lastSql });
        }
      }
    }
    return result;
  }, [messages]);

  // Por defecto: último dashboard. Si hay manualIndex, usarlo.
  const currentDashboardIndex =
    manualIndex !== null && manualIndex < dashboards.length
      ? manualIndex
      : dashboards.length - 1;

  // Auto-scroll chat
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const navigateDashboard = useCallback(
    (direction: "prev" | "next") => {
      if (dashboards.length === 0) return;
      const newIdx =
        direction === "prev"
          ? Math.max(0, currentDashboardIndex - 1)
          : Math.min(dashboards.length - 1, currentDashboardIndex + 1);
      setManualIndex(newIdx);
    },
    [dashboards.length, currentDashboardIndex]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    const text = input.trim();
    setInput("");
    setManualIndex(null);
    await sendMessage({ text });
  };

  const handleSuggestion = async (question: string) => {
    setInput("");
    setManualIndex(null);
    await sendMessage({ text: question });
  };

  const hasMessages = messages.length > 0;

  return (
    <div className="flex h-screen bg-zinc-950 overflow-hidden">
      {/* LEFT PANEL — Chat */}
      <div className="flex w-[380px] flex-col border-r border-zinc-800/50 bg-zinc-900/30">
        {/* Header */}
        <div className="flex h-14 items-center justify-between border-b border-zinc-800/50 px-4">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-violet-600 to-pink-600" />
            <span className="text-sm font-semibold text-white">
              TRAID<span className="text-zinc-400">GOV</span>
            </span>
          </div>
          <span className="text-[10px] text-zinc-500">
            Analista Presupuestario
          </span>
        </div>

        {/* Messages or suggested questions */}
        <div className="flex-1 overflow-y-auto" ref={scrollRef}>
          {!hasMessages ? (
            <div className="flex flex-col items-center justify-center h-full px-4">
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="text-center"
              >
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-pink-600">
                  <svg
                    className="h-6 w-6 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5m.75-9 3-3 2.148 2.148A12.061 12.061 0 0 1 16.5 7.605"
                    />
                  </svg>
                </div>
                <h2 className="mb-1 text-base font-bold text-white">
                  Presupuesto Nacional
                </h2>
                <p className="mb-4 text-xs text-zinc-500">Argentina 2024</p>
                <div className="space-y-1.5">
                  {SUGGESTED_QUESTIONS.map((question, i) => (
                    <motion.button
                      key={i}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2, delay: 0.1 + i * 0.04 }}
                      onClick={() => handleSuggestion(question)}
                      className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-left text-xs text-zinc-400 transition-colors hover:border-violet-600/50 hover:text-zinc-200"
                    >
                      {question}
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            </div>
          ) : (
            <div className="px-3 py-4">
              <MessageList messages={messages} isLoading={isLoading} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-zinc-800/50 p-3">
          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Preguntá sobre el presupuesto..."
              aria-label="Pregunta sobre el presupuesto"
              disabled={isLoading}
              className="flex-1 border-zinc-800 bg-zinc-900/50 text-sm text-white placeholder:text-zinc-600 focus-visible:ring-violet-600"
            />
            <Button
              type="submit"
              disabled={isLoading || !input.trim()}
              size="sm"
              aria-label="Enviar mensaje"
              className="bg-gradient-to-r from-violet-600 to-pink-600 text-white hover:from-violet-700 hover:to-pink-700"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5"
                />
              </svg>
            </Button>
          </form>
          <p className="mt-1 text-center text-[9px] text-zinc-700">
            TRAID GOV — presupuestoabierto.gob.ar
          </p>
        </div>
      </div>

      {/* RIGHT PANEL — Dashboard */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-zinc-950">
        <DashboardPanel
          dashboards={dashboards}
          currentIndex={currentDashboardIndex}
          onNavigate={navigateDashboard}
        />
      </div>
    </div>
  );
}
