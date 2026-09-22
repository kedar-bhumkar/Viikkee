/**
 * LLM prompt templates and tool schemas for the hierarchy evaluator loop.
 *
 * Contains two Anthropic tool definitions (propose_hierarchy, evaluate_hierarchy),
 * their associated system prompt builders, and parsers for their structured output.
 * The generator and evaluator run in a loop: the generator proposes a 3-level
 * taxonomy, the evaluator scores it, and the generator revises until the score
 * meets the threshold or the iteration limit is reached.
 */

import type { HierarchyTree, HierarchyEvalResult, HierarchyNode } from "../utils/types.js";
import type { PageSummary } from "../utils/types.js";
import { extractJsonString } from "../utils/json.js";

/** A flattened category entry used in batch-assignment prompts. */
export interface FlatCategory {
  slug: string;
  name: string;
  description: string;
  path: string;
}

/** JSON Schema for a single leaf-level (level 3) hierarchy node. */
const level3NodeSchema = {
  type: "object" as const,
  properties: {
    name: { type: "string", description: "Human-readable category name (noun phrase)" },
    slug: { type: "string", description: "kebab-case identifier, unique across the tree" },
    description: { type: "string", description: "One-sentence description of this category" },
    concepts: {
      type: "array",
      items: { type: "string" },
      description: "Concept slugs placed at this level",
    },
  },
  required: ["name", "slug", "description", "concepts"],
};

/** JSON Schema for a level 2 hierarchy node (may have level 3 children). */
const level2NodeSchema = {
  type: "object" as const,
  properties: {
    name: { type: "string" },
    slug: { type: "string" },
    description: { type: "string" },
    concepts: { type: "array", items: { type: "string" } },
    children: { type: "array", items: level3NodeSchema },
  },
  required: ["name", "slug", "description", "concepts", "children"],
};

/** JSON Schema for a top-level (level 1) hierarchy node. */
const level1NodeSchema = {
  type: "object" as const,
  properties: {
    name: { type: "string" },
    slug: { type: "string" },
    description: { type: "string" },
    concepts: { type: "array", items: { type: "string" } },
    children: { type: "array", items: level2NodeSchema },
  },
  required: ["name", "slug", "description", "concepts", "children"],
};

/** Tool definition for the hierarchy generator. */
export const HIERARCHY_GENERATOR_TOOL = {
  name: "propose_hierarchy",
  description: "Propose a 3-level concept taxonomy for the wiki",
  input_schema: {
    type: "object" as const,
    properties: {
      categories: { type: "array", items: level1NodeSchema },
    },
    required: ["categories"],
  },
};

/** Tool definition for the hierarchy evaluator. */
const HIERARCHY_EVALUATOR_TOOL = {
  name: "evaluate_hierarchy",
  description: "Score the proposed hierarchy on coverage, coherence, balance, and depth utility",
  input_schema: {
    type: "object" as const,
    properties: {
      score: { type: "number", description: "Total score 0-100" },
      rubric: {
        type: "object",
        properties: {
          coverage: {
            type: "object",
            properties: {
              score: { type: "number" },
              notes: { type: "string" },
            },
            required: ["score", "notes"],
          },
          coherence: {
            type: "object",
            properties: {
              score: { type: "number" },
              notes: { type: "string" },
            },
            required: ["score", "notes"],
          },
          balance: {
            type: "object",
            properties: {
              score: { type: "number" },
              notes: { type: "string" },
            },
            required: ["score", "notes"],
          },
          depth: {
            type: "object",
            properties: {
              score: { type: "number" },
              notes: { type: "string" },
            },
            required: ["score", "notes"],
          },
        },
        required: ["coverage", "coherence", "balance", "depth"],
      },
      critique: { type: "string", description: "Specific revision instructions if score < 80" },
      accept: { type: "boolean", description: "True if score >= 80 and hierarchy is ready" },
    },
    required: ["score", "rubric", "critique", "accept"],
  },
};

/** Format the concept list for embedding in a prompt. */
function formatConceptList(concepts: PageSummary[]): string {
  return concepts
    .map((c) => `- ${c.title} (slug: ${c.slug}): ${c.summary}`)
    .join("\n");
}

