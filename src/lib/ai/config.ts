import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";

export function getModel() {
  const provider = process.env.AI_PROVIDER || "anthropic";

  if (provider === "google") {
    return google(process.env.AI_MODEL || "gemini-2.0-flash");
  }

  return anthropic(process.env.AI_MODEL || "claude-sonnet-4-5-20250929");
}
