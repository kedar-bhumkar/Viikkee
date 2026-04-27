/**
 * Core type definitions for the llmwiki knowledge compiler.
 * All shared interfaces live here to keep the module boundary clean.
 */

/** A single concept extracted from a source by the LLM. */
export interface ExtractedConcept {
  concept: string;
  summary: string;
  is_new: boolean;
  tags?: string[];
}

/** Per-source entry in .llmwiki/state.json. */
export interface SourceState {
  hash: string;
  concepts: string[];
  compiledAt: string;
}

/** Root shape of .llmwiki/state.json. */
export interface WikiState {
  version: 1;
  indexHash: string;
  sources: Record<string, SourceState>;
  /** Concept slugs frozen across batches to preserve content from deleted sources. */
  frozenSlugs?: string[];
}

/** Change detection result for a single source file. */
export interface SourceChange {
  file: string;
  status: "new" | "changed" | "unchanged" | "deleted";
}

/** Wiki page frontmatter parsed from YAML. */
interface WikiFrontmatter {
  title: string;
  sources: string[];
  summary: string;
  orphaned?: boolean;
  tags?: string[];
  aliases?: string[];
  createdAt: string;
  updatedAt: string;
}

/** Summary entry used in index.md generation. */
export interface PageSummary {
  title: string;
  slug: string;
  summary: string;
}

/** Structured result returned by the compile pipeline. */
export interface CompileResult {
  compiled: number;
  skipped: number;
  deleted: number;
  concepts: string[];
  pages: string[];
  errors: string[];
}

/** Structured result returned by the query pipeline. */
export interface QueryResult {
  answer: string;
  selectedPages: string[];
  reasoning: string;
  saved?: string;
}

/** Structured result returned by the ingest pipeline. */
export interface IngestResult {
  filename: string;
  charCount: number;
  truncated: boolean;
  source: string;
}

/** A single node in the concept hierarchy tree (category or subcategory). */
export interface HierarchyNode {
  name: string;
  slug: string;
  description: string;
  /** Concept slugs placed directly at this level. */
  concepts: string[];
  /** Child nodes — up to 2 sub-levels deep. */
  children: HierarchyNode[];
}

/** The full 3-level hierarchy tree produced by the evaluator loop. */
export interface HierarchyTree {
  categories: HierarchyNode[];
}

/** Per-rubric score and commentary from the hierarchy evaluator. */
export interface RubricItem {
  score: number;
  notes: string;
}

/** Full structured output from the hierarchy evaluator LLM call. */
export interface HierarchyEvalResult {
  score: number;
  rubric: {
    coverage: RubricItem;
    coherence: RubricItem;
    balance: RubricItem;
    depth: RubricItem;
  };
  critique: string;
  accept: boolean;
}

/** One entry in the append-only .llmwiki/compile-log.jsonl. */
export interface CompileLogEntry {
  /** ISO 8601 timestamp of when the compilation finished. */
  timestamp: string;
  compiled: number;
  skipped: number;
  deleted: number;
  /** Slugs of brand-new concepts produced this run. */
  newConcepts: string[];
  /** Slugs of existing concepts that were updated this run. */
  updatedConcepts: string[];
  errors: string[];
}

/** Persisted to .llmwiki/hierarchy.json alongside the wiki state. */
export interface HierarchyState {
  score: number;
  iterations: number;
  generatedAt: string;
  /** SHA-256 of sorted concept slugs — detects when concepts change and rebuild is needed. */
  sourceHash: string;
  tree: HierarchyTree;
}
