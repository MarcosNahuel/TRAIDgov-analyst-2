import { createBrowserSupabaseClient } from "@/lib/db/supabase";
import type { ConversationMeta, Conversation } from "@/lib/types";

const supabase = () => createBrowserSupabaseClient();

export async function createConversation(): Promise<string> {
  const { data, error } = await supabase()
    .from("conversations")
    .insert({ title: "Nueva conversacion" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function loadConversation(id: string): Promise<Conversation | null> {
  const { data, error } = await supabase()
    .from("conversations")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return null;
  return data as Conversation;
}

export async function saveConversation(
  id: string,
  messages: unknown[],
  opts?: { title?: string; lastInsight?: string }
) {
  const update: Record<string, unknown> = {
    messages,
    message_count: messages.length,
    updated_at: new Date().toISOString(),
  };
  if (opts?.title) update.title = opts.title;
  if (opts?.lastInsight) update.last_insight = opts.lastInsight;

  await supabase().from("conversations").update(update).eq("id", id);
}

export async function renameConversation(id: string, title: string) {
  await supabase()
    .from("conversations")
    .update({ title, updated_at: new Date().toISOString() })
    .eq("id", id);
}

export async function listConversations(limit = 30): Promise<ConversationMeta[]> {
  const { data } = await supabase()
    .from("conversations")
    .select("id, title, last_insight, message_count, created_at, updated_at")
    .order("updated_at", { ascending: false })
    .limit(limit);
  return (data || []) as ConversationMeta[];
}

export async function deleteConversation(id: string) {
  await supabase().from("conversations").delete().eq("id", id);
}
