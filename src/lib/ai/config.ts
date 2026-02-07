import { google } from "@ai-sdk/google";

export function getModel() {
  return google(process.env.AI_MODEL || "gemini-3-flash-preview");
}
