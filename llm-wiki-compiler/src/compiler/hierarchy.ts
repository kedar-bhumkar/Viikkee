/**
 * Hierarchy builder for the llmwiki knowledge compiler.
 *
 * Routes between three execution paths to avoid recomputing the full taxonomy
 * on every source change:
 *
 *   1. Cache hit      — concept set unchanged (same sourceHash) → return stored hierarchy
 *   2. Incremental    — small change (≤ threshold) → 1 LLM placement call
 *   3. Full recompute — first build, forced regen, or large change → generator→evaluator loop
 *
 * The incremental path calls the LLM once to slot new concepts into the existing
 * tree without reorganising it, cutting cost from up to 6 LLM calls down to 1.
 * The threshold is whichever is larger: HIERARCHY_INCREMENTAL_THRESHOLD (absolute)
 * or HIERARCHY_INCREMENTAL_RATIO × total concepts (relative), so it scales as the
 * wiki grows.
 */

import { createHash } from "crypto";
import * as output from "../utils/output.js";
import { callClaude } from "../utils/llm.js";
import { getHierarchyProvider } from "../utils/provider.js";
import { readHierarchy, writeHierarchy } from "../utils/hierarchy-state.js";
import {
  HIERARCHY_MAX_ITERATIONS,
  HIERARCHY_ACCEPT_SCORE,
  HIERARCHY_INCREMENTAL_THRESHOLD,
  HIERARCHY_INCREMENTAL_RATIO,
  HIERARCHY_TWO_PHASE_THRESHOLD,
  HIERARCHY_ASSIGNMENT_BATCH_SIZE,
} from "../utils/constants.js";
import {
  HIERARCHY_GENERATOR_TOOL,
  HIERARCHY_EVALUATOR_TOOL,
  buildGeneratorPrompt,
  buildStructureOnlyPrompt,
  buildBatchAssignmentPrompt,
  buildEvaluatorPrompt,
  buildPlacementPrompt,
  flattenTree,
  parseHierarchyTree,
  parseEvalResult,
  parseAssignments,
} from "./hierarchy-prompts.js";
import type {
  PageSummary,
  HierarchyTree,
  HierarchyNode,
  HierarchyState,
  HierarchyEvalResult,
} from "../utils/types.js";

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

/** Compute a stable hash of the current concept slugs for cache invalidation. */
function computeConceptsHash(concepts: PageSummary[]): string {
  const sorted = [...concepts].map((c) => c.slug).sort().join(",");
  return createHash("sha256").update(sorted).digest("hex");
}

/** Return true when the stored hierarchy was built from the same concept set. */
function isCacheValid(existing: HierarchyState | null, sourceHash: string): boolean {
  return existing !== null && existing.sourceHash === sourceHash;
}

// ---------------------------------------------------------------------------
// Diff helpers (incremental path)
// ---------------------------------------------------------------------------

/** Slugs added or removed since the last hierarchy build. */
interface HierarchyDiff {
  added: string[];
  removed: string[];
}

/** Collect every concept slug that appears anywhere in the tree. */
function collectTreeSlugs(tree: HierarchyTree): Set<string> {
  const slugs = new Set<string>();
  const walk = (node: HierarchyNode): void => {
    for (const slug of node.concepts) slugs.add(slug);
    for (const child of node.children) walk(child);
  };
  for (const cat of tree.categories) walk(cat);
  return slugs;
}

/** Compute which slugs have been added and which removed since the last build. */
function diffConcepts(current: PageSummary[], stored: HierarchyState): HierarchyDiff {
  const currentSlugs = new Set(current.map((c) => c.slug));
  const storedSlugs = collectTreeSlugs(stored.tree);
  return {
    added: [...currentSlugs].filter((s) => !storedSlugs.has(s)),
    removed: [...storedSlugs].filter((s) => !currentSlugs.has(s)),
  };
}

/**
 * Return true when the change is large enough that a full recompute is cheaper
 * than an incremental placement (taxonomy has drifted too far).
 */
function requiresFullRecompute(diff: HierarchyDiff, totalConcepts: number): boolean {
  const changed = diff.added.length + diff.removed.length;
  const threshold = Math.max(
    HIERARCHY_INCREMENTAL_THRESHOLD,
    Math.floor(totalConcepts * HIERARCHY_INCREMENTAL_RATIO),
  );
  return changed > threshold;
}

// ---------------------------------------------------------------------------
// Evaluator loop (full recompute path)
// ---------------------------------------------------------------------------

/** Log each generator→evaluator iteration result. */
function logIteration(iter: number, score: number, accepted: boolean): void {
  const verdict = accepted ? output.success("accepted") : output.warn("revising");
  output.status("*", output.dim(`  Iteration ${iter}/${HIERARCHY_MAX_ITERATIONS}: score ${score}/100 — ${verdict}`));
}

