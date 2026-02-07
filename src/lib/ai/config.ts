import { google } from "@ai-sdk/google";
import { anthropic } from "@ai-sdk/anthropic";

export function getModel() {
  const provider = process.env.AI_PROVIDER || "google";

  if (provider === "anthropic") {
    return anthropic(process.env.AI_MODEL || "claude-sonnet-4-5-20250929");
  }

  return google(process.env.AI_MODEL || "gemini-2.5-flash");
}
