import type { CompletionRequest, ModelProvider, ModelStreamEvent, Usage } from "../types";
import { HarnessError } from "../util/errors";
import { HttpError, parseRetryAfter, withRetries } from "../util/retry";
import { estimateTokens } from "../util/text";
import { iterateSse } from "./sse";

interface OpenAIChatChunk {
  choices?: Array<{
    delta?: {
      content?: string | null;
      reasoning?: string | null;
      reasoning_content?: string | null;
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  } | null;
  error?: { message?: string; type?: string };
}

export interface OpenAIProviderOptions {
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  extraHeaders?: Record<string, string>;
}

export class OpenAICompatibleProvider implements ModelProvider {
  readonly id = "openai-compatible";
  readonly model: string;
  private readonly apiKey: string;
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;
  private readonly extraHeaders: Record<string, string>;
  private readonly reasoningModel: boolean;

  constructor(options: OpenAIProviderOptions) {
    if (!options.apiKey) {
      throw new HarnessError("PROVIDER_AUTH", "No model API key is configured.");
    }
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.extraHeaders = options.extraHeaders ?? {};
    this.reasoningModel = /^(o\d|gpt-5)/i.test(options.model);

    const base = (options.baseUrl ?? "https://api.openai.com/v1").replace(/\/+$/, "");
    this.endpoint = base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
  }

  async *stream(request: CompletionRequest): AsyncIterable<ModelStreamEvent> {
    const baseBody: Record<string, unknown> = {
      model: this.model,
      messages: request.messages,
      stream: true,
      stream_options: { include_usage: true },
    };
    if (!this.reasoningModel) {
      baseBody.temperature = request.temperature ?? 0.3;
      if (request.maxTokens) baseBody.max_tokens = request.maxTokens;
    } else if (request.maxTokens) {
      baseBody.max_completion_tokens = request.maxTokens;
    }
    if (request.json) baseBody.response_format = { type: "json_object" };

    let response: Response;
    try {
      response = await this.openStream(baseBody, request.signal);
    } catch (error) {
      if (error instanceof HttpError && error.status === 400) {
        const relaxed = { ...baseBody };
        delete relaxed.response_format;
        delete relaxed.stream_options;
        if (request.json) relaxed.response_format = undefined;
        response = await this.openStream(relaxed, request.signal).catch((retryError) => {
          throw this.mapError(retryError);
        });
      } else {
        throw this.mapError(error);
      }
    }

    if (!response.body) {
      throw new HarnessError("PROVIDER_ERROR", "The model provider returned an empty stream.");
    }

    let output = "";
    let usage: Usage | null = null;
    let finishReason: string | undefined;

    for await (const payload of iterateSse(response.body)) {
      let chunk: OpenAIChatChunk;
      try {
        chunk = JSON.parse(payload) as OpenAIChatChunk;
      } catch {
        continue;
      }

      if (chunk.error?.message) {
        throw new HarnessError("PROVIDER_ERROR", chunk.error.message);
      }

      const choice = chunk.choices?.[0];
      const reasoning = choice?.delta?.reasoning_content ?? choice?.delta?.reasoning;
      if (reasoning) yield { type: "reasoning", text: reasoning };

      const text = choice?.delta?.content;
      if (text) {
        output += text;
        yield { type: "text", text };
      }

      if (choice?.finish_reason) finishReason = choice.finish_reason;

      if (chunk.usage) {
        usage = this.mapUsage(chunk.usage);
      }
    }

    if (!usage) {
      const inputTokens = request.messages.reduce(
        (total, message) => total + estimateTokens(message.content),
        0,
      );
      const outputTokens = estimateTokens(output);
      usage = { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens };
    }

    yield { type: "usage", usage };
    yield { type: "done", ...(finishReason ? { finishReason } : {}) };
  }

  private async openStream(body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
    return withRetries(
      async () => {
        const response = await this.fetchImpl(this.endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${this.apiKey}`,
            ...this.extraHeaders,
          },
          body: JSON.stringify(body),
          signal,
        });

        if (!response.ok) {
          const raw = await response.text().catch(() => "");
          let message = raw.slice(0, 800);
          try {
            const parsed = JSON.parse(raw) as { error?: { message?: string } };
            message = parsed.error?.message ?? message;
          } catch {
            // keep raw text
          }
          throw new HttpError(
            response.status,
            message || `Model request failed with HTTP ${response.status}.`,
            parseRetryAfter(response.headers.get("retry-after")),
          );
        }
        return response;
      },
      {
        attempts: 3,
        baseDelayMs: 900,
        maxDelayMs: 8_000,
        signal,
        shouldRetry: (error) => error instanceof HttpError && error.retryable,
      },
    );
  }

  private mapUsage(usage: NonNullable<OpenAIChatChunk["usage"]>): Usage {
    const inputTokens = usage.prompt_tokens ?? 0;
    const outputTokens = usage.completion_tokens ?? 0;
    return {
      inputTokens,
      outputTokens,
      totalTokens: usage.total_tokens ?? inputTokens + outputTokens,
    };
  }

  private mapError(error: unknown): Error {
    if (error instanceof HarnessError) return error;
    if (error instanceof HttpError) {
      if (error.status === 401 || error.status === 403) {
        return new HarnessError(
          "PROVIDER_AUTH",
          "The model provider rejected the API key. Check OPENAI_API_KEY and base URL.",
          { cause: error },
        );
      }
      if (error.status === 429) {
        return new HarnessError(
          "PROVIDER_RATE_LIMIT",
          "The model provider is rate limiting this key. Wait a moment and retry.",
          { cause: error },
        );
      }
      return new HarnessError("PROVIDER_ERROR", error.message, { cause: error });
    }
    if (error instanceof Error) {
      return new HarnessError("PROVIDER_ERROR", error.message, { cause: error });
    }
    return new HarnessError("PROVIDER_ERROR", "The model request failed.");
  }
}
