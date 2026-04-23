# Ocean — Circle Product Feedback

**Project:** Ocean — an AI crypto analyst and trading assistant that charges sub-cent nanopayments per API tool call using x402 on Arc testnet.

**Stack:** NestJS backend, React frontend, Gemini AI, Circle Wallets (EOA), Circle Gateway, @circle-fin/x402-batching, @x402/core, viem, Prisma/SQLite.

---

## 1. Circle Wallets (EOA on Arc Testnet)

### What worked well
- The `createWallets` + `signTypedData` API surface is clean and easy to integrate.  
- Wallet creation is fast; idempotency keys work reliably.

### Pain points

**signTypedData — EIP-712 domain shape must be built manually.**  
The Circle API rejects calls if the `EIP712Domain` type array does not exactly match the fields present in the domain object — no more, no less. For example, if the domain has `salt` but the types array omits it, the signature is invalid; if the domain lacks `chainId` but the array includes it, the call errors. We had to write a `buildEip712DomainTypes()` helper that dynamically constructs the type array from the domain object's own keys. This behaviour isn't documented anywhere; we discovered it through repeated failures.

```ts
// We had to do this just to call signTypedData correctly:
private buildEip712DomainTypes(domain: Record<string, unknown>) {
  const entries: Array<{ name: string; type: string }> = [];
  if (domain.name !== undefined)              entries.push({ name: "name",              type: "string"  });
  if (domain.version !== undefined)           entries.push({ name: "version",           type: "string"  });
  if (domain.chainId !== undefined)           entries.push({ name: "chainId",           type: "uint256" });
  if (domain.verifyingContract !== undefined) entries.push({ name: "verifyingContract", type: "address" });
  if (domain.salt !== undefined)              entries.push({ name: "salt",              type: "bytes32" });
  return entries;
}
```

**Recommendation:** Document this requirement explicitly, or accept the domain object directly and derive the type array server-side.

---

**signTypedData rejects BigInt values in the message.**  
The @x402/evm `authorizationTypes` message includes `BigInt` fields (`value`, `validAfter`, `validBefore`). Circle's API does not accept BigInt-serialized JSON — it expects plain strings. We had to add a `normalizeTypedDataValue()` recursive visitor that converts every `bigint` → `string` before calling `signTypedData`. This is a silent failure: no helpful error is returned, the call just fails or returns an invalid signature.

**Recommendation:** Either accept BigInt in the API or document that all numeric EIP-712 message values must be serialised as strings.

---

**No built-in local signature verification.**  
After a payment fails we couldn't tell whether the signature was wrong, the nonce was replayed, or the facilitator was misbehaving. We ended up writing `buildPaymentSignatureDiagnostics()` which calls viem's `verifyTypedData` locally to verify the signature before submission. This should be a first-class SDK utility.

---

## 2. Circle Gateway (`@circle-fin/x402-batching` — `GatewayClient`)

### What worked well
- `depositFor(amount, recipientAddress)` is a one-liner that handles the Gateway contract call.
- `getBalances()` returns a clean `{ wallet, gateway }` breakdown that maps directly to a useful UI.
- `CHAIN_CONFIGS.arcTestnet` makes it easy to find the USDC and Gateway contract addresses without hardcoding.

### Pain points

**approve + depositFor are two separate on-chain transactions; the SDK doesn't document this.**  
Before the first `depositFor` call can succeed, the funder wallet must `approve(gatewayWallet, amount)`. There is no mention of this in the README, and the SDK does not call `approve` automatically (there is a `skipApprovalCheck` flag but it skips the check, not the approval). We discovered this only when `depositFor` started reverting on-chain.

Our solution was to write an `ensureGatewayApproval()` method that:
1. Reads current allowance via `readContract`.
2. If insufficient, submits `approve(gatewayWallet, maxUint256)` once.
3. Deduplicates concurrent callers: stores the in-flight approval as a `Promise<void>` so that if two users click "fund" simultaneously only one approval transaction is submitted.
4. Waits up to **15 minutes** for the receipt because Arc testnet block times are sometimes very slow.

