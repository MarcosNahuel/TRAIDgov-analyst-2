/**
 * Visual QA Pipeline - TRAIDgov Analyst
 *
 * Inicia el dev server, navega a cada ruta en múltiples viewports,
 * captura screenshots, recolecta errores de consola, analiza
 * rendimiento y genera un reporte markdown con debugging automático.
 *
 * Uso: node scripts/visual-qa.mjs
 */

import { chromium } from "@playwright/test";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SCREENSHOT_DIR = path.join(ROOT, "qa-screenshots");
const REPORT_PATH = path.join(ROOT, "qa-report.md");
const BASE_URL = "http://localhost:3000";
const DEV_SERVER_TIMEOUT = 60_000;
const PAGE_TIMEOUT = 30_000;

// Rutas a testear
const ROUTES = [
  { path: "/", name: "Homepage (Chat + Dashboard)", critical: true },
  { path: "/nonexistent-page", name: "404 Page", critical: false },
];

// Viewports a testear
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 375, height: 812 },
];

const results = [];

async function startDevServer() {
  console.log("[QA] Iniciando dev server...");
  const isWin = process.platform === "win32";

  // Limpiar lock file si quedó de una ejecución anterior
  const lockFile = path.join(ROOT, ".next", "dev", "lock");
  if (fs.existsSync(lockFile)) {
    try {
      fs.unlinkSync(lockFile);
    } catch {
      // Si no se puede borrar, continuar igual
    }
  }

  const server = spawn("npm", ["run", "dev"], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    shell: isWin,
    env: { ...process.env },
  });

  let serverOutput = "";
  let actualPort = 3000;

  server.stdout.on("data", (d) => {
    const text = d.toString();
    serverOutput += text;
    // Detectar si Next.js usa otro puerto
    const portMatch = text.match(/localhost:(\d+)/);
    if (portMatch) actualPort = parseInt(portMatch[1]);
  });
  server.stderr.on("data", (d) => {
    const text = d.toString();
    serverOutput += text;
    const portMatch = text.match(/localhost:(\d+)/);
    if (portMatch) actualPort = parseInt(portMatch[1]);
  });

  const start = Date.now();
  while (Date.now() - start < DEV_SERVER_TIMEOUT) {
    const url = `http://localhost:${actualPort}`;
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) {
        console.log(`[QA] Dev server listo en puerto ${actualPort}.`);
        return { process: server, port: actualPort };
      }
    } catch {
      // Server no listo todavía
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  server.kill();
  throw new Error(
    `Dev server no arrancó en ${DEV_SERVER_TIMEOUT / 1000}s.\nOutput: ${serverOutput.slice(-500)}`
  );
}

