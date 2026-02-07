"use client";

import { ScrollArea } from "@/components/ui/scroll-area";

interface DataTableProps {
  data: Record<string, unknown>[];
  title?: string;
}

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

export function DataTable({ data, title }: DataTableProps) {
  if (!data?.length) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
        <p className="text-sm text-zinc-400">Sin resultados</p>
      </div>
    );
  }

  const columns = Object.keys(data[0]);

  return (
    <div className="w-full rounded-lg border border-zinc-800 bg-zinc-900/50">
      {title && (
        <div className="border-b border-zinc-800 px-4 py-3">
          <h3 className="text-sm font-medium text-zinc-300">{title}</h3>
          <p className="text-xs text-zinc-500">{data.length} registros</p>
        </div>
      )}
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
            {data.map((row, i) => (
              <tr key={i} className="hover:bg-zinc-800/30 transition-colors">
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
