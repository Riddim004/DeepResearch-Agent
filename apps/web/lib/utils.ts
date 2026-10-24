import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function formatElapsed(startedAt: number | null, finishedAt: number | null): string {
  if (!startedAt) return "—";
  const end = finishedAt ?? Date.now();
  return formatDuration(end - startedAt);
}

export function formatDate(timestamp: number, withTime = false): string {
  const date = new Date(timestamp);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

export function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(
    value,
  );
}

export function hostnameLabel(domain: string): string {
  return domain.replace(/^www\./, "");
}

export function truncateText(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}…`;
}

export function phaseLabel(phase: string): string {
  const labels: Record<string, string> = {
    scope: "Scope",
    discover: "Discover",
    read: "Read",
    write: "Write",
    audit: "Audit",
  };
  return labels[phase] ?? phase;
}

export function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    queued: "Queued",
    running: "Researching",
    completed: "Complete",
    failed: "Failed",
    cancelled: "Cancelled",
  };
  return labels[status] ?? status;
}
