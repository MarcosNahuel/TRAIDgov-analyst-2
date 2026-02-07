import { streamText, stepCountIs, convertToModelMessages } from "ai";
import { getModel } from "@/lib/ai/config";
import { executeSQL, generateDashboard } from "@/lib/ai/tools";
import { getSystemPrompt } from "@/lib/ai/prompts";

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: getModel(),
    system: getSystemPrompt(),
    messages: await convertToModelMessages(messages),
    tools: {
      executeSQL,
      generateDashboard,
    },
    stopWhen: stepCountIs(5),
  });

  return result.toUIMessageStreamResponse();
}