/**
 * Build the system prompt for the hierarchy generator.
 * On the first iteration, critique and currentTree are empty.
 * On subsequent iterations, they carry evaluator feedback.
 * @param concepts - All wiki concepts with title, slug, and summary.
 * @param critique - Evaluator feedback from the previous iteration (empty on first).
 * @param prevScore - Score from the previous iteration (0 on first).
 */
export function buildGeneratorPrompt(
  concepts: PageSummary[],
  critique: string,
  prevScore: number,
): string {
  const revisionSection = critique
    ? `\nPrevious attempt scored ${prevScore}/100. Revise based on this feedback:\n${critique}\n`
    : "";

  return [
    "You are a knowledge architect organizing a wiki into a navigable 3-level hierarchy.",
    "",
    "Rules:",
    "- Create 3-7 top-level categories (broad noun phrases)",
    "- Each category may have 1-3 subcategories (level 2)",
    "- Each subcategory may have further specializations (level 3)",
    "- Every concept must be placed in exactly ONE node (tree, not tags)",
    "- A concept may sit at any level — it need not be at the deepest level",
    "- Category slugs must be kebab-case and different from concept slugs",
    "- Prefer existing concept titles as category names where one concept naturally heads a group",
    revisionSection,
    "Use the propose_hierarchy tool.",
    "",
    "Concepts to organize:",
    formatConceptList(concepts),
  ].join("\n");
}

/**
 * Produce a compact tree summary replacing concept slug arrays with counts.
 * Keeps category names, slugs, descriptions, and children intact so the evaluator
 * can assess structure, coherence, balance, and depth — without listing every slug.
 * This keeps the evaluator prompt small regardless of concept count.
 */
function compactTreeNode(node: HierarchyNode): object {
  return {
    name: node.name,
    slug: node.slug,
    description: node.description,
    conceptCount: node.concepts.length,
    children: node.children.map(compactTreeNode),
  };
}

/** JSON schema hint embedded in the evaluator prompt for plain-completion models. */
const EVALUATOR_SCHEMA_HINT = `
Return ONLY valid JSON in this exact shape (no markdown fences, no prose):
{
  "score": 85,
  "critique": "Specific revision instructions, or empty string if accepted.",
  "accept": true
}`;

/**
 * Build the system prompt for the hierarchy evaluator.
 * Uses plain JSON completion (no tool calling) for maximum model compatibility.
 * Uses a compact tree representation (concept counts, not slug lists) to keep
 * the prompt within token limits even for large concept sets.
 * @param tree - The hierarchy tree to score.
 * @param concepts - Original concept list for coverage checking.
 */
export function buildEvaluatorPrompt(tree: HierarchyTree, concepts: PageSummary[]): string {
  const compact = { categories: tree.categories.map(compactTreeNode) };
  const assignedCount = tree.categories.reduce((sum, cat) => {
    const walk = (n: HierarchyNode): number =>
      n.concepts.length + n.children.reduce((s, c) => s + walk(c), 0);
    return sum + walk(cat);
  }, 0);

  return [
    "You are a hierarchy quality reviewer. Score this concept taxonomy on 4 rubrics (25 pts each, total 100):",
    "",
    "1. COVERAGE (0-25): Every concept placed exactly once. Deduct 5 per missing or duplicated concept.",
    "2. COHERENCE (0-25): Siblings share a meaningful theme. Deduct for mixed-concern groupings.",
    "3. BALANCE (0-25): No single category holds >50% of all concepts. Deduct proportionally.",
    "4. DEPTH UTILITY (0-25): Subcategories represent genuine distinctions, not arbitrary splits.",
    "",
    "Set accept=true only if score >= 80.",
    "If score < 80, provide specific, actionable revision instructions in critique (max 80 words).",
    "If score >= 80, set critique to empty string.",
    "",
    EVALUATOR_SCHEMA_HINT,
    "",
    `Total concepts: ${concepts.length}. Assigned in tree: ${assignedCount}.`,
    "",
    `Hierarchy to evaluate (conceptCount = concepts at that node):\n${JSON.stringify(compact, null, 2)}`,
  ].join("\n");
}

/**
 * Recursively ensure a raw LLM node always has array fields.
 * The LLM occasionally omits `children` or `concepts` on leaf nodes;
 * this guarantees downstream code never sees undefined for those properties.
 */
