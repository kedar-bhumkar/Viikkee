/**
 * Shared constants for the llmwiki knowledge compiler.
 * Centralized config values to avoid magic numbers scattered across the codebase.
 */

/** Maximum source file size in characters before truncation. */
export const MAX_SOURCE_CHARS = 100_000;

/**
 * Maximum characters of the wiki index included in extraction prompts.
 * The full index grows unboundedly; capping it keeps request payloads
 * within provider limits while still giving the LLM enough context for
 * deduplication.
 */
export const MAX_EXTRACTION_INDEX_CHARS = 30_000;

/** Minimum source content length to ingest without a warning. */
export const MIN_SOURCE_CHARS = 50;

/** Number of most relevant wiki pages to load for query context. */
export const QUERY_PAGE_LIMIT = 5;

/** Maximum concurrent API calls during page generation. */
export const COMPILE_CONCURRENCY = 10;

/** API retry configuration. */
export const RETRY_COUNT = 3;
export const RETRY_BASE_MS = 1000;
export const RETRY_MULTIPLIER = 4;

/** Default provider when LLMWIKI_PROVIDER is not set. */
export const DEFAULT_PROVIDER = "anthropic";

/** Default model per provider. */
export const PROVIDER_MODELS: Record<string, string> = {
  anthropic: "claude-sonnet-4-20250514",
  openai: "gpt-4o",
  ollama: "llama3.1",
  minimax: "MiniMax-M2.7",
  openrouter: "anthropic/claude-sonnet-4-5",
};

/** Default Ollama API base URL. */
export const OLLAMA_DEFAULT_HOST = "http://localhost:11434/v1";

/** Directory names relative to the project root. */
export const SOURCES_DIR = "sources";
export const CONCEPTS_DIR = "wiki/concepts";
export const QUERIES_DIR = "wiki/queries";
export const LLMWIKI_DIR = ".llmwiki";
export const STATE_FILE = ".llmwiki/state.json";
export const LOCK_FILE = ".llmwiki/lock";
export const INDEX_FILE = "wiki/index.md";
export const MOC_FILE = "wiki/MOC.md";
export const EMBEDDINGS_FILE = ".llmwiki/embeddings.json";

/** Number of most similar pages to return from embedding-based pre-filter. */
export const EMBEDDING_TOP_K = 15;

/** Embedding model to use per provider. */
export const EMBEDDING_MODELS: Record<string, string> = {
  anthropic: "voyage-3-lite",
  openai: "text-embedding-3-small",
  ollama: "nomic-embed-text",
  openrouter: "openai/text-embedding-3-small",
};

/** Path to the persisted hierarchy tree (relative to project root). */
export const HIERARCHY_FILE = ".llmwiki/hierarchy.json";

/** Append-only JSONL log of every compilation run (relative to project root). */
export const COMPILE_LOG_FILE = ".llmwiki/compile-log.jsonl";

/** Output directory for the generated static HTML wiki (relative to project root). */
export const WEB_DIR = "wiki/web";

/** Maximum evaluator loop iterations before accepting the best result. */
export const HIERARCHY_MAX_ITERATIONS = 3;

/** Minimum evaluator score (0-100) to accept a hierarchy without further iteration. */
export const HIERARCHY_ACCEPT_SCORE = 80;

/**
 * Maximum number of concepts added+removed before a full hierarchy recompute is
 * triggered. Below this threshold the cheaper incremental placement path is used.
 * Kept low (5) because the single incremental LLM call can silently truncate
 * its output when asked to place many concepts, leaving slugs out of the tree
 * and producing 404s. A small threshold ensures large batches always get the
 * reliable full evaluator loop.
 */
export const HIERARCHY_INCREMENTAL_THRESHOLD = 5;

/**
 * Maximum fraction of total concepts that may change before forcing a full
 * recompute. Set to 1% so even a modest batch of new concepts from a single
 * source triggers the full loop rather than the truncation-prone incremental path.
 */
export const HIERARCHY_INCREMENTAL_RATIO = 0.01;

/**
 * Concept count above which the two-phase generator is used:
 * Phase 1 builds the category structure (no assignments),
 * Phase 2 assigns concepts in batches to avoid output-token limits.
 */
export const HIERARCHY_TWO_PHASE_THRESHOLD = 200;

/** Number of concepts assigned per LLM call in two-phase mode.
 * Kept at 75 so output fits within 4096 tokens (75 × ~50 tokens/assignment). */
export const HIERARCHY_ASSIGNMENT_BATCH_SIZE = 75;