async function captureRoute(browser, route, viewport, baseUrl = BASE_URL) {
  const result = {
    url: `${baseUrl}${route.path}`,
    name: route.name,
    path: route.path,
    viewport: viewport.name,
    critical: route.critical,
    screenshotPath: "",
    consoleErrors: [],
    consoleWarnings: [],
    consoleLogs: [],
    networkErrors: [],
    networkRequests: [],
    httpStatus: null,
    pageTitle: "",
    issues: [],
    status: "PASS",
    performance: {},
    domInfo: {},
    debugInfo: [],
  };

  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    colorScheme: "dark",
  });
  const page = await context.newPage();

  // Capturar TODOS los mensajes de consola con ubicación
  page.on("console", (msg) => {
    const entry = {
      type: msg.type(),
      text: msg.text(),
      location: msg.location(),
    };
    if (entry.type === "error") {
      result.consoleErrors.push(entry);
    } else if (entry.type === "warning") {
      result.consoleWarnings.push(entry);
    } else {
      result.consoleLogs.push(entry);
    }
  });

  // Capturar errores JS no manejados con stack trace
  page.on("pageerror", (error) => {
    result.consoleErrors.push({
      type: "uncaught",
      text: error.message,
      stack: error.stack,
      location: {},
    });
  });

  // Capturar todos los requests/responses para debugging
  page.on("response", (response) => {
    const url = response.url().replace(baseUrl, "");
    const status = response.status();
    result.networkRequests.push({ url, status });
    if (status >= 400) {
      result.networkErrors.push(`${status} ${url}`);
    }
  });

  try {
    console.log(
      `[QA] ${route.path} [${viewport.name} ${viewport.width}x${viewport.height}]...`
    );

    // "load" en vez de "networkidle": el HMR de Next.js mantiene
    // un WebSocket permanente que impide que networkidle se cumpla
    const response = await page.goto(result.url, {
      waitUntil: "load",
      timeout: PAGE_TIMEOUT,
    });

    result.httpStatus = response?.status() ?? null;

    // Esperar hidratación de React + animaciones Framer Motion
    await page.waitForTimeout(3000);

    result.pageTitle = await page.title();

    // Métricas de rendimiento
    result.performance = await page.evaluate(() => {
      const perf = performance.getEntriesByType("navigation")[0];
      if (!perf) return {};
      return {
        domContentLoaded: Math.round(perf.domContentLoadedEventEnd),
        loadComplete: Math.round(perf.loadEventEnd),
        domInteractive: Math.round(perf.domInteractive),
        ttfb: Math.round(perf.responseStart - perf.requestStart),
      };
    });

    // Checks avanzados del DOM
    const checks = await page.evaluate(() => {
      const body = document.body;
      const html = document.documentElement;
      const bodyText = body.innerText?.trim() || "";
      const isBlank = bodyText.length < 10;
      const hasHorizontalOverflow = html.scrollWidth > html.clientWidth + 5;

      // Imágenes rotas
      const images = Array.from(document.querySelectorAll("img"));
      const brokenImages = images.filter(
        (img) => !img.complete || img.naturalWidth === 0
      );

      // Elementos visibles
      const allVisible = Array.from(document.querySelectorAll("*")).filter(
        (el) => {
          const s = window.getComputedStyle(el);
          return (
            s.display !== "none" &&
            s.visibility !== "hidden" &&
            s.opacity !== "0"
          );
        }
      );

      // Textos de error visibles
      const errorTexts = allVisible.filter((el) => {
        const t = el.textContent?.toLowerCase() || "";
        return (
          (t.includes("unhandled") ||
            t.includes("internal server error") ||
            t.includes("application error") ||
            t.includes("hydration")) &&
          el.children.length === 0
        );
      });

      // Detectar React error boundaries activos
      const errorBoundaries = allVisible.filter((el) => {
        const t = el.textContent?.toLowerCase() || "";
        return (
          (t.includes("something went wrong") ||
            t.includes("error boundary")) &&
          el.children.length === 0
        );
      });

      // Detectar elementos cortados (overflow hidden con contenido)
      const clippedElements = allVisible.filter((el) => {
        const s = window.getComputedStyle(el);
        if (s.overflow !== "hidden") return false;
        return (
          el.scrollHeight > el.clientHeight + 20 ||
          el.scrollWidth > el.clientWidth + 20
        );
      });

      // Z-index conflicts (elementos con z-index alto que podrían tapar otros)
      const highZIndex = allVisible
        .filter((el) => {
          const z = parseInt(window.getComputedStyle(el).zIndex);
          return z > 100;
        })
        .map((el) => ({
          tag: el.tagName,
          class: el.className?.toString().slice(0, 60),
          zIndex: parseInt(window.getComputedStyle(el).zIndex),
        }));

      // Accesibilidad básica
      const interactiveWithoutLabel = Array.from(
        document.querySelectorAll("button, input, a, textarea, select")
      ).filter((el) => {
        const label =
          el.getAttribute("aria-label") ||
          el.getAttribute("title") ||
          el.textContent?.trim();
        return !label || label.length === 0;
      });

      return {
        isBlank,
        hasHorizontalOverflow,
        brokenImageCount: brokenImages.length,
        brokenImageSrcs: brokenImages.map((i) => i.src).slice(0, 5),
        visibleErrorTexts: errorTexts
          .slice(0, 5)
          .map((el) => el.textContent?.slice(0, 200)),
        errorBoundaryTexts: errorBoundaries
          .slice(0, 3)
          .map((el) => el.textContent?.slice(0, 200)),
        bodyLength: bodyText.length,
        elementCount: allVisible.length,
        clippedCount: clippedElements.length,
        highZIndexElements: highZIndex.slice(0, 5),
        unlabeledInteractive: interactiveWithoutLabel.length,
      };
    });

    result.domInfo = checks;

    // Clasificar issues
    if (result.httpStatus >= 500) {
      result.issues.push(`HTTP ${result.httpStatus} - Server Error`);
      result.status = "FAIL";
    }

    if (checks.isBlank && route.critical) {
      result.issues.push(
        `Pagina en blanco (${checks.bodyLength} chars, ${checks.elementCount} elementos)`
      );
      result.status = "FAIL";
    }

    if (checks.hasHorizontalOverflow) {
      result.issues.push("Overflow horizontal detectado");
      result.status = result.status === "FAIL" ? "FAIL" : "WARN";
    }

    if (checks.brokenImageCount > 0) {
      result.issues.push(
        `${checks.brokenImageCount} imagen(es) rota(s): ${checks.brokenImageSrcs.join(", ")}`
      );
      result.status = result.status === "FAIL" ? "FAIL" : "WARN";
    }

    if (checks.visibleErrorTexts.length > 0) {
      result.issues.push(
        `Textos de error visibles: ${checks.visibleErrorTexts.join("; ")}`
      );
      result.status = result.status === "FAIL" ? "FAIL" : "WARN";
    }

    if (checks.errorBoundaryTexts.length > 0) {
      result.issues.push(
        `React Error Boundary activo: ${checks.errorBoundaryTexts.join("; ")}`
      );
      result.status = "FAIL";
    }

    if (checks.unlabeledInteractive > 0) {
      result.debugInfo.push(
        `${checks.unlabeledInteractive} elemento(s) interactivo(s) sin label accesible`
      );
    }

    if (checks.clippedCount > 3) {
      result.debugInfo.push(
        `${checks.clippedCount} elementos con contenido cortado (overflow:hidden)`
      );
    }

    // Filtrar errores de consola reales
    const criticalErrors = result.consoleErrors.filter(
      (e) =>
        !e.text.includes("favicon.ico") &&
        !e.text.includes("DevTools") &&
        !e.text.includes("Third-party cookie") &&
        !e.text.includes("Download the React DevTools")
    );

    if (criticalErrors.length > 0) {
      result.issues.push(
        `${criticalErrors.length} error(es) de consola critico(s)`
      );
      // Solo marcar FAIL si hay uncaught errors
      const hasUncaught = criticalErrors.some((e) => e.type === "uncaught");
      if (hasUncaught) {
        result.status = "FAIL";
      } else if (result.status !== "FAIL") {
        result.status = "WARN";
      }
    }

    if (result.issues.length === 0) {
      result.issues.push("Sin problemas detectados");
    }

    // Screenshot
    const safeName =
      route.path.replace(/\//g, "_").replace(/^_/, "") || "home";
    const screenshotFilename = `${safeName}-${viewport.name}.png`;
    const screenshotPath = path.join(SCREENSHOT_DIR, screenshotFilename);
    result.screenshotPath = `./qa-screenshots/${screenshotFilename}`;

    await page.screenshot({ path: screenshotPath, fullPage: true });

    const statusIcon =
      result.status === "PASS"
        ? "OK"
        : result.status === "WARN"
          ? "WARN"
          : "FAIL";
    console.log(
      `[QA]   ${statusIcon} ${route.path} [${viewport.name}] (${result.issues.join(", ")})`
    );
  } catch (error) {
    result.issues.push(`Error de navegacion: ${error.message}`);
    result.status = "FAIL";
    result.debugInfo.push(`Stack: ${error.stack?.slice(0, 500)}`);
    console.error(`[QA]   FAIL ${route.path} [${viewport.name}]: ${error.message}`);

    try {
      const safeName =
        route.path.replace(/\//g, "_").replace(/^_/, "") || "home";
      const screenshotFilename = `${safeName}-${viewport.name}-error.png`;
      const screenshotPath = path.join(SCREENSHOT_DIR, screenshotFilename);
      result.screenshotPath = `./qa-screenshots/${screenshotFilename}`;
      await page.screenshot({ path: screenshotPath, fullPage: true });
    } catch {
      // No se pudo capturar screenshot de error
    }
  } finally {
    await context.close();
  }

  return result;
}

function generateReport(results) {
  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  const passCount = results.filter((r) => r.status === "PASS").length;
  const warnCount = results.filter((r) => r.status === "WARN").length;
  const failCount = results.filter((r) => r.status === "FAIL").length;
  const statusIcon = { PASS: "PASS", WARN: "WARN", FAIL: "FAIL" };

  let md = `# QA Visual Report - TRAIDgov Analyst

> Generado: ${now}
> Capturas: ${results.length} (${ROUTES.length} rutas x ${VIEWPORTS.length} viewports)
> Resultados: ${passCount} PASS | ${warnCount} WARN | ${failCount} FAIL

## Resumen

| Ruta | Viewport | Estado | HTTP | Issues |
|------|----------|--------|------|--------|
`;

  for (const r of results) {
    md += `| \`${r.path}\` | ${r.viewport} | ${statusIcon[r.status]} | ${r.httpStatus ?? "N/A"} | ${r.issues[0] || "-"} |\n`;
  }

  md += "\n---\n\n## Detalle por Ruta\n\n";

  // Agrupar por ruta
  const byRoute = {};
  for (const r of results) {
    if (!byRoute[r.path]) byRoute[r.path] = [];
    byRoute[r.path].push(r);
  }

  for (const [routePath, routeResults] of Object.entries(byRoute)) {
    const worst = routeResults.reduce((a, b) => {
      const order = { FAIL: 0, WARN: 1, PASS: 2 };
      return order[a.status] <= order[b.status] ? a : b;
    });

    md += `### ${statusIcon[worst.status]} - ${worst.name} (\`${routePath}\`)\n\n`;

    for (const r of routeResults) {
      md += `#### ${r.viewport} (${r.viewport === "desktop" ? "1440x900" : r.viewport === "tablet" ? "768x1024" : "375x812"})\n\n`;
      md += `- **URL:** ${r.url}\n`;
      md += `- **HTTP Status:** ${r.httpStatus ?? "N/A"}\n`;
      md += `- **Titulo:** ${r.pageTitle || "(sin titulo)"}\n`;
      md += `- **Screenshot:** ${r.screenshotPath ? `[Ver](${r.screenshotPath})` : "N/A"}\n`;
      md += `- **Estado:** **${r.status}**\n`;

      // Performance
      if (r.performance && r.performance.loadComplete) {
        md += `- **Rendimiento:** TTFB ${r.performance.ttfb}ms | DOM ${r.performance.domContentLoaded}ms | Load ${r.performance.loadComplete}ms\n`;
      }

      // DOM info
      if (r.domInfo && r.domInfo.elementCount) {
        md += `- **DOM:** ${r.domInfo.elementCount} elementos visibles, ${r.domInfo.bodyLength} chars texto\n`;
      }

      md += "\n";

      if (r.issues.length > 0 && r.issues[0] !== "Sin problemas detectados") {
        md += "**Issues:**\n";
        for (const issue of r.issues) {
          md += `- ${issue}\n`;
        }
        md += "\n";
      }

      // Console errors con location
      const criticalErrors = r.consoleErrors.filter(
        (e) =>
          !e.text.includes("favicon.ico") &&
          !e.text.includes("DevTools") &&
          !e.text.includes("Third-party cookie") &&
          !e.text.includes("Download the React DevTools")
      );

      if (criticalErrors.length > 0) {
        md += "**Errores de consola:**\n```\n";
        for (const err of criticalErrors) {
          md += `[${err.type}] ${err.text}\n`;
          if (err.location?.url) {
            md += `  at ${err.location.url}:${err.location.lineNumber}:${err.location.columnNumber}\n`;
          }
          if (err.stack) {
            md += `  Stack: ${err.stack.split("\n").slice(0, 3).join("\n  ")}\n`;
          }
        }
        md += "```\n\n";
      }

      if (r.consoleWarnings.length > 0) {
        md += `**Warnings de consola:** ${r.consoleWarnings.length} warning(s)\n`;
        md += "```\n";
        for (const w of r.consoleWarnings.slice(0, 5)) {
          md += `${w.text}\n`;
        }
        if (r.consoleWarnings.length > 5) {
          md += `... y ${r.consoleWarnings.length - 5} mas\n`;
        }
        md += "```\n\n";
      }

      if (r.networkErrors.length > 0) {
        md += "**Errores de red:**\n```\n";
        for (const ne of r.networkErrors) {
          md += `${ne}\n`;
        }
        md += "```\n\n";
      }

      // Debug info
      if (r.debugInfo.length > 0) {
        md += "**Debug info:**\n";
        for (const d of r.debugInfo) {
          md += `- ${d}\n`;
        }
        md += "\n";
      }
    }

    md += "---\n\n";
  }

  // Diagnostico de FAILs
  const failures = results.filter((r) => r.status === "FAIL");
  if (failures.length > 0) {
    md += "## Diagnostico de Fallos Criticos\n\n";
    for (const f of failures) {
      md += `### ${f.name} [${f.viewport}]\n\n`;
      md += "**Problemas:**\n";
      for (const issue of f.issues) {
        md += `- ${issue}\n`;
      }
      md += "\n**Posibles causas:**\n";

      if (f.httpStatus >= 500) {
        md += "- Error del servidor: revisar `src/app/api/` y logs\n";
        md += "- Variables de entorno faltantes (.env.local)\n";
      }
      if (f.issues.some((i) => i.includes("blanco"))) {
        md += "- Hydration mismatch: verificar `use client` directives\n";
        md += "- Error en imports de componentes\n";
      }
      if (f.consoleErrors.some((e) => e.type === "uncaught")) {
        md += "- JS crash: revisar stack traces arriba\n";
      }
      if (f.issues.some((i) => i.includes("Error Boundary"))) {
        md += "- React Error Boundary capturó un error en render\n";
      }
      md += "\n";
    }
  }

  // Resumen de accesibilidad
  const a11yIssues = results.filter(
    (r) => r.domInfo?.unlabeledInteractive > 0
  );
  if (a11yIssues.length > 0) {
    md += "## Notas de Accesibilidad\n\n";
    for (const r of a11yIssues) {
      md += `- \`${r.path}\` [${r.viewport}]: ${r.domInfo.unlabeledInteractive} elemento(s) interactivo(s) sin label\n`;
    }
    md += "\n";
  }

  md += `---\n\n*Pipeline ejecutado con Playwright + Chromium en ${process.platform}*\n`;
  md += `*Script: \`node scripts/visual-qa.mjs\`*\n`;

  return md;
}

// Main
async function main() {
  console.log("=== TRAIDgov Visual QA Pipeline ===\n");

  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  // Limpiar screenshots anteriores del pipeline
  const cleanPatterns = ["home-", "nonexistent-"];
  const existingFiles = fs.readdirSync(SCREENSHOT_DIR);
  for (const file of existingFiles) {
    if (
      file.endsWith(".png") &&
      cleanPatterns.some((p) => file.startsWith(p))
    ) {
      fs.unlinkSync(path.join(SCREENSHOT_DIR, file));
    }
  }

  let serverInfo;
  try {
    serverInfo = await startDevServer();
    const baseUrl = `http://localhost:${serverInfo.port}`;
    const browser = await chromium.launch({ headless: true });

    for (const route of ROUTES) {
      for (const viewport of VIEWPORTS) {
        const result = await captureRoute(browser, route, viewport, baseUrl);
        results.push(result);
      }
    }

    await browser.close();

    const report = generateReport(results);
    fs.writeFileSync(REPORT_PATH, report, "utf-8");
    console.log(`\n[QA] Reporte generado: ${REPORT_PATH}`);

    const passCount = results.filter((r) => r.status === "PASS").length;
    const warnCount = results.filter((r) => r.status === "WARN").length;
    const failCount = results.filter((r) => r.status === "FAIL").length;
    console.log(
      `\n=== Resultado: ${passCount} PASS | ${warnCount} WARN | ${failCount} FAIL ===`
    );

    if (failCount > 0) {
      process.exitCode = 1;
    }
  } finally {
    if (serverInfo) {
      console.log("[QA] Deteniendo dev server...");
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", String(serverInfo.process.pid), "/T", "/F"], {
          stdio: "ignore",
        });
      } else {
        serverInfo.process.kill("SIGTERM");
      }
    }
  }
}

main().catch((err) => {
  console.error("[QA] Error fatal:", err);
  process.exit(1);
});