```ts
private async ensureGatewayApproval(gateway: GatewayClient): Promise<void> {
  if (this.pendingApproval) return this.pendingApproval;  // dedup concurrent calls

  const currentAllowance = await gateway.publicClient.readContract({
    address: chainConfig.usdc,
    abi: erc20Abi,
    functionName: "allowance",
    args: [gateway.account.address, chainConfig.gatewayWallet],
  });

  if (currentAllowance >= depositAmountRaw) return;

  const approveTxHash = await gateway.walletClient.writeContract({
    address: chainConfig.usdc,
    abi: erc20Abi,
    functionName: "approve",
    args: [chainConfig.gatewayWallet, maxUint256],
  });

  this.pendingApproval = gateway.publicClient
    .waitForTransactionReceipt({ hash: approveTxHash, timeout: 900_000 })
    .finally(() => { this.pendingApproval = null; });

  return this.pendingApproval;
}
```

**Recommendation:** Either have `GatewayClient.depositFor()` auto-approve with an opt-out flag, or add a `GatewayClient.ensureApproval()` helper, and document the two-step flow prominently.

---

**Arc testnet block times are unpredictable (sometimes 60 s+).**  
`waitForTransactionReceipt` with the default viem timeout (1–2 min) timed out several times during development. We hard-coded a 15-minute timeout for the approval receipt. It would help to have an official recommended `timeout` value for Arc testnet in the docs.

---

## 3. x402 Protocol (`@x402/core`, `@x402/evm`, `@circle-fin/x402-batching`)

### What worked well
- The overall flow (402 → sign → retry with `X-Payment` header → settlement header) is elegant and worked correctly end-to-end once we understood the EIP-712 format requirements.
- `x402HTTPClient` wraps the request lifecycle cleanly; `getPaymentRequiredResponse` and `getPaymentSettleResponse` are easy to use.
- `registerBatchScheme(client, { signer, networks, fallbackScheme })` makes it easy to opt-in to batched settlement with a fallback to exact EVM.
- The settlement header `PAYMENT-RESPONSE` (plus the aliased `X-PAYMENT-RESPONSE`) conveys `{ success, transaction, network }` in a compact way.

### Pain points

**Arc RPC rate limiting causes 429s inside the x402 signing flow.**  
The `ExactEvmScheme` and `GatewayEvmScheme` make RPC calls (e.g. `eth_call` to check allowance, `eth_sendRawTransaction` to settle) against the Arc node. Under multi-agent parallelism these can burst and trigger 429 responses from `rpc.testnet.arc.network`. The x402 SDK does not have built-in retry/backoff for RPC 429s — the payment just fails.

We solved this by wrapping all viem transports in a custom `createRateLimitedFetch()` function that:
- Queues requests per origin.
- Enforces a minimum 25 ms inter-request interval (~40 req/s).
- Caps in-flight requests at 2 per origin.
- Reads the `retry-after` header on 429 to know how long to cool down.
- Schedules a drain after the cooldown so queued requests eventually proceed.

```ts
if (res.status === 429) {
  const retryAfterMs = parseRetryAfterMs(res.headers.get("retry-after"));
  const extraCooldown = retryAfterMs ?? options.cooldownMs;
  state.blockedUntil = Math.max(state.blockedUntil, Date.now() + extraCooldown);
}
```

**Recommendation:** Build rate-limit-aware retry into the Arc-specific transport (or into `arcHttpTransport` in an official SDK). Document the RPC rate limits for the testnet.

---

**The x402 payment sometimes needs to be re-challenged before the paid response arrives.**  
When we submitted a signed payment and got back a non-200 response without a settlement header, we weren't sure whether we should use the original `paymentRequired` challenge or re-request a fresh challenge. In practice the server can return a new 402 challenge in the body even on a 4xx/5xx status. We had to write `readPaymentRequiredFromResponse()` to detect and apply the new challenge before retrying.

```ts
const retryPaymentRequired = this.readPaymentRequiredFromResponse(x402HttpClient, paidResponse, rawPaidBody);
if (retryPaymentRequired) {
  paymentRequired = retryPaymentRequired as never;
}
```

**Recommendation:** Document when the server may issue a fresh challenge mid-flow, and provide an `x402HTTPClient.refreshChallenge()` helper.

---

**No way to re-use a signed payment nonce across retries.**  
Each `createPaymentPayload` call generates a new nonce. Under rate-limit retries we have to create a fresh payload on every attempt, which means a fresh signature request to Circle on every attempt. It would be useful to be able to reuse a signed payload within its `validBefore` window.

