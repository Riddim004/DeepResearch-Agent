import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { HarnessError } from "../util/errors";

const BLOCKED_HOSTS = new Set([
  "localhost",
  "localhost.localdomain",
  "metadata.google.internal",
  "metadata",
  "instance-data",
]);

function ipv4Private(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    return true;
  }
  const [a, b] = parts;
  if (a === undefined || b === undefined) return true;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0 && parts[2] === 2) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a === 198 && b === 51 && parts[2] === 100) return true;
  if (a === 203 && b === 0 && parts[2] === 113) return true;
  if (a >= 224) return true;
  return false;
}

function ipv6Private(address: string): boolean {
  const value = address.toLowerCase().split("%")[0] ?? "";
  if (value === "::" || value === "::1") return true;
  if (value.startsWith("fc") || value.startsWith("fd")) return true;
  if (/^fe[89ab]/.test(value)) return true;
  if (value.startsWith("ff")) return true;
  if (value.startsWith("2001:db8")) return true;
  if (value.startsWith("64:ff9b")) return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(value);
  if (mapped?.[1]) return ipv4Private(mapped[1]);
  return false;
}

export function isPrivateIp(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return ipv4Private(address);
  if (version === 6) return ipv6Private(address);
  return true;
}

export async function assertSafeUrl(input: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new HarnessError("INVALID_INPUT", "The source URL is invalid.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new HarnessError("INVALID_INPUT", "Only HTTP and HTTPS sources can be read.");
  }
  if (url.username || url.password) {
    throw new HarnessError("INVALID_INPUT", "Authenticated source URLs are not allowed.");
  }
  if (BLOCKED_HOSTS.has(url.hostname.toLowerCase())) {
    throw new HarnessError("INVALID_INPUT", "Local and metadata hosts are not allowed.");
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new HarnessError("INVALID_INPUT", "Non-standard source ports are not allowed.");
  }

  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) {
    if (isPrivateIp(host)) {
      throw new HarnessError("INVALID_INPUT", "Private network addresses are not allowed.");
    }
    return url;
  }

  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new HarnessError("INVALID_INPUT", `The source host could not be resolved: ${host}`);
  }
  if (addresses.length === 0) {
    throw new HarnessError("INVALID_INPUT", `The source host could not be resolved: ${host}`);
  }
  for (const record of addresses) {
    if (isPrivateIp(record.address)) {
      throw new HarnessError("INVALID_INPUT", "The source resolves to a private network address.");
    }
  }
  return url;
}
