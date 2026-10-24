import type { CompletionRequest, ModelProvider, Usage } from "../types";
import { HarnessError } from "../util/errors";
import { extractJson } from "../util/json";
import { estimateTokens } from "../util/text";

export interface CompletionResult {
  text: string;
  usage: Usage;
}

export async function completeText(
  provider: ModelProvider,
  request: CompletionRequest,
): Promise<CompletionResult> {
  let text = "";
  let usage: Usage | null = null;

  for await (const event of provider.stream(request)) {
    if (event.type === "text") text += event.text;
    if (event.type === "usage") usage = event.usage;
  }

  if (!usage) {
    const inputTokens = request.messages.reduce(
      (total, message) => total + estimateTokens(message.content),
      0,
    );
    const outputTokens = estimateTokens(text);
    usage = { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
  }

  if (!text.trim()) {
    throw new HarnessError("PROVIDER_ERROR", "The model returned an empty response.");
  }

  return { text, usage };
}

export async function completeJson<T>(
  provider: ModelProvider,
  request: CompletionRequest,
  parse: (value: unknown) => T,
): Promise<{ value: T; usage: Usage }> {
  let usage: Usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
  let messages = request.messages;
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await completeText(provider, { ...request, messages, json: true });
    usage = {
      inputTokens: usage.inputTokens + result.usage.inputTokens,
      outputTokens: usage.outputTokens + result.usage.outputTokens,
      totalTokens: usage.totalTokens + result.usage.totalTokens,
    };

    try {
      const value = parse(extractJson(result.text));
      return { value, usage };
    } catch (error) {
      lastError = error;
      if (attempt === 1) break;
      messages = [
        ...request.messages,
        { role: "assistant", content: result.text.slice(0, 12_000) },
        {
          role: "user",
          content:
            "That response was not valid against the required JSON shape. Return the corrected JSON only. " +
            "Do not add markdown fences or commentary.\n\nValidation error: " +
            (error instanceof Error ? error.message : String(error)),
        },
      ];
    }
  }

  throw new HarnessError(
    "PROVIDER_ERROR",
    "The model could not produce a valid structured response. Try a stronger model or retry the run.",
    { cause: lastError },
  );
}