export function normalizeNode(raw: Record<string, unknown>): HierarchyNode {
  return {
    name: typeof raw.name === "string" ? raw.name : "",
    slug: typeof raw.slug === "string" ? raw.slug : "",
    description: typeof raw.description === "string" ? raw.description : "",
    concepts: Array.isArray(raw.concepts) ? (raw.concepts as string[]) : [],
    children: Array.isArray(raw.children)
      ? (raw.children as Record<string, unknown>[]).map(normalizeNode)
      : [],
  };
}

/**
 * Parse the JSON tool output from the hierarchy generator.
 * Returns null if parsing fails so the loop can handle the error gracefully.
 * Normalizes every node so `children` and `concepts` are always arrays.
 * Also handles text-wrapped JSON for models that don't use function calling.
 * @param toolOutput - Raw JSON string (or prose) from the propose_hierarchy tool.
 */
export function parseHierarchyTree(toolOutput: string): HierarchyTree | null {
  try {
    const parsed = JSON.parse(extractJsonString(toolOutput));
    if (!Array.isArray(parsed.categories)) return null;
    return { categories: (parsed.categories as Record<string, unknown>[]).map(normalizeNode) };
  } catch {
    return null;
  }
}

/**
 * Parse the JSON tool output from the hierarchy evaluator.
 * Returns null if parsing fails.
 * Also handles text-wrapped JSON for models that don't use function calling.
 * @param toolOutput - Raw JSON string (or prose) from the evaluate_hierarchy tool.
 */
export function parseEvalResult(toolOutput: string): HierarchyEvalResult | null {
  try {
    const parsed = JSON.parse(extractJsonString(toolOutput));
    if (typeof parsed.score !== "number") return null;
    return parsed as HierarchyEvalResult;
  } catch {
    return null;
  }
}

/**
 * Tool for assigning a batch of concepts to category slugs.
 * Used in Phase 2 of the two-phase generator for large concept sets.
 */
const CONCEPT_ASSIGNMENT_TOOL = {
  name: "assign_concepts",
  description: "Assign each concept slug to the most appropriate category slug",
  input_schema: {
    type: "object" as const,
    properties: {
      assignments: {
        type: "array",
        items: {
          type: "object",
          properties: {
            concept_slug: { type: "string" },
            category_slug: { type: "string" },
          },
          required: ["concept_slug", "category_slug"],
        },
      },
    },
    required: ["assignments"],
  },
};

/**
 * Flatten all nodes in the hierarchy tree into a list for use in assignment prompts.
 * Includes a human-readable breadcrumb path for each node.
 */
export function flattenTree(tree: HierarchyTree): FlatCategory[] {
  const result: FlatCategory[] = [];
  const walk = (node: HierarchyNode, path: string): void => {
    result.push({ slug: node.slug, name: node.name, description: node.description, path });
    for (const child of node.children) walk(child, `${path} > ${child.name}`);
  };
  for (const cat of tree.categories) walk(cat, cat.name);
  return result;
}

/** JSON schema snippet embedded in no-tool prompts so models know the expected shape. */
const STRUCTURE_SCHEMA_HINT = `
Return ONLY valid JSON in this exact shape (no markdown fences, no prose):
{
  "categories": [
    {
      "name": "Category Name",
      "slug": "category-slug",
      "description": "One sentence.",
      "concepts": [],
      "children": [
        {
          "name": "Subcategory Name",
          "slug": "subcategory-slug",
          "description": "One sentence.",
          "concepts": [],
          "children": []
        }
      ]
    }
  ]
}`;

/** JSON schema hint for batch assignment responses. */
const ASSIGNMENT_SCHEMA_HINT = `
Return ONLY valid JSON in this exact shape (no markdown fences, no prose):
{
  "assignments": [
    { "concept_slug": "some-concept", "category_slug": "target-category-slug" }
  ]
}`;

/**
 * Build the generator prompt for structure-only mode.
 * Uses plain completion (no tool calling) for maximum model compatibility.
 * Samples up to 200 concepts so Phase 1 stays lightweight.
 * Concept assignment is handled separately in batches (Phase 2).
 */
