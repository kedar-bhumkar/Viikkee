/**
 * LLM provider abstraction layer.
 *
 * Defines the LLMProvider interface and a factory function that reads
 * LLMWIKI_PROVIDER and LLMWIKI_MODEL env vars to instantiate the
 * appropriate backend (Anthropic, OpenAI, Ollama, or MiniMax).
 */

import { DEFAULT_PROVIDER, PROVIDER_MODELS, OLLAMA_DEFAULT_HOST } from "./constants.js";
import { AnthropicProvider } from "../providers/anthropic.js";
import { OpenAIProvider } from "../providers/openai.js";
import { OllamaProvider } from "../providers/ollama.js";
import { MiniMaxProvider } from "../providers/minimax.js";
import { OpenRouterProvider } from "../providers/openrouter.js";
import {
  resolveAnthropicAuthFromEnv,
  resolveAnthropicBaseURLFromEnv,
  resolveAnthropicModelFromEnv,
} from "./claude-settings.js";

/** A single message in an LLM conversation. */
export interface LLMMessage {
  role: "user" | "assistant";
  content: string;
}

/** A tool definition in Anthropic-style format (used as the canonical shape). */
export interface LLMTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/** Provider-agnostic interface for LLM backends. */
export interface LLMProvider {
  complete(system: string, messages: LLMMessage[], maxTokens: number): Promise<string>;
  stream(
    system: string,
    messages: LLMMessage[],
    maxTokens: number,
    onToken?: (text: string) => void,
  ): Promise<string>;
  toolCall(
    system: string,
    messages: LLMMessage[],
    tools: LLMTool[],
    maxTokens: number,
  ): Promise<string>;
  /** Return a single embedding vector for the given text. */
  embed(text: string): Promise<number[]>;
}

const SUPPORTED_PROVIDERS: ReadonlySet<string> = new Set(["anthropic", "openai", "ollama", "minimax", "openrouter"]);

/**
 * Factory that returns the appropriate LLMProvider based on env vars.
 * Reads LLMWIKI_PROVIDER (default "anthropic") and LLMWIKI_MODEL
 * (defaults per provider from PROVIDER_MODELS).
 *
 * Direct process.env access is acceptable here as this is a system boundary.
 */
export function getProvider(): LLMProvider {
  const providerName = getProviderName();

  switch (providerName) {
    case "anthropic":
      return getAnthropicProvider();
    case "openai":
      return new OpenAIProvider(getModelForProvider("openai"));
    case "ollama":
      return new OllamaProvider(
        getModelForProvider("ollama"),
        process.env.OLLAMA_HOST ?? OLLAMA_DEFAULT_HOST,
      );
    case "minimax":
      return getMiniMaxProvider();
    case "openrouter":
      return getOpenRouterProvider();
    default:
      throw new Error(`Unhandled provider: ${providerName}`);
  }
}

function getOpenRouterProvider(): OpenRouterProvider {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OpenRouter provider requires OPENROUTER_API_KEY environment variable.\n" +
      "  Set it with: export OPENROUTER_API_KEY=your_key",
    );
  }
  const model = process.env.LLMWIKI_MODEL ?? PROVIDER_MODELS.openrouter;
  return new OpenRouterProvider(model, apiKey);
}

function getModelForProvider(providerName: "openai" | "ollama" | "minimax"): string {
  return process.env.LLMWIKI_MODEL ?? PROVIDER_MODELS[providerName];
}

function getMiniMaxProvider(): MiniMaxProvider {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    throw new Error(
      "MiniMax provider requires MINIMAX_API_KEY environment variable.\n" +
      '  Set it with: export MINIMAX_API_KEY=your_key',
    );
  }
  return new MiniMaxProvider(getModelForProvider("minimax"), apiKey);
}

function getAnthropicProvider(): AnthropicProvider {
  const model = resolveAnthropicModelFromEnv() ?? PROVIDER_MODELS.anthropic;
  const baseURL = resolveAnthropicBaseURLFromEnv();
  const auth = resolveAnthropicAuthFromEnv();

  return new AnthropicProvider(model, {
    baseURL,
    ...auth,
  });
}

function getProviderName(): string {
  const providerName = process.env.LLMWIKI_PROVIDER ?? DEFAULT_PROVIDER;
  if (!SUPPORTED_PROVIDERS.has(providerName)) {
    throw new Error(
      `Unknown provider "${providerName}". Supported: ${[...SUPPORTED_PROVIDERS].join(", ")}`,
    );
  }
  return providerName;
}

/** Expose the resolved provider name for callers that need model lookup. */
export function getActiveProviderName(): string {
  return getProviderName();
}

/**
 * Return the provider to use specifically for hierarchy generation.
 *
 * If LLMWIKI_HIERARCHY_MODEL is set in the environment, a provider of the
 * same type as the active provider is returned but with that model instead.
 * This lets a tool-capable model (e.g. anthropic/claude-3.5-haiku) handle
 * the structured taxonomy tool-calls while a different model (e.g. Kimi K2.6)
 * handles page generation.
 *
 * Falls back to getProvider() when LLMWIKI_HIERARCHY_MODEL is not set.
 */
export function getHierarchyProvider(): LLMProvider {
  const hierarchyModel = process.env.LLMWIKI_HIERARCHY_MODEL;
  if (!hierarchyModel) return getProvider();

  // Temporarily swap LLMWIKI_MODEL so getProvider() picks up the hierarchy model.
  const saved = process.env.LLMWIKI_MODEL;
  process.env.LLMWIKI_MODEL = hierarchyModel;
  const provider = getProvider();
  if (saved !== undefined) {
    process.env.LLMWIKI_MODEL = saved;
  } else {
    delete process.env.LLMWIKI_MODEL;
  }
  return provider;
}
