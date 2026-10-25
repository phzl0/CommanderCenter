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
  await expect(page.locator(".connections-grid")).toContainText(
    "GOOGLE_CLIENT_ID",
  );
  await capture("connections-desktop");
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
