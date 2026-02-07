"use client";

import { Download } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { TableConfig } from "@/lib/types";

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "number") {
    if (Math.abs(value) >= 1_000_000) {
      return `$${(value / 1_000_000).toLocaleString("es-AR", { maximumFractionDigits: 1 })}M`;
    }
    return value.toLocaleString("es-AR", { maximumFractionDigits: 2 });
  }
  return String(value);
}

function generateCSV(table: TableConfig, keyMap: Map<string, string>): string {
  const headers = table.columns.join(",");
  const csvRows = table.rows.map((row) =>
    table.columns
      .map((col) => {
        const key = keyMap.get(col) ?? col;
        const val = row[key];
        if (val === null || val === undefined) return "";
        const str = String(val);
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      })
      .join(",")
  );
  return [headers, ...csvRows].join("\n");
}

function handleDownloadCSV(table: TableConfig, keyMap: Map<string, string>) {
  const csv = generateCSV(table, keyMap);
  const blob = new Blob(["\ufeff" + csv], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${table.title.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

interface DataTableExportProps {
  table: TableConfig;
}

export function DataTableExport({ table }: DataTableExportProps) {
  if (!table?.rows?.length) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <p className="text-sm text-zinc-400">Sin datos</p>
      </div>
    );
  }

  const columns = table.columns.length > 0 ? table.columns : Object.keys(table.rows[0]);

  // Mapear columnas display → keys reales de los rows
  const rowKeys = Object.keys(table.rows[0]);
  const strip = (s: string) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const columnToKey = new Map<string, string>();
  const usedKeys = new Set<string>();

  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    // 1. Exact match
    if (rowKeys.includes(col)) {
      columnToKey.set(col, col);
      usedKeys.add(col);
      continue;
    }
    // 2. Normalized match (sin acentos, case-insensitive, startsWith)
    const nc = strip(col);
    const match = rowKeys.find((k) => {
      if (usedKeys.has(k)) return false;
      const nk = strip(k);
      return nk === nc || nc.startsWith(nk) || nk.startsWith(nc);
    });
    if (match) {
      columnToKey.set(col, match);
      usedKeys.add(match);
      continue;
    }
    // 3. Fallback posicional: si hay misma cantidad de columnas que keys,
    //    asignar por posición (el LLM genera columns en mismo orden que rows)
    if (columns.length === rowKeys.length && i < rowKeys.length && !usedKeys.has(rowKeys[i])) {
      columnToKey.set(col, rowKeys[i]);
      usedKeys.add(rowKeys[i]);
    } else {
      columnToKey.set(col, col);
    }
  }

  return (
    <div className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div>
          <h3 className="text-sm font-medium text-zinc-300">{table.title}</h3>
          <p className="text-xs text-zinc-500">{table.rows.length} registros</p>
        </div>
        {table.downloadable && (
          <button
            onClick={() => handleDownloadCSV(table, columnToKey)}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-800"
          >
            <Download className="h-3 w-3" />
            CSV
          </button>
        )}
      </div>
      <ScrollArea className="max-h-[400px]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-zinc-900">
            <tr>
              {columns.map((col) => (
                <th
                  key={col}
                  className="whitespace-nowrap px-3 py-2 text-left text-xs font-medium uppercase tracking-wider text-zinc-400"
                >
                  {col.replace(/_/g, " ")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50">
            {table.rows.map((row, i) => (
              <tr key={i} className="transition-colors hover:bg-zinc-800/30">
                {columns.map((col) => {
                  const key = columnToKey.get(col) ?? col;
                  const val = row[key];
                  return (
                    <td
                      key={col}
                      className={`whitespace-nowrap px-3 py-2 ${
                        typeof val === "number"
                          ? "text-right font-mono text-emerald-400"
                          : "text-zinc-300"
                      }`}
                    >
                      {formatValue(val)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollArea>
    </div>
  );
}