/**
 * Apply a concept→category assignment map to a tree in-place.
 * Concepts whose target slug doesn't match any node are silently skipped.
 */
function applyAssignments(tree: HierarchyTree, assignments: Record<string, string>): HierarchyTree {
  const nodeMap = new Map<string, HierarchyNode>();
  const index = (node: HierarchyNode): void => {
    nodeMap.set(node.slug, node);
    for (const child of node.children) index(child);
  };
  for (const cat of tree.categories) index(cat);

  for (const [conceptSlug, categorySlug] of Object.entries(assignments)) {
    const node = nodeMap.get(categorySlug);
    if (node && !node.concepts.includes(conceptSlug)) node.concepts.push(conceptSlug);
  }
  return tree;
}

/**
 * Phase 2 of the two-phase generator: assign all concepts to the tree structure
 * in batches of HIERARCHY_ASSIGNMENT_BATCH_SIZE to stay within output-token limits.
 * Uses plain completion (no tool calling) for maximum model compatibility.
 */
async function batchAssignConcepts(tree: HierarchyTree, concepts: PageSummary[]): Promise<HierarchyTree> {
  const flatCats = flattenTree(tree);
  for (let i = 0; i < concepts.length; i += HIERARCHY_ASSIGNMENT_BATCH_SIZE) {
    const batch = concepts.slice(i, i + HIERARCHY_ASSIGNMENT_BATCH_SIZE);
    const system = buildBatchAssignmentPrompt(flatCats, batch);
    const raw = await callClaude({
      system,
      messages: [{ role: "user", content: "Assign these concepts to categories." }],
      // No tools — use plain completion so any model can respond with JSON directly.
      // maxTokens overridden: 150 assignments × ~25 tokens each = ~3750 tokens minimum.
      maxTokens: 6000,
      provider: getHierarchyProvider(),
    });
    const parsed = parseAssignments(raw);
    if (parsed) applyAssignments(tree, parsed);
  }
  return tree;
}

/**
 * Two-phase generator for large concept sets (> HIERARCHY_TWO_PHASE_THRESHOLD).
 * Phase 1: build the category structure with empty concepts arrays (plain completion).
 * Phase 2: assign all concepts in batches to avoid output-token limits.
 */
async function callGeneratorTwoPhase(
  concepts: PageSummary[],
  critique: string,
  prevScore: number,
): Promise<HierarchyTree | null> {
  const system = buildStructureOnlyPrompt(concepts, critique, prevScore);
  const raw = await callClaude({
    system,
    messages: [{ role: "user", content: "Return the hierarchy JSON now." }],
    // No tools — embed schema in prompt for maximum model compatibility.
    provider: getHierarchyProvider(),
  });
  const tree = parseHierarchyTree(raw);
  if (!tree) return null;
  return batchAssignConcepts(tree, concepts);
}

/** Call the generator LLM; returns null if output cannot be parsed. */
async function callGenerator(
  concepts: PageSummary[],
  critique: string,
  prevScore: number,
): Promise<HierarchyTree | null> {
  if (concepts.length > HIERARCHY_TWO_PHASE_THRESHOLD) {
    return callGeneratorTwoPhase(concepts, critique, prevScore);
  }
  const system = buildGeneratorPrompt(concepts, critique, prevScore);
  const raw = await callClaude({
    system,
    messages: [{ role: "user", content: "Propose a hierarchy for these concepts." }],
    tools: [HIERARCHY_GENERATOR_TOOL],
    provider: getHierarchyProvider(),
  });
  return parseHierarchyTree(raw);
}

/** Call the evaluator LLM; returns null if output cannot be parsed. */
async function callEvaluator(
  tree: HierarchyTree,
  concepts: PageSummary[],
): Promise<HierarchyEvalResult | null> {
  const system = buildEvaluatorPrompt(tree, concepts);
  const raw = await callClaude({
    system,
    messages: [{ role: "user", content: "Evaluate this hierarchy." }],
    tools: [HIERARCHY_EVALUATOR_TOOL],
    provider: getHierarchyProvider(),
  });
  return parseEvalResult(raw);
}

