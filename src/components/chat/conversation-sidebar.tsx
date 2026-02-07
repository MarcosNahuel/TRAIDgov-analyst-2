"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import type { ConversationMeta } from "@/lib/types";

interface ConversationSidebarProps {
  conversations: ConversationMeta[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const time = date.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });

  if (diffDays === 0) return `Hoy, ${time}`;
  if (diffDays === 1) return `Ayer, ${time}`;
  if (diffDays < 7) {
    const day = date.toLocaleDateString("es-AR", { weekday: "long" });
    return `${day.charAt(0).toUpperCase() + day.slice(1)}, ${time}`;
  }
  const short = date.toLocaleDateString("es-AR", { day: "numeric", month: "short" });
  return `${short}, ${time}`;
}

function ConversationItem({
  conv,
  isActive,
  onSelect,
  onRename,
  onDelete,
}: {
  conv: ConversationMeta;
  isActive: boolean;
  onSelect: () => void;
  onRename: (title: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(conv.title);
  const [showConfirm, setShowConfirm] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const handleSave = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== conv.title) {
      onRename(trimmed);
    }
    setEditing(false);
  };

  return (
    <div
      onClick={() => !editing && onSelect()}
      className={`group relative cursor-pointer rounded-lg px-3 py-2.5 transition-colors ${
        isActive
          ? "bg-violet-600/15 border border-violet-600/30"
          : "hover:bg-zinc-800/50 border border-transparent"
      }`}
    >
      {editing ? (
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
            if (e.key === "Escape") {
              setEditValue(conv.title);
              setEditing(false);
            }
          }}
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-white outline-none focus:border-violet-500"
        />
      ) : (
        <div className="text-xs font-medium text-zinc-200 truncate pr-12">
          {conv.title}
        </div>
      )}

      <div className="mt-1 flex items-center gap-1.5 text-[10px] text-zinc-500">
        <span>{formatDate(conv.updated_at)}</span>
        {conv.message_count > 0 && (
          <>
            <span>·</span>
            <span>{conv.message_count} msgs</span>
          </>
        )}
      </div>

      {conv.last_insight && (
        <div className="mt-1 text-[10px] text-zinc-600 truncate">
          {conv.last_insight}
        </div>
      )}

      {/* Action buttons */}
      {!editing && (
        <div className="absolute right-2 top-2 hidden gap-1 group-hover:flex">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setEditValue(conv.title);
              setEditing(true);
            }}
            className="rounded p-0.5 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300"
            title="Renombrar"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
            </svg>
          </button>
          {showConfirm ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
                setShowConfirm(false);
              }}
              className="rounded px-1 py-0.5 text-[9px] font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20"
            >
              Eliminar
            </button>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowConfirm(true);
                setTimeout(() => setShowConfirm(false), 3000);
              }}
              className="rounded p-0.5 text-zinc-500 hover:bg-zinc-700 hover:text-red-400"
              title="Eliminar"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function ConversationSidebar({
  conversations,
  activeId,
  onSelect,
  onNew,
  onRename,
  onDelete,
}: ConversationSidebarProps) {
  return (
    <div className="flex h-full w-[240px] flex-col border-r border-zinc-800/50 bg-zinc-900/50">
      {/* Header */}
      <div className="flex h-14 items-center justify-between border-b border-zinc-800/50 px-3">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-md bg-gradient-to-br from-violet-600 to-pink-600" />
          <span className="text-xs font-semibold text-white">
            TRAID<span className="text-zinc-400">GOV</span>
          </span>
        </div>
        <button
          onClick={onNew}
          className="rounded-md bg-violet-600/20 px-2 py-1 text-[10px] font-medium text-violet-300 transition-colors hover:bg-violet-600/30"
        >
          + Nueva
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <p className="text-xs text-zinc-600">No hay conversaciones</p>
            <button
              onClick={onNew}
              className="mt-2 text-xs text-violet-400 hover:text-violet-300"
            >
              Crear una
            </button>
          </div>
        ) : (
          conversations.map((conv) => (
            <motion.div
              key={conv.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.15 }}
            >
              <ConversationItem
                conv={conv}
                isActive={conv.id === activeId}
                onSelect={() => onSelect(conv.id)}
                onRename={(title) => onRename(conv.id, title)}
                onDelete={() => onDelete(conv.id)}
              />
            </motion.div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-zinc-800/50 px-3 py-2">
        <p className="text-center text-[9px] text-zinc-700">
          TRAID GOV · 2019-2025
        </p>
      </div>
    </div>
  );
}