export function buildStructureOnlyPrompt(
  concepts: PageSummary[],
  critique: string,
  prevScore: number,
): string {
  const revisionSection = critique
    ? `\nPrevious attempt scored ${prevScore}/100. Revise based on this feedback:\n${critique}\n`
    : "";

  const titles = concepts.map((c) => `- ${c.title} (${c.slug})`).join("\n");

  return [
    "You are a knowledge architect organizing a wiki into a navigable 3-level hierarchy.",
    "",
    "Rules:",
    "- Create 3-7 top-level categories (broad noun phrases)",
    "- Each category may have 1-3 subcategories (level 2)",
    "- Each subcategory may have further specializations (level 3)",
    "- Category slugs must be kebab-case and different from any concept slug",
    "- Leave ALL `concepts` arrays as [] — assignment is handled separately",
    revisionSection,
    STRUCTURE_SCHEMA_HINT,
    "",
    `All ${concepts.length} concept titles:`,
    titles,
  ].join("\n");
}

/**
 * Build the prompt for assigning a batch of concepts to established categories.
 * Uses plain completion (no tool calling) for maximum model compatibility.
 * @param categories - Flattened list of all categories/subcategories in the tree.
 * @param concepts   - The batch of concepts to assign.
 */
export function buildBatchAssignmentPrompt(
  categories: FlatCategory[],
  concepts: PageSummary[],
): string {
  const catList = categories
    .map((c) => `- ${c.slug}: ${c.name} — ${c.description} [${c.path}]`)
    .join("\n");
  const conceptList = concepts
    .map((c) => `- ${c.slug}: ${c.title} — ${c.summary}`)
    .join("\n");

  return [
    "Assign each concept to the single most appropriate category slug below.",
    ASSIGNMENT_SCHEMA_HINT,
    "",
    "Available categories:",
    catList,
    "",
    "Concepts to assign:",
    conceptList,
  ].join("\n");
}

/**
 * Parse the output of the assign_concepts tool.
 * Returns a map of concept_slug → category_slug, or null on failure.
 */
export function parseAssignments(raw: string): Record<string, string> | null {
  try {
    const parsed = JSON.parse(extractJsonString(raw));
    if (!Array.isArray(parsed.assignments)) return null;
    const result: Record<string, string> = {};
    for (const a of parsed.assignments) {
      if (typeof a.concept_slug === "string" && typeof a.category_slug === "string") {
        result[a.concept_slug] = a.category_slug;
      }
    }
    return result;
  } catch {
    return null;
  }
}

/**
 * Build the system prompt for the incremental concept placement call.
 *
 * This is the cheap path used when only a small number of concepts have changed.
 * The LLM is instructed to preserve the existing hierarchy and only slot new
 * concepts in, optionally pruning removed ones. Reuses HIERARCHY_GENERATOR_TOOL
 * so the output format and parser are identical to the full build path.
 *
 * @param existingTree - The current approved hierarchy tree.
 * @param newConcepts - Concepts that are new and need to be placed.
 * @param removedSlugs - Concept slugs that no longer exist and must be pruned.
 */
export function buildPlacementPrompt(
  existingTree: HierarchyTree,
  newConcepts: PageSummary[],
  removedSlugs: string[],
): string {
  const newList = newConcepts
    .map((c) => `- ${c.title} (slug: ${c.slug}): ${c.summary}`)
    .join("\n");

  const removedSection = removedSlugs.length > 0
    ? `\nConcepts to REMOVE from the tree (prune these slugs):\n${removedSlugs.map((s) => `- ${s}`).join("\n")}`
    : "";

  return [
    "You are updating a wiki concept hierarchy with minimal changes.",
    "",
    "Rules:",
    "- DO NOT reorganise or rename any existing categories",
    "- Place each new concept into the most semantically fitting existing node",
    "- You MAY add a new subcategory only if no existing node fits — prefer reusing existing ones",
    "- Remove any concepts listed under 'Concepts to REMOVE' from wherever they appear",
    "- Return the complete updated tree using the propose_hierarchy tool",
    removedSection,
    "",
    `New concepts to place (${newConcepts.length}):`,
    newList,
    "",
    "Existing hierarchy (preserve this structure):",
    JSON.stringify(existingTree, null, 2),
  ].join("\n");
}
