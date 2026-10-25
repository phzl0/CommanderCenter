export type Preferences = {
  homepage: "dashboard" | "daily";
  timezone: string;
  font_size: "normal" | "large";
  reduce_motion: boolean;
  notify_success: boolean;
  deadline_alerts: boolean;
  alert_days: 0 | 1 | 3 | 7;
  daily_capacity: number;
};
export const defaultPreferences: Preferences = {
  homepage: "dashboard",
  timezone: "America/Sao_Paulo",
  font_size: "normal",
  reduce_motion: false,
  notify_success: true,
  deadline_alerts: true,
  alert_days: 1,
  daily_capacity: 480,
};
let current = defaultPreferences;
export const getPreferences = () => current;
export function applyPreferences(value?: Preferences) {
  current = { ...defaultPreferences, ...value };
  document.documentElement.dataset.fontSize = current.font_size;
  document.documentElement.dataset.reduceMotion = String(current.reduce_motion);
  window.dispatchEvent(new CustomEvent("cc-preferences", { detail: current }));
}
export function todayInAccount() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: current.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  return ["year", "month", "day"]
    .map((type) => parts.find((p) => p.type === type)!.value)
    .join("-");
}
export const formatInstant = (value: string) =>
  new Date(
    value.endsWith("Z") || /[+-]\d\d:\d\d$/.test(value) ? value : value + "Z",
  ).toLocaleString("pt-BR", { timeZone: current.timezone });
