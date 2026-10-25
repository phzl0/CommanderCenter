export type UndoAction = {
  kind: "widget" | "personal" | "finance" | "source";
  id: string;
};
export type ToastMessage = {
  title: string;
  message?: string;
  level?: "success" | "info" | "warning" | "error";
  action?: UndoAction;
};
export const notify = (detail: ToastMessage) =>
  window.dispatchEvent(new CustomEvent("cc-toast", { detail }));
export const dataChanged = () =>
  window.dispatchEvent(new Event("cc-data-changed"));
export function confirmAction(message: string): Promise<boolean> {
  return new Promise((resolve) =>
    window.dispatchEvent(
      new CustomEvent("cc-confirm", { detail: { message, resolve } }),
    ),
  );
}
export const detailUrl = (id: string) => `/#/painel/${encodeURIComponent(id)}`;
