import { describe, expect, it } from "vitest";
import { assertSafeUrl, isPrivateIp } from "../src/reader/safe-url";
import { normalizeUrl } from "../src/util/url";

describe("network safety", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "0.0.0.0",
    "224.0.0.1",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
  ])("blocks private address %s", (address) => {
    expect(isPrivateIp(address)).toBe(true);
  });

  it("allows public addresses", () => {
    expect(isPrivateIp("8.8.8.8")).toBe(false);
    expect(isPrivateIp("2001:4860:4860::8888")).toBe(false);
  });

  it("rejects localhost and metadata URLs", async () => {
    await expect(assertSafeUrl("http://127.0.0.1/admin")).rejects.toThrow(/private/i);
    await expect(assertSafeUrl("http://localhost:3000")).rejects.toThrow(/local/i);
    await expect(assertSafeUrl("http://169.254.169.254/latest/meta-data")).rejects.toThrow(
      /private/i,
    );
  });

  it("normalizes tracking parameters and fragments", () => {
    expect(normalizeUrl("https://www.Example.com/path/?utm_source=x&a=1#section")).toBe(
      "https://example.com/path/?a=1",
    );
  });
});
