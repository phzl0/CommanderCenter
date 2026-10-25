import { test, expect } from "@playwright/test";
test("compact command center: five cards, news, calendar, files and exports", async ({
  page,
}) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const origin = { origin: "http://localhost:5173" };
  async function capture(name: string) {
    const dismiss = page
      .locator(".toast-stack")
      .getByRole("button", { name: "Dispensar notificação", exact: true });
    while (await dismiss.count()) await dismiss.first().click();
    if ((page.viewportSize()?.width || 1440) <= 760)
      await expect(page.locator(".sidebar")).not.toBeInViewport();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `test-results/${name}.png`, fullPage: true });
  }
  const kinds = new Map<string, string>();
  await page.route("**/api/intelligence/bootstrap", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    for (const w of body.widgets) kinds.set(w.id, w.kind);
    await route.fulfill({ response, json: body });
  });
  await page.route("**/api/intelligence/widgets/*/data?*", async (route) => {
    const kind = kinds.get(
      new URL(route.request().url()).pathname.split("/")[4],
    );
    if (kind === "github" || kind === "macro")
      return route.fulfill({
        json: {
          status: "ok",
          source: "Fixture",
          kpis: [{ label: "Indicador", value: 42 }],
          chart: {
            points: [
              { label: "Seg", value: 10 },
              { label: "Ter", value: 15 },
              { label: "Qua", value: 12 },
            ],
            series: [{ key: "value", name: "Valor", color: "#60a5fa" }],
            unit: "",
          },
        },
      });
    if (kind === "weather")
      return route.fulfill({
        json: {
          status: "ok",
          source: "Open-Meteo fixture",
          city: "Campinas, São Paulo, Brasil",
          weather: {
            temperature: 25,
            feels_like: 26,
            humidity: 60,
            precipitation: 0,
            wind: 12,
            code: 1,
            condition: "Parcialmente nublado",
            time: "2026-10-25T10:00",
            timezone: "America/Sao_Paulo",
            hours: Array.from({ length: 12 }, (_, i) => ({
              time: `2026-10-25T${String(10 + i).padStart(2, "0")}:00`,
              temperature: 25 + (i % 3),
              rain: 10,
              code: 1,
            })),
            days: [
              {
                date: "2026-10-25",
                max: 28,
                min: 18,
                rain: 10,
                code: 1,
                condition: "Parcialmente nublado",
              },
            ],
          },
        },
      });
    return route.continue();
  });
  const news = Array.from({ length: 12 }, (_, i) => ({
    title: `Manchete de teste ${i + 1}`,
    url: `https://example.com/news/${i}`,
    date: "2026-10-25",
    image: "https://example.com/photo.png",
    source: "Fonte de teste",
    category: "Economia",
    description: "Resumo sintético.",
  }));
  await page.route("**/api/intelligence/news?*", (route) =>
    route.fulfill({ json: { items: news, source_errors: [] } }),
  );
  await page.route("**/api/sources/image?*", (route) =>
    route.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFElEQVR4nGNs2nKJARtgwio6aCUAmPcCGBmvImEAAAAASUVORK5CYII=",
        "base64",
      ),
    }),
  );
  await page.route("**/api/intelligence/city-search?*", (route) =>
    route.fulfill({
      json: [
        {
          name: "Campinas",
          label: "Campinas, São Paulo, Brasil",
          latitude: -22.9,
          longitude: -47.1,
        },
      ],
    }),
  );
  await page.goto("/");
  await page.getByLabel("E-mail", { exact: true }).fill("e2e@example.test");
  await page
    .getByLabel("Senha", { exact: true })
    .fill("disposable-e2e-password");
  await page
    .getByRole("button", { name: "Entrar no meu espaço", exact: true })
    .click();
  const nav = page.getByRole("navigation", { name: "Navegação principal" });
  for (const label of ["Metas", "Tarefas", "Meu dia", "Relatórios"])
    await expect(
      nav.getByRole("button", { name: label, exact: true }),
    ).toHaveCount(0);
  await expect(page.locator(".intelligence-card")).toHaveCount(5);
  await expect(page.locator(".chart-loading")).toHaveCount(0);
  await expect(
    page.getByText("INTELLIGENCE WORKSPACE", { exact: true }),
  ).toHaveCount(0);
  const boxes = await page.locator(".intelligence-card").evaluateAll((cards) =>
    cards.map((c) => {
      const r = c.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }),
  );
  expect(boxes[0].y).toBeLessThan(210);
  expect(boxes[0].height).toBe(boxes[1].height);
  expect(boxes[4].width).toBeGreaterThan(boxes[0].width * 1.8);
  for (const card of await page.locator(".intelligence-card").all()) {
    const region = await card.boundingBox();
    const action = await card.locator(".card-detail-actions").boundingBox();
    expect(action!.y + action!.height).toBeLessThanOrEqual(
      region!.y + region!.height,
    );
  }
  await capture("dashboard-desktop");
  await page.getByRole("button", { name: "Personalizar", exact: true }).click();
  await expect(
    page.getByRole("dialog").locator(".widget-catalogue button").first(),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Ocultar Evolução das tarefas", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .locator(".widget-catalogue")
    .getByRole("button", { name: /Clima e previsão/ })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Cidade", { exact: true }).fill("Campinas, SP");
  await dialog
    .getByRole("button", { name: "Buscar cidade", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Campinas, São Paulo, Brasil", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Salvar painel", exact: true })
    .click();
  await expect(page.locator(".intelligence-card")).toHaveCount(5);
  await expect(
    page.getByLabel("Previsão por hora", { exact: true }),
  ).toBeVisible();
  await capture("weather-desktop");
  await nav.getByRole("button", { name: "Notícias", exact: true }).click();
  const carousel = page.getByRole("region", {
    name: "Carrossel de notícias",
    exact: true,
  });
  await expect(carousel.locator(".news-title")).toHaveText(
    "Manchete de teste 1",
  );
  await page.mouse.move(0, 0);
  await expect(carousel.locator(".news-title")).toHaveText(
    "Manchete de teste 2",
    { timeout: 4500 },
  );
  await expect(
    page.getByRole("button", { name: "Pausar notícias", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Manchetes", exact: true }),
  ).toBeVisible();
  await capture("news-desktop");
  await nav.getByRole("button", { name: "Agenda", exact: true }).click();
  await page
    .getByRole("button", { name: "Novo registro", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Título", { exact: true }).fill("Revisar orçamento");
  await dialog
    .getByRole("combobox", { name: "Tipo", exact: true })
    .selectOption("todo");
  await dialog.getByLabel("Início", { exact: true }).fill("2026-11-03T09:00");
  await dialog.getByLabel("Fim", { exact: true }).fill("2026-11-03T09:30");
  await dialog
    .getByRole("button", { name: "Salvar registro", exact: true })
    .click();
  await page.getByRole("button", { name: "Próximo mês", exact: true }).click();
  await page.getByRole("button", { name: /03\/11\/2026/ }).click();
  await expect(
    page.getByRole("heading", { name: "Revisar orçamento", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Concluir", exact: true }).click();
  await expect(page.locator(".calendar-item.completed")).toContainText(
    "Revisar orçamento",
  );
  await capture("calendar-desktop");
  await page.request.post("/api/projects", {
    headers: origin,
    data: { name: "Projeto de teste" },
  });
  await nav
    .getByRole("button", { name: "Dados e arquivos", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Importar arquivo", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.locator("input[type=file]").setInputFiles({
    name: "vendas.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("categoria;valor\nA;10\nA;20\nB;30\n"),
  });
  await dialog.getByRole("button", { name: "Importar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "vendas.csv", exact: true }),
  ).toBeVisible();
  await page.locator(".analysis-options summary").click();
  await page
    .getByRole("button", { name: "Adicionar", exact: true })
    .nth(1)
    .click();
  await page
    .getByLabel("Coluna do cálculo", { exact: true })
    .selectOption("valor");
  await page.getByLabel("Cálculo", { exact: true }).selectOption("sum");
  await page
    .getByRole("button", { name: "Executar análise", exact: true })
    .click();
  await expect(page.locator(".result-stats strong")).toHaveText("60");
  await page
    .getByRole("button", { name: "Salvar configuração", exact: true })
    .click();
  await page.locator(".analysis-options summary").click();
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "XLSX", exact: true }).click();
  expect((await downloading).suggestedFilename()).toMatch(/\.xlsx$/);
  await capture("data-desktop");
  await page.getByRole("button", { name: "Relatórios", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /Análise de vendas.csv/ }),
  ).toBeVisible();
  await nav
    .getByRole("button", { name: "Fontes e conexões", exact: true })
    .click();
  await expect(page.locator(".source-card")).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: "Ler depois", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Conexões", exact: true }).click();
  await expect(page.locator(".account-connection")).toHaveCount(3);
  await capture("connections-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  await nav.getByRole("button", { name: "Visão geral", exact: true }).click();
  await expect(nav).not.toBeInViewport();
  await capture("dashboard-mobile");
  await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  await nav.getByRole("button", { name: "Agenda", exact: true }).click();
  await capture("calendar-mobile");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
  expect(errors).toEqual([]);
});
