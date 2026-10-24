import type { HarnessLogger, ModelProvider, PageFetcher, Pricing, SearchProvider } from "./types";
import { MockProvider } from "./providers/mock";
import { OpenAICompatibleProvider } from "./providers/openai";
import { PageReader } from "./reader/reader";
import { ArxivProvider } from "./search/arxiv";
import { BingNewsProvider } from "./search/bing-news";
import { BraveProvider } from "./search/brave";
import { DuckDuckGoProvider } from "./search/duckduckgo";
import { ExaProvider } from "./search/exa";
import { MergedSearchProvider } from "./search/merged";
import { MultiSearchProvider } from "./search/multi";
import { SerperProvider } from "./search/serper";
import { TavilyProvider } from "./search/tavily";
import { WikipediaProvider } from "./search/wikipedia";

export type RuntimeEnv = Record<string, string | undefined>;

export interface DossierRuntime {
  provider: ModelProvider;
  search: SearchProvider;
  fetcher: PageFetcher;
  demo: boolean;
  demoReason: "forced" | "no_api_key" | null;
  model: string;
  searchProviders: string[];
  searchLabel: string;
  pricing: Pricing | null;
}

export interface RuntimeOptions {
  logger?: HarnessLogger;
}

function numberFromEnv(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function pickSearch(
  env: RuntimeEnv,
  logger?: HarnessLogger,
): {
  provider: SearchProvider;
  providers: string[];
  label: string;
} {
  const tavily = new TavilyProvider(env.TAVILY_API_KEY ?? "");
  const brave = new BraveProvider(env.BRAVE_API_KEY ?? "");
  const serper = new SerperProvider(env.SERPER_API_KEY ?? "");
  const exa = new ExaProvider(env.EXA_API_KEY ?? "");
  const duckduckgo = new DuckDuckGoProvider();
  const wikipedia = new WikipediaProvider();
  const bingNews = new BingNewsProvider();
  const arxiv = new ArxivProvider();

  const available: SearchProvider[] = [];
  if (env.TAVILY_API_KEY) available.push(tavily);
  if (env.BRAVE_API_KEY) available.push(brave);
  if (env.SERPER_API_KEY) available.push(serper);
  if (env.EXA_API_KEY) available.push(exa);

  const requested = (env.SEARCH_PROVIDER ?? "auto").toLowerCase();
  let primary: SearchProvider;
  if (requested === "duckduckgo" || requested === "ddg") {
    primary = duckduckgo;
  } else if (requested === "tavily") {
    primary = env.TAVILY_API_KEY ? tavily : duckduckgo;
  } else if (requested === "brave") {
    primary = env.BRAVE_API_KEY ? brave : duckduckgo;
  } else if (requested === "serper") {
    primary = env.SERPER_API_KEY ? serper : duckduckgo;
  } else if (requested === "exa") {
    primary = env.EXA_API_KEY ? exa : duckduckgo;
  } else {
    primary = available[0] ?? duckduckgo;
  }

  if (requested !== "auto" && requested !== primary.id && requested !== "ddg") {
    logger?.warn(`Search provider "${requested}" is not configured; using ${primary.label}.`);
  }

  const freeFallback =
    primary.id === "duckduckgo"
      ? new MergedSearchProvider([wikipedia, bingNews, arxiv], logger)
      : new MergedSearchProvider([duckduckgo, wikipedia, bingNews, arxiv], logger);

  const multi = new MultiSearchProvider(primary, freeFallback, logger);
  return {
    provider: multi,
    providers: [primary.id, ...freeFallback.providerIds],
    label: multi.label,
  };
}

export function createRuntimeFromEnv(
  env: RuntimeEnv = process.env,
  options: RuntimeOptions = {},
): DossierRuntime {
  const forcedDemo = env.DOSSIER_DEMO === "1" || env.DOSSIER_DEMO === "true";
  const openaiKey = env.OPENAI_API_KEY?.trim();
  const genericKey = env.MODEL_API_KEY?.trim();
  const deepseekKey = env.DEEPSEEK_API_KEY?.trim();
  const apiKey = openaiKey || genericKey || deepseekKey;
  const demo = forcedDemo || !apiKey;

  const defaultDelay = Number(env.DOSSIER_DEMO_DELAY_MS ?? "12");
  const provider: ModelProvider = demo
    ? new MockProvider({ delayMs: Number.isFinite(defaultDelay) ? defaultDelay : 12 })
    : new OpenAICompatibleProvider({
        apiKey: apiKey ?? "",
        baseUrl:
          env.OPENAI_BASE_URL ||
          env.MODEL_BASE_URL ||
          (deepseekKey && !openaiKey && !genericKey ? "https://api.deepseek.com/v1" : undefined),
        model:
          env.OPENAI_MODEL ||
          env.MODEL_NAME ||
          (deepseekKey && !openaiKey && !genericKey ? "deepseek-chat" : "gpt-4.1-mini"),
      });

  const search = pickSearch(env, options.logger);
  const inputPrice = numberFromEnv(env.MODEL_INPUT_USD_PER_1M);
  const outputPrice = numberFromEnv(env.MODEL_OUTPUT_USD_PER_1M);
  const pricing =
    inputPrice !== null && outputPrice !== null
      ? { inputUsdPerM: inputPrice, outputUsdPerM: outputPrice }
      : null;

  return {
    provider,
    search: search.provider,
    fetcher: new PageReader(),
    demo,
    demoReason: forcedDemo ? "forced" : !apiKey ? "no_api_key" : null,
    model: provider.model,
    searchProviders: search.providers,
    searchLabel: search.label,
    pricing,
  };
}
