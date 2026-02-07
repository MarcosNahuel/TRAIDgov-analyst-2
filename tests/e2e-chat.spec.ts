import { test, expect } from "@playwright/test";

test.describe("TRAIDgov Analyst - Chat E2E", () => {
  test("pagina carga correctamente", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Presupuesto Nacional")).toBeVisible();
    await expect(page.locator("text=Dashboard")).toBeVisible();
    await expect(page.locator('[aria-label="Pregunta sobre el presupuesto"]')).toBeVisible();
  });

  test("sugerencias de preguntas son clickeables", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Presupuesto Nacional")).toBeVisible();
    // Las sugerencias son botones con texto de preguntas
    const suggestions = page.locator("button").filter({ hasText: /educacion|Salud|finalidad|subejecucion|mensual|transferencias/i });
    const count = await suggestions.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test("enviar pregunta y recibir respuesta del agente", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Presupuesto Nacional")).toBeVisible();

    // Interceptar POST /api/chat
    const chatResponsePromise = page.waitForResponse(
      (resp) => resp.url().includes("/api/chat") && resp.status() === 200,
      { timeout: 60_000 }
    );

    // Click en sugerencia de gasto mensual (pregunta simple)
    const suggestion = page.locator("button").filter({ hasText: /evolucion mensual/i }).first();
    await expect(suggestion).toBeVisible();
    await suggestion.click();

    // Esperar respuesta del API
    const chatResponse = await chatResponsePromise;
    expect(chatResponse.status()).toBe(200);

    // Esperar a que aparezca texto de respuesta del agente
    await page.waitForTimeout(20_000);
    await page.screenshot({ path: "qa-screenshots/e2e-respuesta-agente.png", fullPage: true });
  });

  test("enviar pregunta compleja de subejecucion", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("text=Presupuesto Nacional")).toBeVisible();

    const chatResponsePromise = page.waitForResponse(
      (resp) => resp.url().includes("/api/chat") && resp.status() === 200,
      { timeout: 60_000 }
    );

    const suggestion = page.locator("button").filter({ hasText: /subejecucion/i }).first();
    await expect(suggestion).toBeVisible();
    await suggestion.click();

    const chatResponse = await chatResponsePromise;
    expect(chatResponse.status()).toBe(200);

    await page.waitForTimeout(20_000);
    await page.screenshot({ path: "qa-screenshots/e2e-subejecucion.png", fullPage: true });
  });

  test("nueva conversacion funciona", async ({ page }) => {
    await page.goto("/");
    const newBtn = page.locator('button:has-text("Nueva")');
    await expect(newBtn).toBeVisible();
    await newBtn.click();
    await expect(page.locator("text=Presupuesto Nacional")).toBeVisible();
  });

  test("no hay errores de consola criticos en carga", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        if (
          !text.includes("favicon") &&
          !text.includes("GoTrue") &&
          !text.includes("Third-party cookie") &&
          !text.includes("DevTools")
        ) {
          errors.push(text);
        }
      }
    });

    await page.goto("/");
    await page.waitForTimeout(3000);
    expect(errors).toHaveLength(0);
  });

  test("responsive: mobile layout no tiene overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await page.waitForTimeout(2000);

    const hasOverflow = await page.evaluate(() => {
      const html = document.documentElement;
      return html.scrollWidth > html.clientWidth + 5;
    });

    expect(hasOverflow).toBe(false);
    await page.screenshot({ path: "qa-screenshots/e2e-mobile.png", fullPage: true });
  });

  test("input acepta texto y envia", async ({ page }) => {
    await page.goto("/");
    const input = page.locator('[aria-label="Pregunta sobre el presupuesto"]');
    await expect(input).toBeVisible();

    await input.fill("Cuanto se gasto en total en 2024?");
    await expect(input).toHaveValue("Cuanto se gasto en total en 2024?");

    // Boton enviar se habilita
    const sendBtn = page.locator('[aria-label="Enviar mensaje"]');
    await expect(sendBtn).toBeEnabled();
  });
});
