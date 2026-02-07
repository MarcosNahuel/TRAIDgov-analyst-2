/**
 * TRAIDgov Analyst - ETL: Presupuesto Nacional Argentina 2024
 *
 * Descarga el CSV de créditos de MECON, lo parsea y carga en Supabase
 * como star schema (1 fact table + 19 dimensions).
 *
 * Uso: npx tsx scripts/seed-database.ts [--local path/to/file.csv]
 */

import { createClient } from "@supabase/supabase-js";
import { parse } from "csv-parse";
import { createReadStream, createWriteStream, existsSync, mkdirSync } from "fs";
import { pipeline } from "stream/promises";
import { join } from "path";
import { Readable } from "stream";

// Cargar variables de entorno desde .env.local
import { config } from "dotenv";
config({ path: join(process.cwd(), ".env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const BATCH_SIZE = 500;
const DATA_DIR = join(process.cwd(), "data");
const CSV_URL = "https://dgsiaf-repo.mecon.gob.ar/repository/pa/datasets/2024/credito-anual-2024.zip";
const CSV_URL_MONTHLY = "https://dgsiaf-repo.mecon.gob.ar/repository/pa/datasets/2024/credito-mensual-2024.zip";

// ============================================================
// Mapeo de columnas CSV → campos del schema
// ============================================================

// Las columnas del CSV del MECON (pueden variar ligeramente entre años)
// Las columnas del CSV se normalizan automáticamente en el parser

// ============================================================
// Definición de dimensiones y sus columnas
// ============================================================

interface DimensionDef {
  table: string;
  idColumns: string[];
  descColumn: string;
  parentIdColumn?: string;
}

const DIMENSIONS: DimensionDef[] = [
  // Clasificador económico
  { table: "dim_inciso", idColumns: ["inciso_id"], descColumn: "inciso_desc" },
  { table: "dim_principal", idColumns: ["inciso_id", "principal_id"], descColumn: "principal_desc", parentIdColumn: "inciso_id" },
  { table: "dim_parcial", idColumns: ["principal_id", "parcial_id"], descColumn: "parcial_desc", parentIdColumn: "principal_id" },
  { table: "dim_subparcial", idColumns: ["parcial_id", "subparcial_id"], descColumn: "subparcial_desc", parentIdColumn: "parcial_id" },

  // Estructura administrativa
  { table: "dim_sector", idColumns: ["sector_id"], descColumn: "sector_desc" },
  { table: "dim_caracter", idColumns: ["caracter_id"], descColumn: "caracter_desc" },
  { table: "dim_jurisdiccion", idColumns: ["jurisdiccion_id"], descColumn: "jurisdiccion_desc" },
  { table: "dim_subjurisdiccion", idColumns: ["jurisdiccion_id", "subjurisdiccion_id"], descColumn: "subjurisdiccion_desc", parentIdColumn: "jurisdiccion_id" },
  { table: "dim_entidad", idColumns: ["subjurisdiccion_id", "entidad_id"], descColumn: "entidad_desc", parentIdColumn: "subjurisdiccion_id" },
  { table: "dim_servicio", idColumns: ["entidad_id", "servicio_id"], descColumn: "servicio_desc", parentIdColumn: "entidad_id" },

  // Estructura programática
  { table: "dim_programa", idColumns: ["servicio_id", "programa_id"], descColumn: "programa_desc", parentIdColumn: "servicio_id" },
  { table: "dim_subprograma", idColumns: ["programa_id", "subprograma_id"], descColumn: "subprograma_desc", parentIdColumn: "programa_id" },
  { table: "dim_proyecto", idColumns: ["subprograma_id", "proyecto_id"], descColumn: "proyecto_desc", parentIdColumn: "subprograma_id" },
  { table: "dim_actividad", idColumns: ["proyecto_id", "actividad_id"], descColumn: "actividad_desc", parentIdColumn: "proyecto_id" },
  { table: "dim_obra", idColumns: ["actividad_id", "obra_id"], descColumn: "obra_desc", parentIdColumn: "actividad_id" },

  // Estructura funcional
  { table: "dim_finalidad", idColumns: ["finalidad_id"], descColumn: "finalidad_desc" },
  { table: "dim_funcion", idColumns: ["finalidad_id", "funcion_id"], descColumn: "funcion_desc", parentIdColumn: "finalidad_id" },

  // Otras
  { table: "dim_fuente_financiamiento", idColumns: ["fuente_financiamiento_id"], descColumn: "fuente_financiamiento_desc" },
  { table: "dim_ubicacion_geografica", idColumns: ["ubicacion_geografica_id"], descColumn: "ubicacion_geografica_desc" },
];

// ============================================================
// Funciones auxiliares
// ============================================================

function generateUniqueId(row: Record<string, string>, idColumns: string[]): string {
  return idColumns.map((col) => (row[col] || "").toString().trim()).join("-");
}

function parseNumeric(value: string | undefined): number {
  if (!value) return 0;
  const cleaned = value.replace(/[^\d.,\-]/g, "").replace(",", ".");
  return parseFloat(cleaned) || 0;
}

function normalizeColumnName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .trim();
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  console.log(`  Descargando ${url}...`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

  const fileStream = createWriteStream(destPath);
  // @ts-expect-error - ReadableStream from fetch to NodeJS Readable
  await pipeline(Readable.fromWeb(response.body), fileStream);
  console.log(`  Descargado: ${destPath}`);
}

async function extractZip(zipPath: string, destDir: string): Promise<string> {
  // Usar unzip externo ya que Node no tiene soporte nativo de ZIP
  const { execSync } = await import("child_process");

  try {
    // Intentar con tar (disponible en Windows 10+)
    execSync(`tar -xf "${zipPath}" -C "${destDir}"`, { stdio: "pipe" });
  } catch {
    // Fallback: intentar con PowerShell
    execSync(
      `powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`,
      { stdio: "pipe" }
    );
  }

  // Buscar el CSV extraído
  const { readdirSync } = await import("fs");
  const files = readdirSync(destDir);
  const csvFile = files.find((f) => f.endsWith(".csv"));
  if (!csvFile) throw new Error("No se encontró archivo CSV en el ZIP");
  return join(destDir, csvFile);
}

// ============================================================
// Carga de datos
// ============================================================

async function loadDimension(
  dim: DimensionDef,
  allRows: Record<string, string>[]
): Promise<void> {
  const seen = new Set<string>();
  const records: Record<string, string>[] = [];

  for (const row of allRows) {
    const idUnico = generateUniqueId(row, dim.idColumns);
    if (!idUnico || idUnico === "-" || seen.has(idUnico)) continue;
    seen.add(idUnico);

    const record: Record<string, string> = { id_unico: idUnico };
    for (const col of dim.idColumns) {
      record[col] = (row[col] || "").trim();
    }
    record[dim.descColumn] = (row[dim.descColumn] || "").trim();
    records.push(record);
  }

  // Upsert en batches
  let loaded = 0;
  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from(dim.table).upsert(batch, {
      onConflict: "id_unico",
      ignoreDuplicates: true,
    });
    if (error) {
      console.error(`  Error en ${dim.table}: ${error.message}`);
      // Intentar uno por uno si falla el batch
      for (const record of batch) {
        const { error: singleError } = await supabase
          .from(dim.table)
          .upsert(record, { onConflict: "id_unico", ignoreDuplicates: true });
        if (!singleError) loaded++;
      }
    } else {
      loaded += batch.length;
    }
  }
  console.log(`  ✓ ${dim.table}: ${loaded} registros`);
}

async function loadFactTable(rows: Record<string, string>[]): Promise<void> {
  console.log(`\nCargando tabla de hechos: ${rows.length} registros...`);

  let loaded = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE).map((row) => ({
      ejercicio_presupuestario: parseInt(row.ejercicio_presupuestario) || 2024,
      jurisdiccion_id: (row.jurisdiccion_id || "").trim(),
      subjurisdiccion_id: (row.subjurisdiccion_id || "").trim(),
      entidad_id: (row.entidad_id || "").trim(),
      servicio_id: (row.servicio_id || "").trim(),
      programa_id: (row.programa_id || "").trim(),
      subprograma_id: (row.subprograma_id || "").trim(),
      proyecto_id: (row.proyecto_id || "").trim(),
      actividad_id: (row.actividad_id || "").trim(),
      obra_id: (row.obra_id || "").trim(),
      inciso_id: (row.inciso_id || "").trim(),
      principal_id: (row.principal_id || "").trim(),
      parcial_id: (row.parcial_id || "").trim(),
      subparcial_id: (row.subparcial_id || "").trim(),
      finalidad_id: (row.finalidad_id || "").trim(),
      funcion_id: (row.funcion_id || "").trim(),
      fuente_financiamiento_id: (row.fuente_financiamiento_id || "").trim(),
      ubicacion_geografica_id: (row.ubicacion_geografica_id || "").trim(),
      caracter_id: (row.caracter_id || "").trim(),
      sector_id: (row.sector_id || "").trim(),
      credito_presupuestado: parseNumeric(row.credito_presupuestado),
      credito_vigente: parseNumeric(row.credito_vigente),
      credito_comprometido: parseNumeric(row.credito_comprometido),
      credito_devengado: parseNumeric(row.credito_devengado),
      credito_pagado: parseNumeric(row.credito_pagado),
      source_file: "credito-anual-2024",
    }));

    const { error } = await supabase.from("presupuesto_nacion_2024").insert(batch);
    if (error) {
      console.error(`  Error batch ${i}-${i + BATCH_SIZE}: ${error.message}`);
      errors++;
    } else {
      loaded += batch.length;
    }

    if ((i / BATCH_SIZE) % 20 === 0) {
      console.log(`  Progreso: ${loaded}/${rows.length} (${Math.round((loaded / rows.length) * 100)}%)`);
    }
  }

  console.log(`\n✓ Tabla de hechos: ${loaded} registros cargados, ${errors} batches con error`);
}