---

**`x402ResourceServer` initialization must be awaited before the first request.**  
`resourceServer.initialize()` is async and must complete before any route can respond with a 402. In our NestJS guard we call `await this.x402Service.ensureInitialized()` on every request, protected by a cached promise. The SDK should offer a first-class `isInitialized` flag and a safe-to-call-multiple-times `initialize()`.

---

**Dynamic price functions are not documented.**  
The `price` field on x402 charge options can be a `PriceFn` (an async function that receives the request and returns a price string). This is a powerful feature for usage-based pricing (we used it to compute per-endpoint costs based on RPC call estimates), but it's not mentioned in any README or JSDoc. We found it by reading the TypeScript types. 

```ts
// We used dynamic pricing to make costs transparent and proportional to RPC usage:
export async function estimateTransfersPrice(_req): Promise<string> {
  const cost = RPC_COSTS.blockNumber + RPC_COSTS.decimals + RPC_COSTS.getLogsBatch;
  return `$${Math.max(cost, MIN_PRICE).toFixed(4)}`;
}
```

**Recommendation:** Document PriceFn prominently — it's the key primitive for per-call usage pricing.

---

## 4. Arc Testnet (Network)

### Pain points

- **RPC 429 bursts** under modest parallelism (2–3 concurrent tool calls). The rate limit is not documented; we found the threshold empirically.
- **Slow block times** (10 s to 3+ min in our experience on the testnet) make `waitForTransactionReceipt` unpredictable. A shorter polling interval and a higher default timeout would help.
- **No dedicated testnet faucet API** — tokens had to be manually requested, which slowed agent-to-agent load testing.
- `arcscan.app` explorer works well and was the fastest way to confirm whether a transaction actually landed.

---

## 5. Developer Experience: What we wish existed

| Gap | Suggested fix |
|-----|--------------|
| No end-to-end "first payment in 5 min" guide for Arc + Circle Wallets + x402 | A minimal TypeScript example doing wallet provisioning → Gateway deposit → one x402 API call |
| `signTypedData` EIP-712 domain requirements undocumented | Add a structured spec table (which fields are required, which optional) |
| `approve` prerequisite for `depositFor` not documented | Add to `GatewayClient` README |
| No built-in signature verification after signing | Add a `verifyPaymentPayload(payload, expectedAddress)` SDK utility |
| RPC rate limit thresholds not published | Publish RPS limits per endpoint type in Arc docs |
| `PriceFn` dynamic pricing undocumented | Add a "dynamic pricing" guide with example |
| No retry-aware RPC transport | Ship `arcHttpTransport` with built-in 429 handling |

---

## 6. What was genuinely impressive

- **The x402 payment handshake is elegant.** The 402 → sign → re-request → settlement header flow is a natural HTTP primitive and requires zero smart-contract knowledge from the user side. It just works once the EIP-712 plumbing is right.
- **Gateway deposit abstraction** (`depositFor`) hides all the L2 deposit complexity. Once we figured out the `approve` prerequisite, it was a one-line call.
- **Arc transaction finality** is fast (when the node isn't overloaded) — confirmed settlements in 2–5 s, which is critical for an interactive chat experience.
- **`@circle-fin/x402-batching`'s `GatewayEvmScheme`** is a great idea: it routes payments through the Gateway so the user's on-chain balance can be maintained off the hot path.
- **Per-call cost transparency** is a feature users immediately noticed positively — seeing a live "$0.01 · Tx ↗" link next to each API call on Arc testnet resonated well.

---

## 7. Summary metrics from our demo

- **Transactions per session (typical):** 8–15 on-chain settlements per multi-token research query
- **Cost per query:** $0.07–$0.15 total (vs. ~$24–$50 estimated on Ethereum mainnet at current gas prices — a 340× saving shown live in our UI)
- **Lowest per-call cost:** $0.01 (market overview, token profile)
- **Settlement latency:** 2–8 s on Arc testnet (fast enough for interactive UI; slow only during testnet congestion)
- **Retry events encountered:** ~20% of sessions triggered at least one x402 retry due to Arc RPC 429s
- **Model swap events:** ~5% of Gemini calls required a fallback to `gemini-2.0-flash` or OpenRouter, surfaced transparently in the UI
