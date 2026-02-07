"use client";

import { useState, useEffect, useCallback } from "react";
import {
  createConversation,
  loadConversation,
  saveConversation,
  renameConversation,
  listConversations,
  deleteConversation,
} from "@/lib/db/conversations";
import type { ConversationMeta } from "@/lib/types";

const STORAGE_KEY = "traidgov_conversation_id";

export function useConversations() {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [initialMessages, setInitialMessages] = useState<unknown[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function init() {
      setIsLoading(true);
      try {
        const list = await listConversations();
        setConversations(list);

        const savedId = localStorage.getItem(STORAGE_KEY);
        if (savedId) {
          const conv = await loadConversation(savedId);
          if (conv && conv.messages.length > 0) {
            setConversationId(savedId);
            setInitialMessages(conv.messages);
          } else {
            const newId = await createConversation();
            localStorage.setItem(STORAGE_KEY, newId);
            setConversationId(newId);
            setInitialMessages(null);
          }
        } else {
          const newId = await createConversation();
          localStorage.setItem(STORAGE_KEY, newId);
          setConversationId(newId);
          setInitialMessages(null);
        }
      } catch {
        // Tablas no existen aun — modo efimero (sin persistencia)
        console.warn("Conversations table not available. Running in ephemeral mode.");
        setConversationId("ephemeral");
        setInitialMessages(null);
      }
      setIsLoading(false);
    }
    init();
  }, []);

  const startNew = useCallback(async () => {
    try {
      const newId = await createConversation();
      localStorage.setItem(STORAGE_KEY, newId);
      setConversationId(newId);
      setInitialMessages(null);
      const list = await listConversations();
      setConversations(list);
    } catch {
      setConversationId("ephemeral");
      setInitialMessages(null);
    }
  }, []);

  const continueConversation = useCallback(async (id: string) => {
    const conv = await loadConversation(id);
    if (!conv) return;
    localStorage.setItem(STORAGE_KEY, id);
    setConversationId(id);
    setInitialMessages(conv.messages);
  }, []);

  const rename = useCallback(async (id: string, title: string) => {
    await renameConversation(id, title);
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title } : c))
    );
  }, []);

  const remove = useCallback(async (id: string) => {
    await deleteConversation(id);
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (id === conversationId) {
      await startNew();
    }
  }, [conversationId, startNew]);

  const save = useCallback(
    async (messages: unknown[], opts?: { title?: string; lastInsight?: string }) => {
      if (!conversationId || conversationId === "ephemeral") return;
      try {
        await saveConversation(conversationId, messages, opts);
        const list = await listConversations();
        setConversations(list);
      } catch {
        // Silently fail if table not available
      }
    },
    [conversationId]
  );

  return {
    conversationId,
    conversations,
    initialMessages,
    isLoading,
    startNew,
    continueConversation,
    rename,
    remove,
    save,
  };
}