// ============================================================
// Parseo del CSV
// ============================================================

async function parseCSV(csvPath: string): Promise<Record<string, string>[]> {
  console.log(`\nParseando CSV: ${csvPath}`);
  const rows: Record<string, string>[] = [];

  // Detectar separador y encoding leyendo las primeras líneas
  const { readFileSync } = await import("fs");
  const header = readFileSync(csvPath, "utf-8").split("\n")[0];

  // Determinar separador
  const separator = header.includes("\t") ? "\t" : header.includes(";") ? ";" : ",";
  console.log(`  Separador detectado: "${separator === "\t" ? "TAB" : separator}"`);

  return new Promise((resolve, reject) => {
    const parser = parse({
      delimiter: separator,
      columns: (headers: string[]) => {
        const normalized = headers.map(normalizeColumnName);
        console.log(`  Columnas encontradas: ${normalized.length}`);
        console.log(`  Primeras 10: ${normalized.slice(0, 10).join(", ")}`);
        return normalized;
      },
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
      bom: true,
    });

    createReadStream(csvPath, { encoding: "utf-8" })
      .on("error", () => {
        // Reintentar con latin1 si falla UTF-8
        console.log("  Reintentando con encoding latin1...");
        createReadStream(csvPath, { encoding: "latin1" })
          .pipe(parser)
          .on("error", reject);
      })
      .pipe(parser);

    parser.on("data", (row: Record<string, string>) => {
      rows.push(row);
    });

    parser.on("end", () => {
      console.log(`  Total filas parseadas: ${rows.length}`);
      resolve(rows);
    });

    parser.on("error", reject);
  });
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  TRAIDgov Analyst - ETL Presupuesto Nacional 2024");
  console.log("═══════════════════════════════════════════════════\n");

  // Determinar fuente de datos
  const args = process.argv.slice(2);
  let csvPath: string;

  if (args.includes("--local") && args[args.indexOf("--local") + 1]) {
    csvPath = args[args.indexOf("--local") + 1];
    if (!existsSync(csvPath)) {
      console.error(`Archivo no encontrado: ${csvPath}`);
      process.exit(1);
    }
    console.log(`Usando archivo local: ${csvPath}`);
  } else {
    // Descargar del MECON
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

    const zipPath = join(DATA_DIR, "credito-2024.zip");

    try {
      await downloadFile(CSV_URL, zipPath);
    } catch {
      console.log("  Archivo anual no disponible, intentando mensual...");
      await downloadFile(CSV_URL_MONTHLY, zipPath);
    }

    csvPath = await extractZip(zipPath, DATA_DIR);
  }

  // Parsear CSV
  const rows = await parseCSV(csvPath);

  if (rows.length === 0) {
    console.error("No se encontraron registros en el CSV");
    process.exit(1);
  }

  // Cargar dimensiones en orden jerárquico
  console.log("\n── Cargando dimensiones ──");
  for (const dim of DIMENSIONS) {
    await loadDimension(dim, rows);
  }

  // Cargar tabla de hechos
  console.log("\n── Cargando tabla de hechos ──");
  await loadFactTable(rows);

  // Verificación
  console.log("\n── Verificación ──");
  const { data: factCount } = await supabase
    .from("presupuesto_nacion_2024")
    .select("id", { count: "exact", head: true });
  console.log(`  Registros en tabla de hechos: ${factCount}`);

  const { data: jurisdicciones } = await supabase
    .from("dim_jurisdiccion")
    .select("jurisdiccion_desc");
  console.log(`  Jurisdicciones: ${jurisdicciones?.length || 0}`);
  if (jurisdicciones) {
    jurisdicciones.slice(0, 5).forEach((j) => console.log(`    - ${j.jurisdiccion_desc}`));
  }

  console.log("\n✓ ETL completado exitosamente!");
}

main().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});
