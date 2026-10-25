import { notify, type UndoAction } from "./feedback";
export type User = { id: string; name: string; email: string };
export type Project = {
  id: string;
  name: string;
  description: string;
  status: string;
  due_date: string | null;
  created_at: string;
};
export type Task = {
  context: "personal" | "professional" | "general";
  id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  project_id: string | null;
  due_date: string | null;
  created_at: string;
  completed_at: string | null;
};
export type Activity = {
  id: string;
  description: string;
  project_id: string | null;
  task_id: string | null;
  origin: string;
  occurred_at: string;
  created_at: string;
};
export type Page<T> = {
  items: T[];
  total: number;
  offset: number;
  limit: number;
};
export const labels: Record<string, string> = {
  active: "Ativo",
  paused: "Pausado",
  completed: "Concluído",
  archived: "Arquivado",
  pending: "Pendente",
  in_progress: "Em andamento",
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  manual: "Manual",
  automatic: "Automática",
};
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  const res = await fetch("/api" + path, {
    ...options,
    headers,
    credentials: "same-origin",
  });
  if (!res.ok) {
    if (res.status === 401 && path != "/auth/login" && path != "/auth/me")
      window.dispatchEvent(new Event("session-expired"));
    let message = "Não foi possível concluir a operação.";
    try {
      const body = await res.json();
      message =
        typeof body.detail === "string"
          ? body.detail
          : Array.isArray(body.detail)
            ? body.detail.map((e: { msg: string }) => e.msg).join("; ")
            : message;
    } catch {
      /* Server may return non-JSON errors. */
    }
    if (!path.startsWith("/notifications") && path !== "/auth/me")
      notify({ title: message, level: "error" });
    throw new Error(message);
  }
  const result = res.status === 204 ? undefined : await res.json();
  const method = (options.method || "GET").toUpperCase();
  const silent =
    path.startsWith("/auth") ||
    path.startsWith("/notifications") ||
    path.endsWith("/bootstrap") ||
    path === "/sources/preview" ||
    path === "/sources/articles/state";
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method) && !silent) {
    let title =
      method === "DELETE"
        ? "Registro excluído"
        : method === "POST"
          ? "Registro adicionado"
          : "Alterações salvas";
    if (path === "/day") title = "Planejamento salvo";
    if (path === "/day/close") title = "Dia revisado";
    if (path === "/day/reopen") title = "Revisão reaberta";
    if (path === "/day/captures") title = "Captura registrada";
    if (path === "/intelligence/order") title = "Painéis reordenados";
    if (path === "/intelligence/settings") title = "Período atualizado";
    if (path === "/reports" && method === "POST") title = "Relatório gerado";
    if (path.endsWith("/analyze")) title = "Análise atualizada";
    let action: UndoAction | undefined;
    const widget = path.match(/^\/intelligence\/widgets\/([^/]+)$/),
      entry = path.match(
        /^\/intelligence\/entries\/(personal|finance)\/([^/]+)$/,
      ),
      source = path.match(/^\/sources\/([^/]+)$/);
    if (method === "DELETE") {
      if (widget) action = { kind: "widget", id: widget[1] };
      if (entry)
        action = { kind: entry[1] as "personal" | "finance", id: entry[2] };
      if (source) action = { kind: "source", id: source[1] };
    }
    const notice = { title, level: "success" as const, action };
    notify(notice);
    try {
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(notice),
      });
    } catch {
      /* A toast still confirms the completed mutation if the inbox is unavailable. */
    }
    window.dispatchEvent(new Event("cc-notifications-changed"));
  }
  if (result?.status === "unavailable" || result?.source_errors?.length)
    window.dispatchEvent(new Event("cc-notifications-changed"));
  return result as T;
}
export const send = (method: string, data: unknown): RequestInit => ({
  method,
  body: JSON.stringify(data),
});
export const dateLabel = (value: string | null) =>
  value
    ? new Date(value + "T12:00:00").toLocaleDateString("pt-BR")
    : "Sem prazo";
export const timeLabel = (value: string) =>
  new Date(value.endsWith("Z") ? value : value + "Z").toLocaleString("pt-BR");
export async function download(path: string, filename: string) {
  const res = await fetch("/api" + path, { credentials: "same-origin" });
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new Event("session-expired"));
    throw new Error("Não foi possível baixar o arquivo.");
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
