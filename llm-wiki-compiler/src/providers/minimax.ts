/**
 * MiniMax LLM provider implementation.
 *
 * Extends OpenAIProvider since MiniMax exposes an OpenAI-compatible API.
 * Uses node-fetch with a custom HTTPS agent that forces HTTP/1.1 (ALPNProtocols: ['http/1.1']).
 * Without this, Node.js negotiates HTTP/2 via ALPN and the MiniMax server closes the
 * connection for large request bodies on Windows (ECONNRESET / "other side closed").
 * curl and Python urllib avoid this because they default to HTTP/1.1 without ALPN negotiation.
 */

import https from "node:https";
import nodeFetch from "node-fetch";
import { OpenAIProvider } from "./openai.js";

/** MiniMax API base URL. */
const MINIMAX_BASE_URL = "https://api.minimax.io/v1";

/**
 * HTTPS agent that suppresses HTTP/2 ALPN advertisement.
 * Shared across all requests — keepAlive:false avoids stale connection reuse.
 */
const HTTP1_AGENT = new https.Agent({
  ALPNProtocols: ["http/1.1"],
  keepAlive: false,
});

/**
 * Fetch wrapper that injects the HTTP/1.1 agent into every request.
 * The OpenAI SDK calls this as `fetch(url, init)` — we forward everything
 * except we add `agent` which is a node-fetch extension to RequestInit.
 */
function fetchHttp1(url: Parameters<typeof nodeFetch>[0], init?: Parameters<typeof nodeFetch>[1]) {
  return nodeFetch(url, { ...init, agent: HTTP1_AGENT });
}

/** MiniMax-backed LLM provider using the OpenAI-compatible endpoint. */
export class MiniMaxProvider extends OpenAIProvider {
  constructor(model: string, apiKey: string) {
    // Cast fetchHttp1 to the fetch signature the SDK expects — the signatures
    // are compatible at runtime even though TypeScript types differ slightly.
    super(model, MINIMAX_BASE_URL, apiKey, fetchHttp1 as unknown as typeof globalThis.fetch);
  }
}
