import { test, expect } from "@playwright/test";
test("private profile preferences and security", async ({ page }) => {
  test.setTimeout(150000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  async function menu(name: string) {
    await page
      .getByRole("button", { name: "Abrir menu do perfil", exact: true })
      .click();
    await page.getByRole("menuitem", { name, exact: true }).click();
  }
  async function capture(name: string) {
    const dismiss = page
      .locator(".toast-stack")
      .getByRole("button", { name: "Dispensar notificação", exact: true });
    while (await dismiss.count()) await dismiss.first().click();
    if ((page.viewportSize()?.width || 1440) <= 760)
      await expect(page.locator(".sidebar")).not.toBeInViewport();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: "test-results/" + name + ".png",
      fullPage: true,
    });
  }
  await page.route("**/api/intelligence/widgets/*/data?*", (route) =>
    route.fulfill({
      json: {
        status: "empty",
        source: "Fixture de teste",
        message: "Dados externos não são consultados neste teste.",
        kpis: [],
      },
    }),
  );
  await page.goto("/");
  await page.getByLabel("E-mail", { exact: true }).fill("account@example.test");
  await page
    .getByLabel("Senha", { exact: true })
    .fill("disposable-account-password");
  await page
    .getByRole("button", { name: "Entrar no meu espaço", exact: true })
    .click();
  await menu("Ver meu perfil");
  await expect(
    page.getByRole("heading", { name: "Meu perfil", exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Nome de exibição", { exact: true })
    .fill("Paulo de teste");
  await page
    .getByLabel("Área de atuação", { exact: true })
    .fill("Tecnologia e gestão");
  await page
    .getByLabel("Descrição curta", { exact: true })
    .fill("Organizando estudos e entregas.");
  await page.getByLabel("Interesses", { exact: true }).fill("Python, empresas");
  await page
    .getByRole("button", { name: "Salvar perfil", exact: true })
    .click();
  await expect(page.locator(".profile-summary h2")).toHaveText(
    "Paulo de teste",
  );
  await page.getByLabel("Alterar foto", { exact: true }).setInputFiles({
    name: "avatar.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAFElEQVR4nGNs2nKJARtgwio6aCUAmPcCGBmvImEAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await expect(
    page.getByRole("img", { name: "Foto do perfil", exact: true }),
  ).toBeVisible();
  await capture("profile-desktop");
  await page
    .getByRole("button", { name: "Abrir menu do perfil", exact: true })
    .click();
  await expect(
    page.getByRole("menu", { name: "Opções da conta", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("menu", { name: "Opções da conta", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Abrir menu do perfil", exact: true }),
  ).toBeFocused();
  await menu("Preferências");
  await page
    .getByLabel("Página inicial", { exact: true })
    .selectOption("dashboard");
  await page.getByLabel("Fuso horário", { exact: true }).selectOption("UTC");
  await page
    .getByLabel("Tamanho do texto", { exact: true })
    .selectOption("large");
  await page
    .getByLabel("Reduzir animações e iniciar notícias pausadas", {
      exact: true,
    })
    .check();
  await page
    .getByLabel("Capacidade diária em minutos", { exact: true })
    .fill("360");
  await page
    .getByRole("button", { name: "Salvar preferências", exact: true })
    .click();
  await expect(page.locator("html")).toHaveAttribute("data-font-size", "large");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Visão geral", exact: true }),
  ).toBeVisible();
  await menu("Conexões");
  await expect(
    page.getByRole("heading", { name: "Fontes e conexões", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Conectar Google Calendar", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Conectar Google Calendar", exact: true })
    .click();
  await expect(page.locator(".connections-grid")).toContainText("Client ID");
  await capture("connections-desktop");
  await page
    .getByRole("button", { name: "Configurar aplicativos", exact: true })
    .click();
  await page.getByLabel("Client ID", { exact: true }).fill("ci-github-client");
  await page
    .getByLabel("Client Secret", { exact: true })
    .fill("disposable-ci-app-secret");
  await page
    .getByLabel("Senha para configurar aplicativos", { exact: true })
    .fill("disposable-account-password");
  await page
    .getByRole("button", { name: "Salvar aplicativo", exact: true })
    .click();
  await expect(page.getByLabel("Client Secret", { exact: true })).toHaveValue(
    "",
  );
  const config = await page.request.get("/api/integrations/admin/applications");
  expect(await config.text()).not.toContain("disposable-ci-app-secret");
  await page
    .getByRole("button", { name: "Fechar configuração", exact: true })
    .click();
  // Mock the provider page, never authorize a real external account in CI.
  await page
    .context()
    .route("https://github.com/login/oauth/authorize?*", async (route) => {
      const state = new URL(route.request().url()).searchParams.get("state");
      await route.fulfill({
        contentType: "text/html",
        body: `<a href="http://localhost:5173/api/integrations/github/callback?error=access_denied&state=${state}">Cancelar autorização de teste</a>`,
      });
    });
  let opened = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "Conectar GitHub", exact: true })
    .click();
  const auth = await opened;
  await auth
    .getByRole("link", { name: "Cancelar autorização de teste" })
    .click();
  await expect(
    page.getByText("Autorização cancelada.", { exact: true }),
  ).toBeVisible();
  let connected = false;
  await page.route("**/api/integrations", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    if (connected)
      body.github = { ...body.github, connected: true, account: "Conta CI" };
    await route.fulfill({ response, json: body });
  });
  await page.context().unroute("https://github.com/login/oauth/authorize?*");
  await page
    .context()
    .route("https://github.com/login/oauth/authorize?*", async (route) => {
      connected = true;
      await route.fulfill({
        contentType: "text/html",
        body: '<script>window.opener.postMessage({type:"cc-oauth-result",provider:"github",outcome:"connected"},"http://localhost:5173");window.close();</script>',
      });
    });
  opened = page.waitForEvent("popup");
  await page
    .getByRole("button", { name: "Conectar GitHub", exact: true })
    .click();
  await opened;
  await expect(
    page.getByText("Conectado: Conta CI", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reconectar", exact: true }),
  ).toBeVisible();
  await menu("Segurança");
  await page
    .getByLabel("Senha atual", { exact: true })
    .fill("disposable-account-password");
  await page
    .getByLabel("Nova senha", { exact: true })
    .fill("updated-disposable-password");
  await page
    .getByLabel("Confirmar nova senha", { exact: true })
    .fill("updated-disposable-password");
  await page
    .getByRole("button", { name: "Atualizar senha", exact: true })
    .click();
  await expect(page.locator(".session-item")).toHaveCount(1);
  await expect(page.getByLabel("Senha atual", { exact: true })).toHaveValue("");
  await menu("Sair");
  await page.getByLabel("E-mail", { exact: true }).fill("account@example.test");
  await page
    .getByLabel("Senha", { exact: true })
    .fill("updated-disposable-password");
  await page
    .getByRole("button", { name: "Entrar no meu espaço", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Visão geral", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await menu("Ver meu perfil");
  await capture("profile-mobile");
  await menu("Preferências");
  await capture("preferences-mobile");
  expect(errors).toEqual([]);
});
