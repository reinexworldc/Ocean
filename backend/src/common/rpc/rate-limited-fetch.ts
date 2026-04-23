type LimitedFetchOptions = {
  /**
   * Minimum delay enforced between RPC requests for the same origin.
   * Defaults to 25ms (~40 req/s) to be gentle under multi-agent bursts.
   */
  minIntervalMs?: number;
  /**
   * Maximum number of in-flight RPC requests per origin.
   * Defaults to 2 to allow mild parallelism without triggering burst limits.
   */
  maxConcurrency?: number;
  /**
   * Extra cooldown to apply when upstream returns 429.
   * Defaults to 1000ms.
   */
  cooldownMs?: number;
};

type LimiterState = {
  inFlight: number;
  lastStartedAt: number;
  blockedUntil: number;
  queue: Array<{
    run: () => Promise<Response>;
    resolve: (value: Response) => void;
    reject: (reason: unknown) => void;
  }>;
};

const statesByOrigin = new Map<string, LimiterState>();

function getOriginFromInput(input: string | URL | Request): string {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  return new URL(url).origin;
}

function parseRetryAfterMs(headerValue: string | null): number | null {
  if (!headerValue) return null;
  const trimmed = headerValue.trim();
  if (!trimmed) return null;

  const seconds = Number.parseInt(trimmed, 10);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, 60_000);
  }

  const at = Date.parse(trimmed);
  if (Number.isFinite(at)) {
    const delta = at - Date.now();
    return Math.min(Math.max(delta, 0), 60_000);
  }

  return null;
}

function sleepMs(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function ensureState(origin: string): LimiterState {
  const existing = statesByOrigin.get(origin);
  if (existing) return existing;
  const created: LimiterState = {
    inFlight: 0,
    lastStartedAt: 0,
    blockedUntil: 0,
    queue: [],
  };
  statesByOrigin.set(origin, created);
  return created;
}

async function drain(origin: string, options: Required<LimitedFetchOptions>) {
  const state = ensureState(origin);
  if (state.queue.length === 0) return;
  if (state.inFlight >= options.maxConcurrency) return;

  const now = Date.now();
  if (state.blockedUntil > now) {
    const waitMs = state.blockedUntil - now;
    // Schedule another drain after cooldown.
    void sleepMs(waitMs).then(() => drain(origin, options));
    return;
  }

  const sinceLastStart = now - state.lastStartedAt;
  if (sinceLastStart < options.minIntervalMs) {
    void sleepMs(options.minIntervalMs - sinceLastStart).then(() => drain(origin, options));
    return;
  }

  const next = state.queue.shift();
  if (!next) return;

  state.inFlight += 1;
  state.lastStartedAt = Date.now();

  try {
    const res = await next.run();
    if (res.status === 429) {
      const retryAfterMs = parseRetryAfterMs(res.headers.get("retry-after"));
      const extraCooldown = retryAfterMs ?? options.cooldownMs;
      state.blockedUntil = Math.max(state.blockedUntil, Date.now() + extraCooldown);
    }
    next.resolve(res);
  } catch (err) {
    next.reject(err);
  } finally {
    state.inFlight -= 1;
    // Continue draining in case more work is queued.
    void drain(origin, options);
  }
}

/**
 * A fetch wrapper that rate-limits requests per origin.
 * Intended to be used as the `fetch` override for `viem` HTTP transports.
 */
export function createRateLimitedFetch(options?: LimitedFetchOptions): typeof fetch {
  const resolved: Required<LimitedFetchOptions> = {
    minIntervalMs: options?.minIntervalMs ?? Number(process.env.ARC_RPC_MIN_INTERVAL_MS ?? 25),
    maxConcurrency: options?.maxConcurrency ?? Number(process.env.ARC_RPC_MAX_CONCURRENCY ?? 2),
    cooldownMs: options?.cooldownMs ?? Number(process.env.ARC_RPC_COOLDOWN_MS ?? 1000),
  };

  return async (input: string | URL | Request, init?: RequestInit) => {
    const origin = getOriginFromInput(input);
    const state = ensureState(origin);

    return await new Promise<Response>((resolve, reject) => {
      state.queue.push({
        run: () => fetch(input as never, init),
        resolve,
        reject,
      });
      void drain(origin, resolved);
    });
  };
}

