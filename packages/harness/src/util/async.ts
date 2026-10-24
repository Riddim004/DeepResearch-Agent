export class AbortedError extends Error {
  constructor() {
    super("The operation was aborted.");
    this.name = "AbortError";
  }
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason instanceof Error ? signal.reason : new AbortedError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      reject(signal?.reason instanceof Error ? signal.reason : new AbortedError());
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, limit), items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      const item = items[index];
      if (item === undefined) return;
      results[index] = await mapper(item, index);
    }
  });
  await Promise.all(workers);
  return results;
}

export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.tail.then(task, task);
    this.tail = next.catch(() => undefined);
    return next;
  }
}

export class KeyedLimiter {
  private readonly states = new Map<string, { active: number; waiters: Array<() => void> }>();
  private readonly perKey: number;

  constructor(perKey = 1) {
    this.perKey = Math.max(1, perKey);
  }

  async run<T>(key: string, task: () => Promise<T>): Promise<T> {
    let state = this.states.get(key);
    if (!state) {
      state = { active: 0, waiters: [] };
      this.states.set(key, state);
    }
    if (state.active >= this.perKey) {
      await new Promise<void>((resolve) => state?.waiters.push(resolve));
    }
    state.active += 1;
    try {
      return await task();
    } finally {
      state.active -= 1;
      const next = state.waiters.shift();
      if (next) {
        next();
      } else if (state.active === 0) {
        this.states.delete(key);
      }
    }
  }
}

export function combineSignals(signals: Array<AbortSignal | undefined>): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const valid = signals.filter((signal): signal is AbortSignal => Boolean(signal));
  if (valid.length === 0) {
    return { signal: new AbortController().signal, cleanup: () => undefined };
  }
  if (valid.length === 1) {
    const only = valid[0];
    if (!only) throw new Error("unreachable");
    return { signal: only, cleanup: () => undefined };
  }
  const controller = new AbortController();
  const listeners: Array<() => void> = [];
  for (const signal of valid) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    const onAbort = () => controller.abort(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    listeners.push(() => signal.removeEventListener("abort", onAbort));
  }
  return {
    signal: controller.signal,
    cleanup: () => listeners.forEach((remove) => remove()),
  };
}
