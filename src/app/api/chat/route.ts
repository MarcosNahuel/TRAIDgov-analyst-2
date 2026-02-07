import { streamText, stepCountIs, convertToModelMessages } from "ai";
import { getModel } from "@/lib/ai/config";
import { executeSQL, generateDashboard, rememberFact } from "@/lib/ai/tools";
import { getSystemPrompt } from "@/lib/ai/prompts";
import { loadMemories } from "@/lib/db/memories";

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const memories = await loadMemories();

  const result = streamText({
    model: getModel(),
    system: getSystemPrompt(memories),
    messages: await convertToModelMessages(messages),
    tools: {
      executeSQL,
      generateDashboard,
      rememberFact,
    },
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
}
