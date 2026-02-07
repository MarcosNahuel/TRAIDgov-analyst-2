/**
 * ETL CODEX - Carga de IPC (indice mensual) para deflactar montos.
 *
 * Fuente por defecto: API de Series de Tiempo (datos.gob.ar)
 *   https://apis.datos.gob.ar/series/api/series/
 *
 * Default series id (INDEC - IPC Nivel General Nacional, base dic 2016):
 *   145.3_INGNACNAL_DICI_M_15
 *
 * Uso:
 *   npx tsx etl-codex/scripts/load-ipc.ts
 *   npx tsx etl-codex/scripts/load-ipc.ts --series-id 145.3_INGNACNAL_DICI_M_15
 */

import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { join } from "node:path";

import { formatScaledIntToMoney, parseArgs, parseMoneyToScaledInt } from "./_shared";

config({ path: join(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const DEFAULT_SERIES_ID = "145.3_INGNACNAL_DICI_M_15";
const DEFAULT_BASE = "dic-2016=100";
const DEFAULT_FUENTE = "apis.datos.gob.ar (INDEC)";

type SeriesResponse = {
  meta: {
    frequency?: string;
    start_date?: string;
    end_date?: string;
  };
  data: Array<[string, string]>;
};

async function upsertBatches(table: string, records: Record<string, unknown>[], onConflict: string) {
  const BATCH_SIZE = 1000;
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from(table).upsert(batch, { onConflict });
    if (error) throw new Error(`Upsert ${table} fallo: ${error.message}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const seriesId = String(args.get("series-id") ?? DEFAULT_SERIES_ID);

  const url = `https://apis.datos.gob.ar/series/api/series/?ids=${encodeURIComponent(
    seriesId
  )}&format=json`;

  console.log(`Descargando serie IPC: ${seriesId}`);
  console.log(`URL: ${url}`);

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  const json = (await res.json()) as SeriesResponse;
  const data = Array.isArray(json.data) ? json.data : [];

  if (!data.length) {
    console.warn("Serie sin datos. Verifica el series-id.");
    return;
  }

  const records = data
    .map(([periodo, valor]) => {
      // API devuelve strings con coma decimal (ej. "100,0").
      const scaled = parseMoneyToScaledInt(valor);
      return {
        periodo, // ya viene como YYYY-MM-01
        ipc_indice: formatScaledIntToMoney(scaled),
        fuente: DEFAULT_FUENTE,
        base: DEFAULT_BASE,
      };
    })
    .filter((r) => r.periodo && r.ipc_indice);

  console.log(`Registros IPC: ${records.length.toLocaleString("es-AR")}`);
  console.log(`Rango: ${records[0].periodo} -> ${records[records.length - 1].periodo}`);

  await upsertBatches("ipc_indice_mensual", records, "periodo");
  console.log("IPC cargado/actualizado.");
}

main().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});

