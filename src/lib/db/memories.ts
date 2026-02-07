import { createServerSupabaseClient } from "@/lib/db/supabase";

export async function loadMemories(): Promise<string[]> {
  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from("agent_memories")
    .select("content, category")
    .order("created_at", { ascending: false })
    .limit(20);

  if (!data || data.length === 0) return [];
  return data.map((m) => `[${m.category}] ${m.content}`);
}
