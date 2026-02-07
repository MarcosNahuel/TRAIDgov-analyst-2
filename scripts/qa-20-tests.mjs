/**
 * 20 QA Tests - TRAIDgov Analyst
 * Ejecuta 20 preguntas estratégicas via Playwright,
 * extrae datos del dashboard, valida resultados.
 *
 * Uso: node scripts/qa-20-tests.mjs
 * Requiere dev server corriendo en localhost:3000
 */

import { chromium } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SCREENSHOT_DIR = path.join(ROOT, "qa-screenshots", "20-tests");
const REPORT_PATH = path.join(ROOT, "qa-20-tests-report.md");
const BASE_URL = "http://localhost:3000";

const TESTS = [
  // Ya probadas manualmente (1 y 2), se re-validan
  { id: 1, q: "Cuánto gastó el Ministerio de Salud en 2024?", features: "KPIs, charts, tabla, narrativa", expect: { minKpis: 1, mustHaveChart: true } },
  { id: 2, q: "Top 10 programas con mayor ejecución presupuestaria", features: "Ranking bar, tabla 10 rows", expect: { minKpis: 2, mustHaveChart: true, minTableRows: 5 } },
  { id: 3, q: "Distribución del gasto por finalidad", features: "Pie/bar composición, KPIs %", expect: { minKpis: 1, mustHaveChart: true } },
  { id: 4, q: "Comparame gastos en personal vs transferencias", features: "Comparación bar agrupado", expect: { minKpis: 1, mustHaveChart: true } },
  { id: 5, q: "Qué jurisdicción tiene mayor subejecución?", features: "Análisis inverso, delta", expect: { minKpis: 1, mustHaveChart: true } },
  { id: 6, q: "Cuánto se destinó a cada provincia?", features: "Distribución geográfica", expect: { minKpis: 1, mustHaveChart: true } },
  { id: 7, q: "Cuál es el presupuesto de Defensa?", features: "Jurisdicción única", expect: { minKpis: 1, mustHaveChart: true } },
  { id: 8, q: "Top 5 programas con menor ejecución porcentual", features: "Ranking inverso", expect: { minKpis: 1, mustHaveChart: true } },
  { id: 9, q: "Distribución del gasto por inciso", features: "8 tipos de gasto, pie", expect: { minKpis: 1, mustHaveChart: true } },
  { id: 10, q: "Cuánto gastó Educación vs Salud?", features: "Head-to-head", expect: { minKpis: 1, mustHaveChart: true } },
  { id: 11, q: "Cuánto se pagó de deuda pública en 2024?", features: "Tema específico", expect: { minKpis: 1, mustHaveChart: true } },
  { id: 12, q: "Ranking de ministerios por presupuesto vigente", features: "Full ranking", expect: { minKpis: 1, mustHaveChart: true } },
  { id: 13, q: "Qué porcentaje del presupuesto nacional se ejecutó en 2024?", features: "Métrica agregada", expect: { minKpis: 1, mustHaveChart: true } },
  { id: 14, q: "Comparar crédito inicial vs vigente vs devengado total", features: "Multi-métrica", expect: { minKpis: 1, mustHaveChart: true } },
  { id: 15, q: "Cuáles son las obras públicas con mayor presupuesto?", features: "Filtro específico obras", expect: { minKpis: 1, mustHaveChart: true } },
  { id: 16, q: "Gasto en servicios sociales desglosado por programa", features: "Deep dive finalidad", expect: { minKpis: 1, mustHaveChart: true } },
  { id: 17, q: "Cuánto gastó el Ministerio de Economía en 2024?", features: "Otra jurisdicción", expect: { minKpis: 1, mustHaveChart: true } },
  { id: 18, q: "Cuánto se transfirió a universidades nacionales?", features: "Query específica educación", expect: { minKpis: 1, mustHaveChart: true } },
  { id: 19, q: "Resumen general del presupuesto nacional 2024", features: "Overview completo", expect: { minKpis: 1, mustHaveChart: true } },
  { id: 20, q: "Cuánto creció el presupuesto vigente respecto al inicial?", features: "Análisis ampliaciones", expect: { minKpis: 1, mustHaveChart: true } },
];

