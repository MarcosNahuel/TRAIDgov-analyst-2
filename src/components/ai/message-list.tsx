"use client";

import type { UIMessage } from "ai";
import { motion } from "framer-motion";

interface MessageListProps {
  messages: UIMessage[];
  isLoading?: boolean;
}

export function MessageList({ messages, isLoading }: MessageListProps) {
  if (messages.length === 0) return null;

  return (
    <div className="space-y-3 pb-4">
      {messages.map((message, idx) => (
        <motion.div
          key={message.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: idx * 0.03 }}
          className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
        >
          <div
            className={`max-w-[90%] ${
              message.role === "user"
                ? "rounded-2xl rounded-br-sm bg-violet-600/20 px-3 py-2 text-violet-100"
                : "space-y-1"
            }`}
          >
            {message.parts.map((part, partIdx) => {
              if (part.type === "text" && part.text) {
                return (
                  <div
                    key={partIdx}
                    className={`text-sm leading-relaxed ${
                      message.role === "user" ? "" : "text-zinc-300"
                    }`}
                  >
                    {part.text.split("\n").map((line, i) => (
                      <p key={i} className="mb-1 last:mb-0">
                        {line}
                      </p>
                    ))}
                  </div>
                );
              }
              // Tool parts: mostrar indicadores de progreso
              if (part.type.startsWith("tool-")) {
                const toolName = part.type.slice(5);
                const p = part as unknown as { state: string };

                // Completado → no mostrar nada
                if (p.state === "output-available") {
                  return null;
                }

                // input-available para generateDashboard → no mostrar (no tiene execute)
                if (p.state === "input-available" && toolName === "generateDashboard") {
                  return null;
                }

                // Estados intermedios → mostrar indicador
                // input-streaming: LLM generando el input
                // input-available (executeSQL): query lista, ejecutándose en el server
                const label =
                  toolName === "executeSQL"
                    ? p.state === "input-streaming"
                      ? "Generando consulta SQL..."
                      : "Consultando datos..."
                    : toolName === "generateDashboard"
                      ? "Generando dashboard..."
                      : "Procesando...";

                return (
                  <div
                    key={partIdx}
                    className="flex items-center gap-2 py-1 text-xs text-zinc-500"
                  >
                    <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-violet-500" />
                    {label}
                  </div>
                );
              }
              return null;
            })}
          </div>
        </motion.div>
      ))}

      {isLoading && (
        <div className="flex justify-start">
          <div className="flex items-center gap-1.5 px-2 py-1">
            <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-500 [animation-delay:0ms]" />
            <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-500 [animation-delay:150ms]" />
            <div className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-500 [animation-delay:300ms]" />
          </div>
        </div>
      )}
    </div>
  );
}
