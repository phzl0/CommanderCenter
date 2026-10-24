import { test, expect } from "@playwright/test";
test("private workspace: management, spreadsheet analysis and export", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
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
  await nav.getByRole("button", { name: "Projetos", exact: true }).click();
  await page.getByRole("button", { name: "Novo projeto", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog.getByLabel("Nome", { exact: true }).fill("Projeto de teste");
  await dialog.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Projeto de teste", exact: true }),
  ).toBeVisible();
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
  await nav.getByRole("button", { name: "Atividades", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Tarefa concluída: Entrega de teste",
      exact: true,
    }),
  ).toBeVisible();
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
  await page.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Abrir menu", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  await nav.getByRole("button", { name: "Projetos", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Projetos", exact: true }),
  ).toBeVisible();
  await expect(nav).not.toBeInViewport();
  await expect(
    page.getByRole("heading", { name: "Projeto de teste", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/projects-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
