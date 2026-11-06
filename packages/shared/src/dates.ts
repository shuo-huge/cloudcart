export function nowIso(): string {
  return new Date().toISOString();
}

export function isoPlusSeconds(seconds: number, from = new Date()): string {
  return new Date(from.getTime() + seconds * 1000).toISOString();
}

export function isoPlusDays(days: number, from = new Date()): string {
  return isoPlusSeconds(days * 86400, from);
}

export function isExpired(iso: string, at = new Date()): boolean {
  const time = Date.parse(iso);
  return !Number.isFinite(time) || time <= at.getTime();
}

export function dayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function formatDate(iso: string, locale = "en-US"): string {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "—";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric", month: "short", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  }).format(new Date(time));
}