const results = [];

async function extractDashboardData(page) {
  return page.evaluate(() => {
    const r = {};

    // Título
    r.title = document.querySelector("h1")?.textContent || "NO TITLE";

    // KPIs
    const kpiPairs = Array.from(document.querySelectorAll("p")).filter((p) => {
      const next = p.nextElementSibling;
      return (
        next && next.tagName === "P" && p.parentElement?.children.length === 2
      );
    });
    r.kpis = kpiPairs.map((p) => ({
      label: p.textContent,
      value: p.nextElementSibling?.textContent,
    }));

    // Charts (h3 headings)
    r.charts = Array.from(document.querySelectorAll("h3"))
      .map((h) => h.textContent)
      .filter(
        (t) =>
          t !== "Análisis AI" &&
          !t.startsWith("Detalle") &&
          t.length > 3
      );

    // SVGs de Nivo (son los charts reales)
    r.svgCount = document.querySelectorAll("svg[role='img']").length;

    // Tables
    const tables = Array.from(document.querySelectorAll("table"));
    r.tables = tables.map((t) => {
      const headers = Array.from(t.querySelectorAll("th")).map(
        (th) => th.textContent
      );
      const rows = Array.from(t.querySelectorAll("tbody tr")).map((tr) =>
        Array.from(tr.querySelectorAll("td")).map((td) => td.textContent)
      );
      const dashRows = rows.filter((row) =>
        row.every((c) => c === "-")
      ).length;
      return {
        headers,
        rowCount: rows.length,
        firstRow: rows[0],
        dashRows,
      };
    });

    // Narrative
    r.narrativeTexts = Array.from(document.querySelectorAll("p"))
      .map((p) => p.textContent)
      .filter((t) => t.length > 80)
      .slice(0, 3);

    // Error boundaries
    r.hasErrorText = Array.from(document.querySelectorAll("p"))
      .some((p) => {
        const t = p.textContent?.toLowerCase() || "";
        return t.includes("something went wrong") || t.includes("error boundary");
      });

    r.bodyText = document.body.innerText?.length || 0;

    return r;
  });
}

function validateTest(test, data) {
  const issues = [];

  if (data.title === "NO TITLE" || data.title === "Dashboard") {
    issues.push("Dashboard no cargó (sin título)");
  }

  if (data.kpis.length < test.expect.minKpis) {
    issues.push(
      `KPIs insuficientes: ${data.kpis.length} < ${test.expect.minKpis}`
    );
  }

  // Verificar KPIs no vacíos
  const emptyKpis = data.kpis.filter(
    (k) => !k.value || k.value === "-" || k.value === "NaN"
  );
  if (emptyKpis.length > 0) {
    issues.push(`${emptyKpis.length} KPI(s) sin valor`);
  }

  if (test.expect.mustHaveChart && data.charts.length === 0) {
    issues.push("Sin gráficos");
  }

  if (test.expect.minTableRows) {
    const tableWithEnoughRows = data.tables.find(
      (t) => t.rowCount >= test.expect.minTableRows
    );
    if (!tableWithEnoughRows) {
      issues.push(
        `Tabla con menos rows de las esperadas (${test.expect.minTableRows})`
      );
    }
  }

  // Tablas con todas las celdas vacías
  for (const t of data.tables) {
    if (t.dashRows > 0) {
      issues.push(
        `Tabla tiene ${t.dashRows} fila(s) completamente vacías ("-")`
      );
    }
  }

  if (data.narrativeTexts.length === 0) {
    issues.push("Sin texto narrativo");
  }

  if (data.hasErrorText) {
    issues.push("Error boundary detectado");
  }

  return issues;
}