/** Run the generator→evaluator loop until acceptance or max iterations. */
async function runEvaluatorLoop(
  concepts: PageSummary[],
): Promise<{ tree: HierarchyTree; score: number; iterations: number }> {
  let bestTree: HierarchyTree | null = null;
  let bestScore = 0;
  let critique = "";
  let prevScore = 0;

  for (let iter = 1; iter <= HIERARCHY_MAX_ITERATIONS; iter++) {
    const currentTree = await callGenerator(concepts, critique, prevScore);
    if (!currentTree) {
      output.status("!", output.warn(`  Iteration ${iter}: generator returned unparseable output — retrying.`));
      continue;
    }

    const evalResult = await callEvaluator(currentTree, concepts);
    if (!evalResult) {
      output.status("!", output.warn(`  Iteration ${iter}: evaluator returned unparseable output.`));
      break;
    }

    logIteration(iter, evalResult.score, evalResult.accept);

    // Keep the highest-scoring tree across all iterations.
    if (evalResult.score > bestScore) {
      bestScore = evalResult.score;
      bestTree = currentTree;
    }

    if (evalResult.accept) {
      return { tree: currentTree, score: evalResult.score, iterations: iter };
    }

    critique = evalResult.critique;
    prevScore = evalResult.score;
  }

  if (!bestTree) throw new Error("Hierarchy generator failed to produce a valid tree.");
  return { tree: bestTree, score: bestScore, iterations: HIERARCHY_MAX_ITERATIONS };
}

// ---------------------------------------------------------------------------
// Build paths
// ---------------------------------------------------------------------------

/** Persist and return a new HierarchyState from an evaluator loop result. */
async function runFullBuild(
  root: string,
  concepts: PageSummary[],
  sourceHash: string,
): Promise<HierarchyState> {
  output.header(`Building hierarchy (${concepts.length} concepts, max ${HIERARCHY_MAX_ITERATIONS} iterations)`);
  const { tree, score, iterations } = await runEvaluatorLoop(concepts);

  const verdict = score >= HIERARCHY_ACCEPT_SCORE
    ? output.success(`${score}/100`)
    : output.warn(`${score}/100 (below threshold — using best result)`);
  output.status("✓", `Hierarchy finalised — score ${verdict}`);

  const state: HierarchyState = { score, iterations, generatedAt: new Date().toISOString(), sourceHash, tree };
  await writeHierarchy(root, state);
  return state;
}

/**
 * Slot new concepts into the existing tree with a single LLM call.
 * Preserves existing category structure; only adds/removes the changed concepts.
 */
async function runIncrementalBuild(
  root: string,
  concepts: PageSummary[],
  diff: HierarchyDiff,
  existing: HierarchyState,
  sourceHash: string,
): Promise<HierarchyState> {
  const newConcepts = concepts.filter((c) => diff.added.includes(c.slug));
  const system = buildPlacementPrompt(existing.tree, newConcepts, diff.removed);
  const raw = await callClaude({
    system,
    messages: [{ role: "user", content: "Place these concepts into the hierarchy." }],
    tools: [HIERARCHY_GENERATOR_TOOL],
    provider: getHierarchyProvider(),
  });

  // Fall back to the existing tree if the placement call returns unparseable output.
  const updatedTree = parseHierarchyTree(raw) ?? existing.tree;
  output.status("✓", output.success("Incremental placement complete (1 LLM call)."));

  const state: HierarchyState = {
    score: existing.score,
    iterations: 1,
    generatedAt: new Date().toISOString(),
    sourceHash,
    tree: updatedTree,
  };
  await writeHierarchy(root, state);
  return state;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build or return a cached concept hierarchy for the wiki.
 *
 * Routing logic (in order):
 *   1. sourceHash unchanged  → return cached hierarchy (0 LLM calls)
 *   2. No existing cache     → full evaluator loop    (2–6 LLM calls)
 *   3. forceRegen=true       → full evaluator loop    (2–6 LLM calls)
 *   4. Small diff            → incremental placement  (1 LLM call)
 *   5. Large diff            → full evaluator loop    (2–6 LLM calls)
 *
 * @param root - Project root directory.
 * @param concepts - Current set of wiki page summaries.
 * @param forceRegen - Bypass all caches and force a fresh evaluator loop.
 */
export async function buildHierarchy(
  root: string,
  concepts: PageSummary[],
  forceRegen: boolean,
): Promise<HierarchyState> {
  const sourceHash = computeConceptsHash(concepts);
  const existing = await readHierarchy(root);

  if (!forceRegen && isCacheValid(existing, sourceHash)) {
    output.status("✓", output.success(`Hierarchy up to date (score ${existing!.score}/100, cached).`));
    return existing!;
  }

  if (!existing || forceRegen) {
    return runFullBuild(root, concepts, sourceHash);
  }

  const diff = diffConcepts(concepts, existing);
  const changeDesc = `${diff.added.length} added, ${diff.removed.length} removed`;

  if (requiresFullRecompute(diff, concepts.length)) {
    output.status("*", output.info(`Large change (${changeDesc}) — full recompute.`));
    return runFullBuild(root, concepts, sourceHash);
  }

  output.status("*", output.info(`Small change (${changeDesc}) — incremental placement.`));
  return runIncrementalBuild(root, concepts, diff, existing, sourceHash);
}
