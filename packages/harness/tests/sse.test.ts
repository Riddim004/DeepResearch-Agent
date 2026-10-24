import { describe, expect, it } from "vitest";
import { iterateSse } from "../src/providers/sse";

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
}

describe("iterateSse", () => {
  it("parses events split across arbitrary chunks", async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"con',
      'tent":"Hel"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"lo"}}]}\r\n\r\n',
      "data: [DONE]\n\n",
    ];
    const payloads: string[] = [];
    for await (const payload of iterateSse(streamFromChunks(chunks))) {
      payloads.push(payload);
    }
    expect(payloads).toHaveLength(2);
    expect(payloads[0]).toContain('"Hel"');
    expect(payloads[1]).toContain('"lo"');
  });

  it("joins multi-line data fields", async () => {
    const payloads: string[] = [];
    for await (const payload of iterateSse(
      streamFromChunks(["data: line one\ndata: line two\n\n"]),
    )) {
      payloads.push(payload);
    }
    expect(payloads).toEqual(["line one\nline two"]);
  });
});
