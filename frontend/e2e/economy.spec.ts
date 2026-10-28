import { test, expect } from "@playwright/test";
test("economy map periods, guided source and informative agenda", async ({
  page,
}) => {
  test.setTimeout(150000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/intelligence/widgets/*/data?*", (route) =>
    route.fulfill({ json: { status: "empty", kpis: [], source: "Fixture" } }),
  );
  await page.route("**/api/intelligence/news?*", (route) =>
    route.fulfill({ json: { items: [], source_errors: [] } }),
  );
  const calls: string[] = [];
  await page.route("**/api/economy/overview?*", (route) => {
    calls.push(route.request().url());
    return route.fulfill({
      json: {
        as_of: new Date().toISOString(),
        has_key: false,
        cached: false,
        notice: "Dados sintéticos de teste; origem e data explícitas.",
        stocks: Array.from({ length: 12 }, (_, i) => ({
          symbol: [
            "PETR4",
            "VALE3",
            "ITUB4",
            "BBDC4",
            "ABEV3",
            "WEGE3",
            "BBAS3",
            "SUZB3",
            "RENT3",
            "BPAC11",
            "PRIO3",
            "MGLU3",
          ][i],
          name: "Empresa de teste " + i,
          price: i < 4 ? 30 + i : null,
          change: i < 4 ? (i % 2 ? 2.4 : -1.3) : null,
          time: i < 4 ? "2026-10-28T18:00:00Z" : null,
          status: i < 4 ? "ok" : "needs_key",
        })),
        indicators: Object.fromEntries(
          ["selic", "usd", "pib", "ipca"].map((code, i) => [
            code,
            {
              status: "ok",
              source: code === "pib" ? "IBGE fixture" : "BCB fixture",
              frequency: code === "pib" ? "Trimestral" : "Diária",
              data_date: "2026-10-28",
              kpis: [
                {
                  label: code,
                  value: i + 1,
                  unit: code === "usd" ? "R$" : "%",
                },
              ],
              chart: {
                points: [
                  { label: "2026-09-01", value: 1 },
                  { label: "2026-10-01", value: 1.4 },
                  { label: "2026-10-28", value: 1.2 },
                ],
                series: [{ key: "value", name: code, color: "#93c5fd" }],
                unit: "%",
              },
            },
          ]),
        ),
      },
    });
  });
  await page.route("**/api/economy/stocks/*/history?*", (route) =>
    route.fulfill({
      json: {
        status: "ok",
        source: "brapi fixture",
        chart: {
          points: [
            { label: "2026-10-28T15:00:00Z", value: 30 },
            { label: "2026-10-28T16:00:00Z", value: 31 },
          ],
          series: [{ key: "value", name: "Preço", color: "#93c5fd" }],
          unit: "R$",
        },
        message: "Horários do provedor, fixture.",
      },
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
  await nav.getByRole("button", { name: "Economia", exact: true }).click();
  await expect(page.locator(".market-tile")).toHaveCount(12);
  await expect(page.locator(".market-tile.gain")).toHaveCount(2);
  await expect(page.locator(".market-tile.loss")).toHaveCount(2);
  await expect(page.locator(".market-tile.unavailable")).toHaveCount(8);
  await page
    .getByLabel("Período econômico", { exact: true })
    .selectOption("365");
  await page
    .getByLabel("Agrupamento econômico", { exact: true })
    .selectOption("month");
  await expect
    .poll(() => calls.some((u) => u.includes("days=365&interval=month")))
    .toBeTruthy();
  await page.screenshot({
    path: "test-results/economy-desktop.png",
    fullPage: true,
  });
  await page.locator(".market-tile").first().click();
  await page
    .getByLabel("Intervalo da ação", { exact: true })
    .selectOption("1h");
  await expect(
    page.getByRole("dialog").getByRole("img", { name: /Gráfico com/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Fechar ação", exact: true }).click();
  await nav.getByRole("button", { name: "Notícias", exact: true }).click();
  const sourceSelect = page.getByLabel("Fonte de notícias", { exact: true });
  await expect(sourceSelect.locator("option")).toHaveCount(3);
  await expect(sourceSelect).toContainText("Principal");
  await page.getByRole("button", { name: "Futebol", exact: true }).click();
  await expect(sourceSelect.locator("option")).toHaveCount(3);
  const alternative = await sourceSelect
    .locator("option")
    .filter({ hasText: "UOL" })
    .getAttribute("value");
  await sourceSelect.selectOption(alternative!);
  await expect(sourceSelect).toBeEnabled();
  const savedSources = await (
    await page.request.post("/api/sources/bootstrap", {
      headers: { Origin: "http://localhost:5173" },
    })
  ).json();
  expect(
    savedSources.find((s: { id: string }) => s.id === alternative).is_selected,
  ).toBeTruthy();
  await page.screenshot({
    path: "test-results/news-source-choices.png",
    fullPage: true,
  });

  await page.route("**/api/sources/preview", (route) =>
    route.fulfill({
      json: {
        resolved_url: "https://example.com/feed",
        title: "Fonte de teste",
        kind: "rss",
        items: [
          {
            title: "Manchete de teste do cadastro guiado",
            url: "https://example.com/noticia",
            date: "2026-10-28",
          },
        ],
      },
    }),
  );
  await page.route("**/api/sources", async (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 201,
          json: {
            id: "fixture-source",
            name: "Fonte de teste",
            category: "Futebol",
            url: "https://example.com/feed",
          },
        })
      : route.continue(),
  );
  await page
    .getByRole("button", { name: "Adicionar fonte · avançado", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Link da fonte", { exact: true }).fill("example.com");
  await dialog
    .getByRole("button", { name: "Identificar fonte", exact: true })
    .click();
  await dialog
    .getByLabel("Categoria da nova fonte", { exact: true })
    .fill("Futebol");
  await dialog
    .getByRole("button", { name: "Conferir prévia", exact: true })
    .click();
  await expect(dialog).toContainText("Manchete de teste do cadastro guiado");
  await dialog
    .getByRole("button", { name: "Adicionar fonte", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await nav.getByRole("button", { name: "Agenda", exact: true }).click();
  const day = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  await page.getByLabel("Ir para o dia", { exact: true }).fill(day);
  for (const [title, start, end] of [
    ["Reunião Alfa", "09:00", "10:00"],
    ["Reunião Beta", "09:30", "10:30"],
  ]) {
    await page
      .getByRole("button", { name: "Novo registro", exact: true })
      .click();
    dialog = page.getByRole("dialog");
    await dialog.getByLabel("Título", { exact: true }).fill(title);
    await dialog.getByLabel("Início", { exact: true }).fill(day + "T" + start);
    await dialog.getByLabel("Fim", { exact: true }).fill(day + "T" + end);
    await dialog
      .getByRole("button", { name: "Salvar registro", exact: true })
      .click();
  }
  await expect(page.locator(".agenda-conflict")).toHaveCount(2);
  await expect(page.locator(".agenda-summary")).toContainText("Compromissos");
  await expect(
    page.getByRole("heading", { name: "Próximos 7 dias", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Buscar registros da agenda", { exact: true })
    .fill("Alfa");
  await expect(page.locator(".calendar-item")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Duplicar para amanhã", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Início", { exact: true })).not.toHaveValue(
    day + "T09:00",
  );
  await dialog
    .getByRole("button", { name: "Salvar registro", exact: true })
    .click();
  await page.getByLabel("Buscar registros da agenda", { exact: true }).fill("");
  await page.screenshot({
    path: "test-results/agenda-panel-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  await nav.getByRole("button", { name: "Economia", exact: true }).click();
  await expect(page.locator(".sidebar")).not.toBeInViewport();
  await page.screenshot({
    path: "test-results/economy-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();

  // Exercise the real HTTP API: UI mocks alone missed numeric query validation.
  for (const query of ["days=7&interval=month", "days=1&interval=hour"]) {
    const response = await page.request.get("/api/economy/overview?" + query);
    expect(response.status(), await response.text()).toBe(200);
    expect((await response.json()).indicators).toHaveProperty("usd");
  }
  expect(errors).toEqual([]);
});
