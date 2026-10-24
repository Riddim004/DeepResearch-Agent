export async function* iterateSse(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<string, void, unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      while (true) {
        const match = /\r?\n\r?\n/.exec(buffer);
        if (!match || match.index === undefined) break;
        const block = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        const payload = parseSseBlock(block);
        if (payload === "[DONE]") return;
        if (payload) yield payload;
      }
    }

    buffer += decoder.decode();
    const payload = parseSseBlock(buffer);
    if (payload && payload !== "[DONE]") yield payload;
  } finally {
    reader.releaseLock();
  }
}

function parseSseBlock(block: string): string | null {
  const lines = block.split(/\r?\n/);
  const data: string[] = [];
  for (const line of lines) {
    if (line.startsWith("data:")) {
      data.push(line.slice(5).replace(/^ /, ""));
    }
  }
  if (data.length === 0) return null;
  return data.join("\n");
}
