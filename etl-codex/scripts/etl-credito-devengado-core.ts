/**
 * ETL CODEX - Core multi-anio mensual (2014-2026)
 *
 * Fuente:
 *   https://dgsiaf-repo.mecon.gob.ar/repository/pa/datasets/{ANIO}/credito-mensual-{ANIO}.zip
 *
 * Output (DB):
 * - dims esenciales + historicos por anio (9 dims)
 * - fact agregada al grano CORE con `credito_devengado` + `credito_vigente`
 *
 * Uso:
 *   npx tsx etl-codex/scripts/etl-credito-devengado-core.ts --from 2019 --to 2025
 */

import { createClient } from "@supabase/supabase-js";
import { parse } from "csv-parse";
import { createReadStream, existsSync } from "node:fs";
import { join } from "node:path";
import crypto from "node:crypto";
import { config } from "dotenv";

import {
  detectDelimiter,
  downloadFile,
  ensureDir,
  extractZip,
  formatScaledIntToMoney,
  normalizeColumnName,
  parseArgs,
  parseMoneyToScaledInt,
} from "./_shared";

config({ path: join(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const RAW_DIR = join(process.cwd(), "etl-codex", "data", "raw");
const EXTRACT_DIR = join(process.cwd(), "etl-codex", "data", "extracted");
const BATCH_SIZE = 1000;
const KEY_SEP = "\u001f";

type Row = Record<string, string>;

// Grano: {devengado, vigente}
interface FactAgg {
  devengado: bigint;
  vigente: bigint;
}

function sha1(input: string) {
  return crypto.createHash("sha1").update(input).digest("hex");
}

function s(v: string | undefined | null, fallback = "0") {
  const x = (v ?? "").toString().trim();
  return x.length ? x : fallback;
}

function sDesc(v: string | undefined | null) {
  return (v ?? "").toString().trim();
}

async function upsertBatches<T extends Record<string, unknown>>(
  table: string,
  records: T[],
  onConflict: string
) {
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from(table).upsert(batch, { onConflict });
    if (error) throw new Error(`Upsert ${table} fallo: ${error.message}`);
  }
}

async function parseAndAggregateYear(csvPath: string, year: number) {
  const delimiter = detectDelimiter(csvPath);

  const factMap = new Map<string, FactAgg>(); // key -> sum(devengado, vigente)

  // Current dims
  const dimJur = new Map<string, string>();
  const dimServ = new Map<string, string>();
  const dimInc = new Map<string, string>();
  const dimGeo = new Map<string, string>();
  const dimProg = new Map<string, { servicio_id: string; programa_id: string; programa_desc: string }>();
  const dimSubprog = new Map<
    string,
    { servicio_id: string; programa_id: string; subprograma_id: string; subprograma_desc: string }
  >();
  const dimFinalidad = new Map<string, string>();
  const dimFuncion = new Map<string, { finalidad_id: string; funcion_id: string; funcion_desc: string }>();
  const dimFuente = new Map<string, string>();

  // Hist dims (by year)
  const dimJurHist = new Map<string, string>();
  const dimServHist = new Map<string, string>();
  const dimIncHist = new Map<string, string>();
  const dimGeoHist = new Map<string, string>();
  const dimProgHist = new Map<string, string>(); // servicio|programa -> desc
  const dimSubprogHist = new Map<string, string>(); // servicio|programa|subprograma -> desc
  const dimFinalidadHist = new Map<string, string>();
  const dimFuncionHist = new Map<string, string>(); // finalidad|funcion -> desc
  const dimFuenteHist = new Map<string, string>();

  let rowsTotal = 0;

  function clearAll() {
    rowsTotal = 0;
    factMap.clear();
    dimJur.clear();
    dimServ.clear();
    dimInc.clear();
    dimGeo.clear();
    dimProg.clear();
    dimSubprog.clear();
    dimFinalidad.clear();
    dimFuncion.clear();
    dimFuente.clear();
    dimJurHist.clear();
    dimServHist.clear();
    dimIncHist.clear();
    dimGeoHist.clear();
    dimProgHist.clear();
    dimSubprogHist.clear();
    dimFinalidadHist.clear();
    dimFuncionHist.clear();
    dimFuenteHist.clear();
  }

  async function runWithEncoding(encoding: BufferEncoding) {
    return new Promise<void>((resolve, reject) => {
      const parser = parse({
        delimiter,
        columns: (headers: string[]) => headers.map(normalizeColumnName),
        skip_empty_lines: true,
        relax_column_count: true,
        trim: true,
        bom: true,
      });

      createReadStream(csvPath, { encoding })
        .on("error", reject)
        .pipe(parser);

      parser.on("data", (row: Row) => {
        rowsTotal++;

        const mesNum = Number((row.impacto_presupuestario_mes ?? "").toString().trim());
        if (!Number.isFinite(mesNum) || mesNum < 1 || mesNum > 12) return;
        const mes = String(mesNum);

        const jurisdiccionId = s(row.jurisdiccion_id);
        const servicioId = s(row.servicio_id);
        const programaId = s(row.programa_id);
        const subprogramaId = s(row.subprograma_id);
        const incisoId = s(row.inciso_id);
        const ubicacionId = s(row.ubicacion_geografica_id);
        const finalidadId = s(row.finalidad_id);
        const funcionId = s(row.funcion_id);
        const fuenteId = s(row.fuente_financiamiento_id);

        // Metrics
        const devScaled = parseMoneyToScaledInt(row.credito_devengado);
        const vigScaled = parseMoneyToScaledInt(row.credito_vigente);

        if (devScaled !== BigInt(0) || vigScaled !== BigInt(0)) {
          const k = [
            mes,
            jurisdiccionId,
            servicioId,
            programaId,
            subprogramaId,
            incisoId,
            ubicacionId,
            finalidadId,
            funcionId,
            fuenteId,
          ].join(KEY_SEP);

          const existing = factMap.get(k);
          if (existing) {
            existing.devengado += devScaled;
            existing.vigente += vigScaled;
          } else {
            factMap.set(k, { devengado: devScaled, vigente: vigScaled });
          }
        }

        // Dimensions (desc) - original 6
        const jurisdiccionDesc = sDesc(row.jurisdiccion_desc);
        if (jurisdiccionDesc) {
          dimJur.set(jurisdiccionId, jurisdiccionDesc);
          dimJurHist.set(jurisdiccionId, jurisdiccionDesc);
        }

        const servicioDesc = sDesc(row.servicio_desc);
        if (servicioDesc) {
          dimServ.set(servicioId, servicioDesc);
          dimServHist.set(servicioId, servicioDesc);
        }

        const incisoDesc = sDesc(row.inciso_desc);
        if (incisoDesc) {
          dimInc.set(incisoId, incisoDesc);
          dimIncHist.set(incisoId, incisoDesc);
        }

        const geoDesc = sDesc(row.ubicacion_geografica_desc);
        if (geoDesc) {
          dimGeo.set(ubicacionId, geoDesc);
          dimGeoHist.set(ubicacionId, geoDesc);
        }

        const programaDesc = sDesc(row.programa_desc);
        if (programaDesc) {
          const pk = `${servicioId}${KEY_SEP}${programaId}`;
          dimProg.set(pk, { servicio_id: servicioId, programa_id: programaId, programa_desc: programaDesc });
          dimProgHist.set(pk, programaDesc);
        }

        const subprogramaDesc = sDesc(row.subprograma_desc);
        if (subprogramaDesc) {
          const pk = `${servicioId}${KEY_SEP}${programaId}${KEY_SEP}${subprogramaId}`;
          dimSubprog.set(pk, {
            servicio_id: servicioId,
            programa_id: programaId,
            subprograma_id: subprogramaId,
            subprograma_desc: subprogramaDesc,
          });
          dimSubprogHist.set(pk, subprogramaDesc);
        }

        // New 3 dimensions: finalidad, funcion, fuente
        const finalidadDesc = sDesc(row.finalidad_desc);
        if (finalidadDesc) {
          dimFinalidad.set(finalidadId, finalidadDesc);
          dimFinalidadHist.set(finalidadId, finalidadDesc);
        }

        const funcionDesc = sDesc(row.funcion_desc);
        if (funcionDesc) {
          const pk = `${finalidadId}${KEY_SEP}${funcionId}`;
          dimFuncion.set(pk, { finalidad_id: finalidadId, funcion_id: funcionId, funcion_desc: funcionDesc });
          dimFuncionHist.set(pk, funcionDesc);
        }

        const fuenteDesc = sDesc(row.fuente_financiamiento_desc);
        if (fuenteDesc) {
          dimFuente.set(fuenteId, fuenteDesc);
          dimFuenteHist.set(fuenteId, fuenteDesc);
        }
      });

      parser.on("end", () => resolve());
      parser.on("error", reject);
    });
  }

  try {
    await runWithEncoding("utf8");
  } catch (err) {
    console.warn(`  Parse fallo con utf8 (${String(err)}). Reintentando con latin1...`);
    clearAll();
    await runWithEncoding("latin1");
  }

  return {
    year,
    delimiter,
    rowsTotal,
    factMap,
    dimJur,
    dimServ,
    dimInc,
    dimGeo,
    dimProg,
    dimSubprog,
    dimFinalidad,
    dimFuncion,
    dimFuente,
    dimJurHist,
    dimServHist,
    dimIncHist,
    dimGeoHist,
    dimProgHist,
    dimSubprogHist,
    dimFinalidadHist,
    dimFuncionHist,
    dimFuenteHist,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const from = Number(args.get("from") ?? "2014");
  const to = Number(args.get("to") ?? "2026");

  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) {
    console.error("Args invalidos. Uso: --from 2014 --to 2026");
    process.exit(1);
  }

  ensureDir(RAW_DIR);
  ensureDir(EXTRACT_DIR);

  console.log(`ETL CORE devengado+vigente mensual: ${from}-${to}`);
  console.log(`Raw dir: ${RAW_DIR}`);
  console.log(`Extract dir: ${EXTRACT_DIR}`);

  for (let year = from; year <= to; year++) {
    console.log(`\n== ${year} ==`);
    const url = `https://dgsiaf-repo.mecon.gob.ar/repository/pa/datasets/${year}/credito-mensual-${year}.zip`;
    const zipPath = join(RAW_DIR, `credito-mensual-${year}.zip`);

    if (!existsSync(zipPath)) {
      console.log(`  Descargando ZIP...`);
      await downloadFile(url, zipPath);
      console.log(`  OK: ${zipPath}`);
    } else {
      console.log(`  ZIP cacheado: ${zipPath}`);
    }

    const yearDir = join(EXTRACT_DIR, String(year));
    const csvPath = extractZip(zipPath, yearDir);
    console.log(`  CSV: ${csvPath}`);

    const parsed = await parseAndAggregateYear(csvPath, year);
    console.log(`  Delimiter: ${parsed.delimiter === "\t" ? "TAB" : parsed.delimiter}`);
    console.log(`  Filas CSV procesadas: ${parsed.rowsTotal.toLocaleString("es-AR")}`);
    console.log(`  Filas CORE (keys unicas): ${parsed.factMap.size.toLocaleString("es-AR")}`);

    // -------------------------
    // Upsert dimensiones (actual)
    // -------------------------
    console.log(`  Upsert dims (actual)...`);
    await upsertBatches(
      "dim_jurisdiccion",
      [...parsed.dimJur.entries()].map(([jurisdiccion_id, jurisdiccion_desc]) => ({ jurisdiccion_id, jurisdiccion_desc })),
      "jurisdiccion_id"
    );
    await upsertBatches(
      "dim_servicio",
      [...parsed.dimServ.entries()].map(([servicio_id, servicio_desc]) => ({ servicio_id, servicio_desc })),
      "servicio_id"
    );
    await upsertBatches(
      "dim_inciso",
      [...parsed.dimInc.entries()].map(([inciso_id, inciso_desc]) => ({ inciso_id, inciso_desc })),
      "inciso_id"
    );
    await upsertBatches(
      "dim_ubicacion_geografica",
      [...parsed.dimGeo.entries()].map(([ubicacion_geografica_id, ubicacion_geografica_desc]) => ({
        ubicacion_geografica_id,
        ubicacion_geografica_desc,
      })),
      "ubicacion_geografica_id"
    );
    await upsertBatches("dim_programa", [...parsed.dimProg.values()], "servicio_id,programa_id");
    await upsertBatches("dim_subprograma", [...parsed.dimSubprog.values()], "servicio_id,programa_id,subprograma_id");

    // Nuevas dimensiones (actual)
    await upsertBatches(
      "dim_finalidad",
      [...parsed.dimFinalidad.entries()].map(([finalidad_id, finalidad_desc]) => ({ finalidad_id, finalidad_desc })),
      "finalidad_id"
    );
    await upsertBatches("dim_funcion", [...parsed.dimFuncion.values()], "finalidad_id,funcion_id");
    await upsertBatches(
      "dim_fuente_financiamiento",
      [...parsed.dimFuente.entries()].map(([fuente_financiamiento_id, fuente_financiamiento_desc]) => ({
        fuente_financiamiento_id,
        fuente_financiamiento_desc,
      })),
      "fuente_financiamiento_id"
    );

    // -------------------------
    // Upsert dimensiones (historico por anio)
    // -------------------------
    console.log(`  Upsert dims (hist ${year})...`);
    await upsertBatches(
      "dim_jurisdiccion_hist",
      [...parsed.dimJurHist.entries()].map(([jurisdiccion_id, jurisdiccion_desc]) => ({
        jurisdiccion_id,
        ejercicio_presupuestario: year,
        jurisdiccion_desc,
      })),
      "jurisdiccion_id,ejercicio_presupuestario"
    );
    await upsertBatches(
      "dim_servicio_hist",
      [...parsed.dimServHist.entries()].map(([servicio_id, servicio_desc]) => ({
        servicio_id,
        ejercicio_presupuestario: year,
        servicio_desc,
      })),
      "servicio_id,ejercicio_presupuestario"
    );
    await upsertBatches(
      "dim_inciso_hist",
      [...parsed.dimIncHist.entries()].map(([inciso_id, inciso_desc]) => ({
        inciso_id,
        ejercicio_presupuestario: year,
        inciso_desc,
      })),
      "inciso_id,ejercicio_presupuestario"
    );
    await upsertBatches(
      "dim_ubicacion_geografica_hist",
      [...parsed.dimGeoHist.entries()].map(([ubicacion_geografica_id, ubicacion_geografica_desc]) => ({
        ubicacion_geografica_id,
        ejercicio_presupuestario: year,
        ubicacion_geografica_desc,
      })),
      "ubicacion_geografica_id,ejercicio_presupuestario"
    );
    await upsertBatches(
      "dim_programa_hist",
      [...parsed.dimProgHist.entries()].map(([pk, programa_desc]) => {
        const [servicio_id, programa_id] = pk.split(KEY_SEP);
        return { servicio_id, programa_id, ejercicio_presupuestario: year, programa_desc };
      }),
      "servicio_id,programa_id,ejercicio_presupuestario"
    );
    await upsertBatches(
      "dim_subprograma_hist",
      [...parsed.dimSubprogHist.entries()].map(([pk, subprograma_desc]) => {
        const [servicio_id, programa_id, subprograma_id] = pk.split(KEY_SEP);
        return { servicio_id, programa_id, subprograma_id, ejercicio_presupuestario: year, subprograma_desc };
      }),
      "servicio_id,programa_id,subprograma_id,ejercicio_presupuestario"
    );

    // Nuevas dimensiones hist
    await upsertBatches(
      "dim_finalidad_hist",
      [...parsed.dimFinalidadHist.entries()].map(([finalidad_id, finalidad_desc]) => ({
        finalidad_id,
        ejercicio_presupuestario: year,
        finalidad_desc,
      })),
      "finalidad_id,ejercicio_presupuestario"
    );
    await upsertBatches(
      "dim_funcion_hist",
      [...parsed.dimFuncionHist.entries()].map(([pk, funcion_desc]) => {
        const [finalidad_id, funcion_id] = pk.split(KEY_SEP);
        return { finalidad_id, funcion_id, ejercicio_presupuestario: year, funcion_desc };
      }),
      "finalidad_id,funcion_id,ejercicio_presupuestario"
    );
    await upsertBatches(
      "dim_fuente_financiamiento_hist",
      [...parsed.dimFuenteHist.entries()].map(([fuente_financiamiento_id, fuente_financiamiento_desc]) => ({
        fuente_financiamiento_id,
        ejercicio_presupuestario: year,
        fuente_financiamiento_desc,
      })),
      "fuente_financiamiento_id,ejercicio_presupuestario"
    );

    // -------------------------
    // Upsert fact CORE
    // -------------------------
    console.log(`  Upsert fact CORE...`);
    const factRecords = Array.from(parsed.factMap.entries()).map(([k, agg]) => {
      const [mes, jurisdiccion_id, servicio_id, programa_id, subprograma_id, inciso_id, ubicacion_geografica_id, finalidad_id, funcion_id, fuente_financiamiento_id] =
        k.split(KEY_SEP);
      const row_hash = sha1(
        `${year}|${mes}|${jurisdiccion_id}|${servicio_id}|${programa_id}|${subprograma_id}|${inciso_id}|${ubicacion_geografica_id}|${finalidad_id}|${funcion_id}|${fuente_financiamiento_id}`
      );
      return {
        ejercicio_presupuestario: year,
        impacto_presupuestario_mes: Number(mes),
        jurisdiccion_id,
        servicio_id,
        programa_id,
        subprograma_id,
        inciso_id,
        ubicacion_geografica_id,
        finalidad_id,
        funcion_id,
        fuente_financiamiento_id,
        credito_devengado: formatScaledIntToMoney(agg.devengado),
        credito_vigente: formatScaledIntToMoney(agg.vigente),
        source_file: `credito-mensual-${year}`,
        row_hash,
      };
    });

    await upsertBatches("fact_credito_devengado_mensual", factRecords, "ejercicio_presupuestario,row_hash");

    console.log(`  OK ${year}: fact=${factRecords.length.toLocaleString("es-AR")}`);
  }

  console.log("\nETL completado.");
}

main().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});
