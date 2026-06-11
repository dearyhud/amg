import { format, formatDistanceToNowStrict, parseISO } from "date-fns";

export function formatDateTime(iso: string): string {
  return format(parseISO(iso), "MMM d, HH:mm:ss");
}

export function formatDate(iso: string): string {
  return format(parseISO(iso), "MMM d");
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "never";
  return `${formatDistanceToNowStrict(parseISO(iso))} ago`;
}

export function shortRequestId(id: string): string {
  return id.slice(0, 8);
}

export function formatDuration(seconds: number): string {
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return "expired";
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m >= 60) return `${Math.floor(m / 60)}h ${m % 60}m`;
  return `${m}:${String(s).padStart(2, "0")}`;
}