async function runTest(browser, test) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: "dark",
  });
  const page = await context.newPage();

  const result = {
    id: test.id,
    question: test.q,
    features: test.features,
    status: "FAIL",
    issues: [],
    data: null,
    consoleErrors: [],
    screenshotPath: "",
    duration: 0,
  };

  // Capturar errores
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      if (
        !text.includes("favicon") &&
        !text.includes("DevTools") &&
        !text.includes("Third-party") &&
        !text.includes("Download the React")
      ) {
        result.consoleErrors.push(text);
      }
    }
  });

  page.on("pageerror", (err) => {
    result.consoleErrors.push(`[UNCAUGHT] ${err.message}`);
  });

  const startTime = Date.now();

  try {
    // Navegar a homepage
    await page.goto(BASE_URL, { waitUntil: "load", timeout: 15000 });
    await page.waitForTimeout(1500);

    // Escribir la pregunta y enviar
    const input = page.getByRole("textbox", {
      name: "Pregunta sobre el presupuesto",
    });
    await input.fill(test.q);
    await page.waitForTimeout(300);

    const sendBtn = page.getByRole("button", { name: "Enviar mensaje" });
    await sendBtn.click();

    // Esperar respuesta del AI (máx 90s)
    try {
      await page.waitForSelector("h1", { timeout: 90000 });
    } catch {
      // Puede que no haya h1, continuar
    }
    await page.waitForTimeout(5000);

    // Extraer datos del dashboard
    result.data = await extractDashboardData(page);
    result.duration = Date.now() - startTime;

    // Validar
    result.issues = validateTest(test, result.data);

    if (result.issues.length === 0 && result.consoleErrors.length === 0) {
      result.status = "PASS";
    } else if (
      result.consoleErrors.some((e) => e.includes("UNCAUGHT")) ||
      result.issues.some((i) => i.includes("no cargó"))
    ) {
      result.status = "FAIL";
    } else {
      result.status =
        result.issues.length > 0 ? "WARN" : "PASS";
    }

    // Screenshot
    const screenshotFile = `test-${String(test.id).padStart(2, "0")}.png`;
    const screenshotPath = path.join(SCREENSHOT_DIR, screenshotFile);
    result.screenshotPath = `./qa-screenshots/20-tests/${screenshotFile}`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
  } catch (error) {
    result.issues.push(`Error: ${error.message}`);
    result.status = "FAIL";
    result.duration = Date.now() - startTime;

    try {
      const screenshotFile = `test-${String(test.id).padStart(2, "0")}-error.png`;
      const screenshotPath = path.join(SCREENSHOT_DIR, screenshotFile);
      result.screenshotPath = `./qa-screenshots/20-tests/${screenshotFile}`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
    } catch {}
  } finally {
    await context.close();
  }

  return result;
}

