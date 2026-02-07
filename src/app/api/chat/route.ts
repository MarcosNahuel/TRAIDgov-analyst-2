import { streamText, stepCountIs, convertToModelMessages } from "ai";
import { getModel } from "@/lib/ai/config";
import { executeSQL, planQueries, generateDashboard, rememberFact } from "@/lib/ai/tools";
import { getSystemPrompt } from "@/lib/ai/prompts";
import { loadMemories } from "@/lib/db/memories";
import { createServerSupabaseClient } from "@/lib/db/supabase";

export const maxDuration = 30;

interface ToolTiming {
  name: string;
  latency_ms: number;
  success: boolean;
}

export async function POST(req: Request) {
  const { messages, id: conversationId } = await req.json();
  const t0 = performance.now();

  const memories = await loadMemories();

  // Extraer ultima pregunta del usuario
  const lastUserMessage = [...messages]
    .reverse()
    .find((m: { role: string; content: string }) => m.role === "user")?.content ?? "";

  let stepCount = 0;
  let tokensIn = 0;
  let tokensOut = 0;
  let hadError = false;
  let errorMessage = "";
  let dashboardGenerated = false;
  const toolTimings: ToolTiming[] = [];

  const result = streamText({
    model: getModel(),
    system: getSystemPrompt(memories),
    messages: await convertToModelMessages(messages),
    tools: {
      executeSQL,
      planQueries,
      generateDashboard,
      rememberFact,
    },
    stopWhen: stepCountIs(5),
    onStepFinish: ({ usage, toolCalls }) => {
      stepCount++;
      if (usage) {
        tokensIn += usage.inputTokens ?? 0;
        tokensOut += usage.outputTokens ?? 0;
      }
      // Registrar tool calls
      if (toolCalls) {
        for (const tc of toolCalls) {
          const toolName = tc.toolName ?? "unknown";
          toolTimings.push({
            name: toolName,
            latency_ms: 0,
            success: true,
          });
          if (toolName === "generateDashboard") {
            dashboardGenerated = true;
          }
        }
      }
    },
    onError: ({ error }) => {
      hadError = true;
      errorMessage = error instanceof Error ? error.message : String(error);
    },
  });

  // Fire-and-forget telemetry despues del stream
  const response = result.toUIMessageStreamResponse();

  // Insertar telemetria de forma asincrona (no bloquea el response)
  result.text.then(
    () => {
      const telemetry = {
        conversation_id: conversationId ?? null,
        user_query: lastUserMessage.slice(0, 500),
        t_total_ms: Math.round(performance.now() - t0),
        step_count: stepCount,
        tokens_input: tokensIn,
        tokens_output: tokensOut,
        tool_calls: toolTimings,
        had_error: hadError,
        error_message: errorMessage || null,
        dashboard_generated: dashboardGenerated,
        model_id: process.env.AI_MODEL || "gemini-3-flash-preview",
      };

      const supabase = createServerSupabaseClient();
      supabase
        .from("agent_telemetry")
        .insert(telemetry)
        .then(({ error }) => {
          if (error) console.warn("[telemetry] Insert failed:", error.message);
        });
    },
    () => {
      // Si el stream falla, no romper nada
    }
  );

  return response;
}
