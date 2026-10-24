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
    throw new Error(message);
  }
  return res.status === 204 ? (undefined as T) : res.json();
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