function generateReport(results) {
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  const pass = results.filter((r) => r.status === "PASS").length;
  const warn = results.filter((r) => r.status === "WARN").length;
  const fail = results.filter((r) => r.status === "FAIL").length;

  let md = `# QA Completo - 20 Tests - TRAIDgov Analyst

> Generado: ${now}
> Tests: ${results.length} | PASS: ${pass} | WARN: ${warn} | FAIL: ${fail}

## Resumen

| # | Pregunta | Estado | KPIs | Charts | Tabla | Tiempo |
|---|----------|--------|------|--------|-------|--------|
`;

  for (const r of results) {
    const kpiCount = r.data?.kpis?.length ?? 0;
    const chartCount = r.data?.charts?.length ?? 0;
    const tableInfo = r.data?.tables?.length
      ? `${r.data.tables[0].rowCount}r`
      : "-";
    const time = `${(r.duration / 1000).toFixed(1)}s`;
    const icon =
      r.status === "PASS" ? "PASS" : r.status === "WARN" ? "WARN" : "FAIL";
    const qShort =
      r.question.length > 45
        ? r.question.slice(0, 45) + "..."
        : r.question;
    md += `| ${r.id} | ${qShort} | ${icon} | ${kpiCount} | ${chartCount} | ${tableInfo} | ${time} |\n`;
  }

  md += "\n---\n\n## Detalle por Test\n\n";

  for (const r of results) {
    const icon =
      r.status === "PASS" ? "PASS" : r.status === "WARN" ? "WARN" : "FAIL";
    md += `### Test ${r.id}: ${icon}\n\n`;
    md += `- **Pregunta:** ${r.question}\n`;
    md += `- **Features:** ${r.features}\n`;
    md += `- **Dashboard:** ${r.data?.title || "N/A"}\n`;
    md += `- **Screenshot:** [Ver](${r.screenshotPath})\n`;
    md += `- **Tiempo:** ${(r.duration / 1000).toFixed(1)}s\n\n`;

    if (r.data?.kpis?.length) {
      md += "**KPIs:**\n";
      for (const k of r.data.kpis) {
        md += `- ${k.label}: **${k.value}**\n`;
      }
      md += "\n";
    }

    if (r.data?.charts?.length) {
      md += `**Charts:** ${r.data.charts.join(" | ")}\n\n`;
    }

    if (r.data?.tables?.length) {
      for (const t of r.data.tables) {
        md += `**Tabla:** ${t.headers.join(" | ")} (${t.rowCount} rows${t.dashRows > 0 ? `, ${t.dashRows} vacias` : ""})\n`;
        if (t.firstRow) md += `- Primera fila: ${t.firstRow.join(" | ")}\n`;
        md += "\n";
      }
    }

    if (r.issues.length > 0) {
      md += "**Issues:**\n";
      for (const i of r.issues) md += `- ${i}\n`;
      md += "\n";
    }

    if (r.consoleErrors.length > 0) {
      md += "**Console Errors:**\n```\n";
      for (const e of r.consoleErrors) md += `${e}\n`;
      md += "```\n\n";
    }

    md += "---\n\n";
  }

  md += `*Pipeline: 20 tests via Playwright Chromium en ${process.platform}*\n`;
  return md;
}

async function main() {
  console.log("=== QA 20 Tests - TRAIDgov Analyst ===\n");

  // Crear directorio
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  // Verificar server
  try {
    const res = await fetch(BASE_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    console.error(`[QA] Dev server no disponible en ${BASE_URL}: ${e.message}`);
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });

  const MAX_RETRIES = 2;
  for (const test of TESTS) {
    let result;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const label = attempt > 0 ? ` (retry ${attempt})` : "";
      console.log(`[TEST ${test.id}/20${label}] ${test.q.slice(0, 50)}...`);
      result = await runTest(browser, test);

      const icon = result.status === "PASS" ? "OK" : result.status === "WARN" ? "WARN" : "FAIL";
      const kpis = result.data?.kpis?.length ?? 0;
      const charts = result.data?.charts?.length ?? 0;
      console.log(`  ${icon} | ${result.data?.title?.slice(0, 40) || "N/A"} | KPIs:${kpis} Charts:${charts} | ${(result.duration / 1000).toFixed(1)}s`);
      if (result.issues.length > 0) {
        for (const i of result.issues) console.log(`  -> ${i}`);
      }

      // Si pasó o es solo WARN, no reintentar
      if (result.status !== "FAIL") break;
      if (attempt < MAX_RETRIES) console.log(`  Reintentando...\n`);
    }
    results.push(result);
    console.log();
  }

  await browser.close();

  // Generar reporte
  const report = generateReport(results);
  fs.writeFileSync(REPORT_PATH, report, "utf-8");
  console.log(`[QA] Reporte: ${REPORT_PATH}`);

  const pass = results.filter((r) => r.status === "PASS").length;
  const warn = results.filter((r) => r.status === "WARN").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  console.log(`\n=== RESULTADO: ${pass} PASS | ${warn} WARN | ${fail} FAIL ===`);

  if (fail > 0) process.exitCode = 1;
}

main().catch((err) => {
  console.error("[QA] Fatal:", err);
  process.exit(1);
});
