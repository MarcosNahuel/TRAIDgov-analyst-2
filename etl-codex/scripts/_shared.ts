import { execSync } from "node:child_process";
import { closeSync, createWriteStream, existsSync, mkdirSync, openSync, readdirSync, readSync } from "node:fs";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

export function ensureDir(path: string) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

export function normalizeColumnName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .trim();
}

export function detectDelimiter(filePath: string): string {
  // Read only the first chunk; don't load multi-hundred-MB CSVs into memory.
  const fd = openSync(filePath, "r");
  let firstLine = "";
  try {
    const buf = Buffer.alloc(64 * 1024);
    const bytes = readSync(fd, buf, 0, buf.length, 0);
    const snippet = buf.subarray(0, bytes).toString("utf8");
    firstLine = (snippet.split(/\r?\n/)[0] || "").toString();
  } finally {
    closeSync(fd);
  }

  if (firstLine.includes("\t")) return "\t";
  if (firstLine.includes(";")) return ";";
  return ",";
}

export async function downloadFile(url: string, destPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  ensureDir(dirname(destPath));
  // @ts-expect-error - ReadableStream from fetch -> Node Readable
  await pipeline(Readable.fromWeb(res.body), createWriteStream(destPath));
}

export function extractZip(zipPath: string, destDir: string): string {
  // Uses external tools because Node has no built-in ZIP support.
  ensureDir(destDir);

  try {
    // Windows 10+ includes bsdtar as "tar"
    execSync(`tar -xf "${zipPath}" -C "${destDir}"`, { stdio: "pipe" });
  } catch {
    execSync(
      `powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`,
      { stdio: "pipe" }
    );
  }

  const files = readdirSync(destDir);
  const csvFile = files.find((f) => f.toLowerCase().endsWith(".csv"));
  if (!csvFile) throw new Error(`No se encontro CSV en el ZIP: ${zipPath}`);
  return join(destDir, csvFile);
}

// ------------------------------------------------------------
// Numeric parsing (exact sums without floating point)
// Many CSV values are in the form "1234,5678" (comma decimal) and
// sometimes "1.234,56" (dot thousands + comma decimal).
// We parse into bigint scaled by 1e8 and format back to string.
// ------------------------------------------------------------

export const MONEY_SCALE = BigInt(8);
const MONEY_SCALE_FACTOR = BigInt(10) ** MONEY_SCALE; // 1e8

export function parseMoneyToScaledInt(raw: string | undefined | null): bigint {
  if (!raw) return BigInt(0);
  let s = raw.trim();
  if (!s) return BigInt(0);

  // Keep sign, digits, separators
  s = s.replace(/[^\d.,\-+]/g, "");
  if (!s) return BigInt(0);

  // If both separators exist, assume "." are thousands and "," is decimal.
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }

  let sign = BigInt(1);
  if (s.startsWith("-")) {
    sign = BigInt(-1);
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }

  const [intPartRaw, fracRaw = ""] = s.split(".");
  const intPart = intPartRaw ? BigInt(intPartRaw || "0") : BigInt(0);

  const fracPadded = (fracRaw + "00000000").slice(0, 8); // scale=8
  const fracPart = BigInt(fracPadded);

  return sign * (intPart * MONEY_SCALE_FACTOR + fracPart);
}

export function formatScaledIntToMoney(value: bigint): string {
  const sign = value < BigInt(0) ? "-" : "";
  const abs = value < BigInt(0) ? -value : value;
  const intPart = abs / MONEY_SCALE_FACTOR;
  const fracPart = abs % MONEY_SCALE_FACTOR;
  const frac = fracPart.toString().padStart(8, "0").replace(/0+$/, "");
  return frac.length ? `${sign}${intPart.toString()}.${frac}` : `${sign}${intPart.toString()}`;
}

// ------------------------------------------------------------
// CLI args
// ------------------------------------------------------------

export function parseArgs(argv: string[]) {
  const args = new Map<string, string | boolean>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args.set(key, true);
    } else {
      args.set(key, next);
      i++;
    }
  }
  return args;
}
