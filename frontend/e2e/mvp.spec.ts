import { test, expect } from "@playwright/test";
test("private workspace: management, spreadsheet analysis and export", async ({
  page,
}) => {
  test.setTimeout(180000);
  async function capture(name: string) {
    const dismiss = page
      .locator(".toast-stack")
      .getByRole("button", { name: "Dispensar notificação", exact: true });
    while (await dismiss.count()) await dismiss.first().click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: "test-results/" + name + ".png",
      fullPage: true,
    });
  }
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // External panels use explicit test fixtures; no reliance on public quotas or live prices.
  const externalIds = new Map<string, string>();
  await page.route("**/api/intelligence/bootstrap", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    for (const w of body.widgets || []) externalIds.set(w.id, w.kind);
    await route.fulfill({ response, json: body });
  });
  await page.route("**/api/intelligence/widgets/*/data?*", async (route) => {
    const id = new URL(route.request().url()).pathname.split("/")[4];
    const kind = externalIds.get(id);
    if (kind === "news") {
      await route.fulfill({
        json: {
          status: "ok",
          source: "Fontes de teste",
          as_of: new Date().toISOString(),
          kpis: [{ label: "Notícias", value: 1 }],
          items: [
            {
              title: "Manchete de demonstração",
              url: "https://example.com/noticia",
              date: "2026-10-24",
              source: "Fonte de teste",
              category: "Economia",
              description:
                "Resumo sintético para verificar a leitura no Command Center.",
              image: "https://example.com/photo.png",
            },
            {
              title: "Outra manchete de teste",
              url: "https://example.com/outra",
              date: "2026-10-24",
              source: "Fonte de teste",
              category: "Economia",
              image: "https://example.com/photo.png",
              description: "Segunda notícia sintética para testar o carrossel.",
            },
          ],
        },
      });
    } else if (kind === "weather") {
      await route.fulfill({
        json: {
          status: "ok",
          source: "Open-Meteo (fixture)",
          kpis: [],
          city: "Campinas, São Paulo, Brasil",
          weather: {
            temperature: 25,
            feels_like: 26,
            humidity: 60,
            wind: 12,
            code: 1,
            condition: "Predominantemente limpo",
            time: "2026-10-24T14:00",
            timezone: "America/Sao_Paulo",
            days: [
              {
                date: "2026-10-24",
                min: 18,
                max: 27,
                code: 1,
                condition: "Limpo",
                rain: 10,
              },
            ],
          },
        },
      });
    } else if (kind === "stock") {
      await route.fulfill({
        json: {
          status: "needs_config",
          message: "Fixture sem cotações reais",
          source: "Alpha Vantage",
          kpis: [],
        },
      });
    } else if (kind === "teams") {
      await route.fulfill({
        json: {
          status: "ok",
          source: "Microsoft To Do (fixture)",
          kpis: [{ label: "A fazer", value: 1 }],
          task_items: [
            {
              id: "t1",
              title: "Revisar tarefas de teste",
              completed: false,
              due: "",
              progress: 0,
            },
          ],
          chart: {
            points: [{ label: "A fazer", value: 1 }],
            series: [{ key: "value", name: "Tarefas", color: "#9d8bff" }],
            unit: "",
          },
        },
      });
    } else if (kind === "macro" || kind === "github") {
      await route.fulfill({
        json: {
          status: "ok",
          source: "Fixture de teste automatizado",
          message:
            "Dados sintéticos exclusivos do teste; não são cotações ou notícias reais.",
          as_of: new Date().toISOString(),
          chart: {
            points: [
              { label: "2026-10-22", value: 3 },
              { label: "2026-10-23", value: 5 },
              { label: "2026-10-24", value: 4 },
            ],
            series: [
              { key: "value", name: "Série de teste", color: "#5b9dff" },
            ],
            unit: "",
          },
          kpis: [{ label: "Amostra de teste", value: 4 }],
        },
      });
    } else await route.continue();
  });
  await page.route("**/api/sources/image?*", (route) =>
    route.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    }),
  );
  await page.route("**/api/intelligence/city-search?*", (route) =>
    route.fulfill({
      json: [
        {
          label: "Campinas, São Paulo, Brasil",
          latitude: -22.9,
          longitude: -47.06,
        },
      ],
    }),
  );
  await page.route("**/api/intelligence/company-search?*", (route) =>
    route.fulfill({
      json: {
        matches: [
          {
            symbol: "IBM",
            name: "International Business Machines",
            exchange: "United States",
            currency: "USD",
            verified: true,
          },
        ],
        message: "Resultado sintético do teste",
      },
    }),
  );
  await page.route("**/api/intelligence/widgets", async (route) => {
    const response = await route.fetch();
    if (route.request().method() === "POST") {
      const widget = await response.json();
      externalIds.set(widget.id, widget.kind);
    }
    await route.fulfill({ response });
  });
  await page.route("**/api/integrations", (route) =>
    route.fulfill({
      json: {
        github: { configured: true, connected: true, account: "conta-teste" },
        microsoft: {
          configured: true,
          connected: true,
          account: "conta-teste",
        },
      },
    }),
  );
  await page.route("**/api/integrations/github/repositories?*", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            name: "phzl0/CommanderCenter",
            description: "Repositório de teste",
          },
        ],
        has_more: false,
      },
    }),
  );
  await page.route("**/api/integrations/microsoft/lists", (route) =>
    route.fulfill({ json: [{ id: "list-test", name: "Lista de teste" }] }),
  );
  await page.goto("/");
  await page.getByLabel("E-mail", { exact: true }).fill("e2e@example.test");
  await page
    .getByLabel("Senha", { exact: true })
    .fill("disposable-e2e-password");
  await page.getByRole("button", { name: "Entrar no meu espaço" }).click();
  await expect(
    page.getByRole("heading", { name: "Visão geral." }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Visão geral." }),
  ).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Navegação principal" });
  await expect(
    nav.getByRole("button", { name: "Projetos", exact: true }),
  ).toHaveCount(0);
  await expect(
    nav.getByRole("button", { name: "Atividades", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".intelligence-card")).toHaveCount(4);
  await expect(page.locator(".chart-loading")).toHaveCount(0);
  const boxes = await page.locator(".intelligence-card").evaluateAll((cards) =>
    cards.map((c) => {
      const r = c.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    }),
  );
  expect(boxes[0].height).toBe(400);
  expect(boxes[1].height).toBe(400);
  expect(boxes[0].width).toBe(boxes[1].width);
  expect(boxes[2].height).toBe(820);
  expect(boxes[2].x).toBeGreaterThan(boxes[0].x);
  expect(boxes[3].width).toBeGreaterThan(boxes[0].width);
  const carousel = page.getByRole("region", {
    name: "Carrossel de notícias",
    exact: true,
  });
  await page.mouse.move(0, 0);
  await expect(carousel.locator(".news-title")).toHaveText(
    "Outra manchete de teste",
    { timeout: 10000 },
  );
  await carousel
    .getByRole("button", { name: "Pausar notícias", exact: true })
    .click();
  await carousel
    .getByRole("button", { name: "Notícia anterior", exact: true })
    .click();
  await expect(carousel.locator(".news-title")).toHaveText(
    "Manchete de demonstração",
  );
  await expect(
    carousel.getByRole("img", {
      name: "Manchete de demonstração",
      exact: true,
    }),
  ).toBeVisible();
  await capture("layout-four-desktop");
  await page.getByRole("button", { name: "Personalizar", exact: true }).click();
  await page
    .getByLabel("Quantidade de cards", { exact: true })
    .selectOption("12");
  await page
    .getByRole("button", { name: "Fechar personalização", exact: true })
    .click();
  const project = await page.request.post("/api/projects", {
    headers: { origin: "http://localhost:5173" },
    data: { name: "Projeto de teste" },
  });
  expect(project.ok()).toBeTruthy();
  let dialog = page.getByRole("dialog");
  await nav.getByRole("button", { name: "Tarefas", exact: true }).click();
  await page.getByRole("button", { name: "Nova tarefa", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Título", { exact: true }).fill("Entrega de teste");
  await dialog
    .getByRole("combobox", { name: "Projeto", exact: true })
    .selectOption({ label: "Projeto de teste" });
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Entrega de teste", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Concluir tarefa", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Reabrir tarefa", exact: true }),
  ).toBeVisible();
  const history = await page.request.get("/api/activities");
  expect(
    (await history.json()).items.some(
      (a: { description: string }) =>
        a.description === "Tarefa concluída: Entrega de teste",
    ),
  ).toBeTruthy();
  await nav
    .getByRole("button", { name: "Dados e análises", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Importar planilha", exact: true })
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
  await expect(
    page.getByRole("button", { name: "XLSX", exact: true }),
  ).toBeVisible();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "XLSX", exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
  await nav.getByRole("button", { name: "Relatórios", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /Análise de vendas.csv/ }),
  ).toBeVisible();
  await nav.getByRole("button", { name: "Visão geral", exact: true }).click();

  await page
    .locator(".dashboard-actions")
    .getByRole("button", { name: "Registrar dados", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Atividade", { exact: true })
    .fill("Estudo de programação");
  await dialog.getByLabel("Tempo em minutos", { exact: true }).fill("60");
  await dialog
    .getByRole("button", { name: "Salvar registro", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toBeVisible();
  await dialog.getByRole("button", { name: "Financeiro", exact: true }).click();
  await dialog
    .getByLabel("Descrição", { exact: true })
    .fill("Receita de teste");
  await dialog
    .getByRole("combobox", { name: "Tipo financeiro", exact: true })
    .selectOption("income");
  await dialog.getByLabel("Valor em reais", { exact: true }).fill("1000");
  await dialog.getByLabel("Categoria", { exact: true }).fill("Trabalho");
  await dialog
    .getByRole("button", { name: "Salvar registro", exact: true })
    .click();
  await expect(dialog.getByRole("status")).toBeVisible();
  await dialog
    .getByRole("button", { name: "Fechar registros", exact: true })
    .click();
  const personal = page.getByRole("region", {
    name: "Minha atividade pessoal",
    exact: true,
  });
  await expect(
    personal.getByRole("img", { name: /Gráfico com/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Personalizar", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", {
      name: "Ocultar Desenvolvimento no GitHub",
      exact: true,
    })
    .click();
  await dialog
    .getByRole("button", { name: "Subir Minha atividade pessoal", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Fechar personalização", exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByRole("region", {
      name: "Desenvolvimento no GitHub",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page
      .locator(".intelligence-card")
      .first()
      .getByRole("heading", { name: "Minha atividade pessoal", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Personalizar", exact: true }).click();
  await page
    .getByRole("dialog")
    .locator(".widget-catalogue")
    .getByRole("button", { name: /Gráfico de planilha/ })
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Título do painel", { exact: true })
    .fill("Minha planilha");
  await dialog
    .getByRole("combobox", { name: "Análise salva", exact: true })
    .selectOption({ label: "Análise de vendas.csv" });
  await dialog
    .getByRole("combobox", { name: "Eixo horizontal", exact: true })
    .selectOption("categoria");
  await dialog
    .getByRole("combobox", { name: "Coluna de valores", exact: true })
    .selectOption("valor");
  await dialog
    .getByRole("button", { name: "Salvar painel", exact: true })
    .click();
  await expect(
    page
      .getByRole("region", { name: "Minha planilha", exact: true })
      .getByRole("img", { name: /Gráfico com/ }),
  ).toBeVisible();
  const newTab = page.waitForEvent("popup");
  await personal
    .getByRole("link", {
      name: "Abrir em nova aba: Minha atividade pessoal",
      exact: true,
    })
    .click();
  const detailTab = await newTab;
  await expect(
    detailTab.getByRole("heading", { name: "Dados do gráfico", exact: true }),
  ).toBeVisible();
  await detailTab.close();
  await expect(
    page.getByText("Ver dados do gráfico", { exact: true }),
  ).toHaveCount(0);
  await personal
    .getByRole("link", { name: "Ver detalhes", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Dados do gráfico", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Dados do gráfico", exact: true }),
  ).toBeVisible();
  await capture("detail-desktop");
  await nav.getByRole("button", { name: "Visão geral", exact: true }).click();
  const news = page.getByRole("region", {
    name: "Radar de notícias",
    exact: true,
  });
  await expect(news.locator(".news-feed")).toBeVisible();
  await expect(news.getByRole("img", { name: /Gráfico com/ })).toHaveCount(0);
  await news
    .getByRole("button", { name: "Pausar notícias", exact: true })
    .click();
  if (
    (await news.locator(".news-title").textContent()) !==
    "Manchete de demonstração"
  )
    await news
      .getByRole("button", { name: "Notícia anterior", exact: true })
      .click();
  await news
    .getByRole("button", {
      name: "Salvar notícia: Manchete de demonstração",
      exact: true,
    })
    .click();
  await news.getByRole("link", { name: "Ver detalhes", exact: true }).click();
  await expect(
    page.getByText(
      "Resumo sintético para verificar a leitura no Command Center.",
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Marcar como lida", exact: true })
    .first()
    .click();
  await capture("news-detail");
  await nav.getByRole("button", { name: "Fontes", exact: true }).click();
  await expect(page.locator(".source-card")).toHaveCount(3);
  const source = page.locator(".source-card").filter({
    has: page.getByRole("heading", { name: "Agência Brasil", exact: true }),
  });
  await source.getByRole("switch").click();
  await expect(source.getByRole("switch")).toHaveAttribute(
    "aria-checked",
    "false",
  );
  await source.getByRole("switch").click();
  await source.getByRole("button", { name: "Remover", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Excluir", exact: true })
    .click();
  await expect(page.locator(".source-card")).toHaveCount(2);
  await page
    .locator(".toast-stack")
    .getByRole("button", { name: "Desfazer", exact: true })
    .click();
  await expect(page.locator(".source-card")).toHaveCount(3);
  await capture("sources-desktop");
  await page.getByRole("button", { name: "Ler depois", exact: true }).click();
  await expect(page.locator(".news-title")).toHaveText(
    "Manchete de demonstração",
  );
  await page.getByRole("button", { name: "Já lidas", exact: true }).click();
  await expect(page.locator(".news-title")).toHaveText(
    "Manchete de demonstração",
  );
  await page.getByRole("button", { name: "Notificações", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Central de notificações" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Marcar todas como lidas", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Fechar notificações", exact: true })
    .click();
  await nav.getByRole("button", { name: "Visão geral", exact: true }).click();
  await page.getByRole("button", { name: "Personalizar", exact: true }).click();
  await page
    .getByRole("dialog")
    .locator(".widget-catalogue")
    .getByRole("button", { name: /Clima e previsão/ })
    .click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Cidade", { exact: true }).fill("Campinas");
  await dialog
    .getByRole("button", { name: "Buscar cidade", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Campinas, São Paulo, Brasil", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Salvar painel", exact: true })
    .click();
  await page.getByRole("button", { name: "Personalizar", exact: true }).click();
  await page
    .getByRole("dialog")
    .locator(".widget-catalogue")
    .getByRole("button", { name: /Ações de empresas/ })
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Empresa, código ou link", { exact: true })
    .fill("https://finance.yahoo.com/quote/IBM/");
  await dialog
    .getByRole("button", { name: "Buscar empresa", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: /IBM · International Business Machines/ })
    .click();
  await expect(
    dialog.getByLabel("Código no provedor", { exact: true }),
  ).toHaveValue("IBM");
  await dialog
    .getByRole("button", { name: "Salvar painel", exact: true })
    .click();
  // Repeated types have independent configuration. Repository selection is mocked; auth is covered by backend tests.
  await page.getByRole("button", { name: "Personalizar", exact: true }).click();
  await page
    .getByRole("dialog")
    .locator(".widget-catalogue")
    .getByRole("button", { name: /Repositório GitHub/ })
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Título do painel", { exact: true })
    .fill("Outro GitHub");
  await dialog
    .getByRole("button", { name: "Listar repositórios", exact: true })
    .click();
  await dialog.getByRole("button", { name: /phzl0\/CommanderCenter/ }).click();
  await expect(
    dialog.getByLabel("Repositório GitHub", { exact: true }),
  ).toHaveValue("phzl0/CommanderCenter");
  await dialog
    .getByRole("button", { name: "Salvar painel", exact: true })
    .click();
  await page.getByRole("button", { name: "Personalizar", exact: true }).click();
  await page
    .getByRole("dialog")
    .locator(".widget-catalogue")
    .getByRole("button", { name: /Ações de empresas/ })
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Título do painel", { exact: true })
    .fill("Outra empresa");
  await dialog.getByLabel("Código no provedor", { exact: true }).fill("MSFT");
  await dialog
    .getByRole("button", { name: "Salvar painel", exact: true })
    .click();
  await page.getByRole("button", { name: "Personalizar", exact: true }).click();
  await page
    .getByRole("dialog")
    .locator(".widget-catalogue")
    .getByRole("button", { name: /Tarefas do Teams/ })
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Listar listas do To Do", exact: true })
    .click();
  await dialog
    .getByLabel("Lista do Microsoft To Do", { exact: true })
    .selectOption("list-test");
  await dialog
    .getByLabel("Origem das tarefas", { exact: true })
    .selectOption("todo");
  await dialog
    .getByRole("button", { name: "Salvar painel", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Tarefas do Teams", exact: true }),
  ).toBeVisible();
  const ws = await (
    await page.request.post("/api/intelligence/bootstrap", {
      headers: { origin: "http://localhost:5173" },
    })
  ).json();
  expect(
    ws.widgets.filter((w: { kind: string }) => w.kind === "github"),
  ).toHaveLength(2);
  expect(
    ws.widgets.filter((w: { kind: string }) => w.kind === "stock"),
  ).toHaveLength(2);
  await page.getByRole("button", { name: "Personalizar", exact: true }).click();
  await page
    .getByLabel("Quantidade de cards", { exact: true })
    .selectOption("4");
  await page
    .getByRole("button", { name: "Fechar personalização", exact: true })
    .click();
  await expect(page.locator(".intelligence-card")).toHaveCount(4);
  await expect(page.locator(".chart-loading")).toHaveCount(0);
  await capture("dashboard-desktop");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  await nav.getByRole("button", { name: "Visão geral", exact: true }).click();
  await expect(nav).not.toBeInViewport();
  await expect(
    page.getByRole("button", { name: "Personalizar", exact: true }),
  ).toBeVisible();
  await capture("dashboard-mobile");
  expect(errors).toEqual([]);
});
