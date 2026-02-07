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

function generateCSV(table: TableConfig): string {
  const headers = table.columns.join(",");
  const csvRows = table.rows.map((row) =>
    table.columns
      .map((col) => {
        const val = row[col];
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

function handleDownloadCSV(table: TableConfig) {
  const csv = generateCSV(table);
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

  return (
    <div className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50">
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div>
          <h3 className="text-sm font-medium text-zinc-300">{table.title}</h3>
          <p className="text-xs text-zinc-500">{table.rows.length} registros</p>
        </div>
        {table.downloadable && (
          <button
            onClick={() => handleDownloadCSV(table)}
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
                {columns.map((col) => (
                  <td
                    key={col}
                    className={`whitespace-nowrap px-3 py-2 ${
                      typeof row[col] === "number"
                        ? "text-right font-mono text-emerald-400"
                        : "text-zinc-300"
                    }`}
                  >
                    {formatValue(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollArea>
    </div>
  );
}
