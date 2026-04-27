/**
 * OpenRouter LLM provider implementation.
 *
 * OpenRouter exposes an OpenAI-compatible REST API for both completions and
 * embeddings, so this class extends OpenAIProvider and overrides only:
 *   - Base URL         → https://openrouter.ai/api/v1
 *   - API key          → OPENROUTER_API_KEY env var
 *   - Embedding model  → openai/text-embedding-3-small (via OpenRouter)
 *
 * A single client handles both completion and embedding calls — no secondary
 * API key needed.
 */

import { OpenAIProvider } from "./openai.js";
import { EMBEDDING_MODELS } from "../utils/constants.js";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/** OpenRouter-backed LLM provider (OpenAI-compatible). */
export class OpenRouterProvider extends OpenAIProvider {
  constructor(model: string, apiKey: string) {
    super(model, OPENROUTER_BASE_URL, apiKey);
  }

  /** Use LLMWIKI_EMBEDDING_MODEL from env if set, otherwise the constant default. */
  protected override embeddingModel(): string {
    return process.env.LLMWIKI_EMBEDDING_MODEL ?? EMBEDDING_MODELS.openrouter;
  }

  // complete(), stream(), toolCall(), and embed() are all inherited from
  // OpenAIProvider — they use the same client pointed at the OpenRouter base URL.
}
