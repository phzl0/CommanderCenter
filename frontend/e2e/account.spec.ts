import { test, expect } from "@playwright/test";
test("private profile preferences recurring goals agenda and security", async ({
  page,
}) => {
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
  await menu("Preferências");
  await page
    .getByLabel("Página inicial", { exact: true })
    .selectOption("daily");
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
    page.getByRole("heading", { name: "Meu dia", exact: true }),
  ).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Navegação principal" });
  await nav.getByRole("button", { name: "Metas", exact: true }).click();
  await page.getByRole("button", { name: "Nova meta", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Título da meta", { exact: true })
    .fill("Estudar documentação");
  await dialog.getByLabel("Valor alvo", { exact: true }).fill("1");
  await dialog
    .getByRole("button", { name: "Salvar meta", exact: true })
    .click();
  await nav.getByRole("button", { name: "Tarefas", exact: true }).click();
  await page.getByRole("button", { name: "Nova tarefa", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog.getByLabel("Título", { exact: true }).fill("Ler documentação");
  await dialog
    .getByLabel("Meta vinculada", { exact: true })
    .selectOption({ label: "Estudar documentação" });
  await dialog.getByLabel("Repetição", { exact: true }).selectOption("weekly");
  await dialog
    .getByLabel("Etiquetas", { exact: true })
    .fill("estudo, trabalho");
  const day = new Date().toISOString().slice(0, 10);
  await dialog.getByLabel("Prazo", { exact: true }).fill(day);
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Ler documentação", exact: true }),
  ).toBeVisible();
  await page.getByLabel("Filtrar etiqueta", { exact: true }).fill("estudo");
  await expect(
    page.getByRole("heading", { name: "Ler documentação", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Concluir tarefa", exact: true })
    .click();
  const tasks = await (await page.request.get("/api/tasks")).json();
  expect(
    tasks.items.filter(
      (t: { title: string }) => t.title === "Ler documentação",
    ),
  ).toHaveLength(2);
  await nav.getByRole("button", { name: "Metas", exact: true }).click();
  await expect(
    page.getByRole("progressbar", {
      name: "Progresso de Estudar documentação",
      exact: true,
    }),
  ).toHaveAttribute("aria-valuenow", "100");
  await capture("goals-desktop");
  await nav.getByRole("button", { name: "Agenda", exact: true }).click();
  await page
    .getByRole("button", { name: "Novo compromisso", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Título do compromisso", { exact: true })
    .fill("Planejamento pessoal");
  await dialog.getByLabel("Início", { exact: true }).fill(day + "T09:00");
  await dialog.getByLabel("Fim", { exact: true }).fill(day + "T10:30");
  await dialog
    .getByRole("button", { name: "Salvar compromisso", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Planejamento pessoal", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".agenda-stats")).toContainText("90");
  await capture("agenda-desktop");
  await menu("Conexões");
  await expect(
    page.getByRole("heading", { name: "Conexões", exact: true }),
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
    page.getByRole("heading", { name: "Meu dia", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await menu("Ver meu perfil");
  await capture("profile-mobile");
  await menu("Preferências");
  await capture("preferences-mobile");
  expect(errors).toEqual([]);
});
