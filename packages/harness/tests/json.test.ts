import { describe, expect, it } from "vitest";
import { extractJson } from "../src/util/json";

describe("extractJson", () => {
  it("extracts JSON from a markdown fence", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("extracts a JSON object from surrounding prose", () => {
    expect(extractJson('Here is the result: {"a":{"b":2}} — done.')).toEqual({ a: { b: 2 } });
  });

  it("repairs trailing commas", () => {
    expect(extractJson('{"a":[1,2,],}')).toEqual({ a: [1, 2] });
  });

  it("throws when there is no JSON", () => {
    expect(() => extractJson("no structured output")).toThrow();
  });
});
