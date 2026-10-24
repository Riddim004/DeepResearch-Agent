import { describe, expect, it } from "vitest";
import { parseDuckDuckGoHtml, parseDuckDuckGoLite } from "../src/search/duckduckgo";

describe("DuckDuckGo parsing", () => {
  it("extracts organic HTML results and decodes redirect URLs", () => {
    const html = `
      <div class="result results_links">
        <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Freport%3Futm_source%3Dx">A report</a>
        <a class="result__snippet">A useful snippet.</a>
      </div>
      <div class="result result--ad">
        <a class="result__a" href="https://ads.example.com">Ignore me</a>
      </div>`;
    const results = parseDuckDuckGoHtml(html, 5);
    expect(results).toHaveLength(1);
    expect(results[0]?.url).toBe("https://example.com/report");
    expect(results[0]?.title).toBe("A report");
  });

  it("falls back to the lite layout", () => {
    const html = `
      <table>
        <tr><td><a class="result-link" href="https://example.com/lite">Lite result</a></td></tr>
        <tr><td><span class="result-snippet">Snippet from lite.</span></td></tr>
      </table>`;
    const results = parseDuckDuckGoLite(html, 5);
    expect(results).toHaveLength(1);
    expect(results[0]?.url).toBe("https://example.com/lite");
    expect(results[0]?.snippet).toContain("Snippet");
  });
});
