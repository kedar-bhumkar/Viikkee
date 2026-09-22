/**
 * LLM prompt templates and tool schemas for the compilation pipeline.
 * Contains the Anthropic tool definition for concept extraction,
 * prompt builders for both extraction and page generation phases,
 * and a parser for the structured tool output.
 */

import type { ExtractedConcept } from "../utils/types.js";
import { extractJsonString as extractConceptsJson } from "../utils/json.js";

/**
 * Anthropic Tool definition for extracting knowledge concepts from a source.
 * Used with callClaude's tool_use mode to get structured concept data.
 */
const CONCEPT_EXTRACTION_TOOL = {
  name: "extract_concepts",
  description: "Extract knowledge concepts from a source document",
  input_schema: {
    type: "object" as const,
    properties: {
      concepts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            concept: {
              type: "string",
              description: "Human-readable concept title",
            },
            summary: {
              type: "string",
              description: "One-line description",
            },
            is_new: {
              type: "boolean",
              description: "True if this is a new concept not in existing wiki",
            },
            tags: {
              type: "array",
              items: { type: "string" },
              description:
                "2-4 categorical tags for organizing this concept (e.g., 'machine-learning', 'optimization')",
            },
          },
          required: ["concept", "summary", "is_new"],
        },
      },
    },
    required: ["concepts"],
  },
};

/** JSON schema example embedded in the extraction prompt for plain-completion mode. */
const EXTRACTION_SCHEMA_EXAMPLE = JSON.stringify(
  {
    concepts: [
      {
        concept: "Human-readable concept title",
        summary: "One-line description",
        is_new: true,
        tags: ["tag1", "tag2"],
      },
    ],
  },
  null,
  2,
);

/**
 * Build the system prompt for the concept extraction phase.
 * Instructs the LLM to analyze a source document and identify distinct concepts.
 * Uses plain JSON completion (no tool calling) for maximum model compatibility.
 * @param sourceContent - The full text of the source document.
 * @param existingIndex - The current wiki index.md contents (may be empty, may be truncated).
 * @returns System prompt string for the extraction call.
 */
export function buildExtractionPrompt(
  sourceContent: string,
  existingIndex: string,
): string {
  const indexSection = existingIndex
    ? `\n\nHere is the existing wiki index — avoid duplicating concepts already covered:\n\n${existingIndex}`
    : "\n\nNo existing wiki pages yet.";

  return [
    "You are a knowledge extraction engine. Analyze the following source document",
    "and identify 3-8 distinct, meaningful concepts worth documenting as wiki pages.",
    "Each concept should be a standalone topic that someone might look up.",
    "Focus on key ideas, techniques, patterns, or entities — not trivial details.",
    "",
    "Respond with raw JSON only — no prose, no markdown fences, no explanation.",
    "Use this exact schema:",
    EXTRACTION_SCHEMA_EXAMPLE,
    indexSection,
    "\n\n--- SOURCE DOCUMENT ---\n\n",
    sourceContent,
  ].join("\n");
}

/**
 * Build the system prompt for wiki page generation.
 * Instructs the LLM to write a complete wiki page for a single concept.
 * @param concept - The concept title to write about.
 * @param sourceContent - The source material to draw from.
 * @param existingPage - The current page content if updating (empty for new pages).
 * @param relatedPages - Concatenated content of related wiki pages for context.
 * @param approvedLinks - Pre-approved link titles from Noul selection. When provided,
 *   only these titles may be linked; when empty, falls back to freehand wikilinks.
 * @returns System prompt string for the page generation call.
 */
export function buildPagePrompt(
  concept: string,
  sourceContent: string,
  existingPage: string,
  relatedPages: string,
  approvedLinks: string[] = [],
): string {
  const existingSection = existingPage
    ? `\n\nExisting page to update:\n\n${existingPage}`
    : "";

  const relatedSection = relatedPages
    ? `\n\nRelated wiki pages for cross-referencing:\n\n${relatedPages}`
    : "";

  // When Noul has pre-approved specific pages, constrain links to that list.
  // Otherwise fall back to asking the LLM to suggest links freehand.
  const wikilinkInstruction = approvedLinks.length > 0
    ? `Link only to these pre-approved related pages using [[Title]] notation where relevant: ${approvedLinks.map(t => `[[${t}]]`).join(", ")}`
    : "Suggest [[wikilinks]] to related concepts where appropriate.";

  return [
    `You are a wiki author. Write a clear, well-structured markdown page about "${concept}".`,
    "Draw facts only from the provided source material.",
    "Include a ## Sources section at the end listing the source document.",
    wikilinkInstruction,
    "Write in a neutral, informative tone. Be concise but thorough.",
    "",
    "Source attribution: at the end of each prose paragraph, append a citation",
    "marker showing which source file(s) the paragraph drew from.",
    "Format: ^[filename.md] for single-source, ^[source-a.md, source-b.md] for multi-source.",
    "Place citations only at the end of prose paragraphs — not on headings, list items, or code blocks.",
    "Source filenames are visible as `--- SOURCE: filename.md ---` headers in the content below.",
    "",
    "CONTRADICTIONS: If the new source material contradicts any fact in the existing page or",
    "related pages, add a `## ⚠️ Contradictions` section before ## Sources. List each conflict",
    "as a bullet point describing what conflicts with what and which source makes each claim.",
    "Omit this section entirely when there are no contradictions.",
    existingSection,
    relatedSection,
    "\n\n--- SOURCE MATERIAL ---\n\n",
    sourceContent,
  ].join("\n");
}

/**
 * Parse the JSON output from concept extraction into typed objects.
 * Handles both plain-completion JSON and tool-call JSON output.
 * @param rawOutput - Raw string returned from the LLM.
 * @returns Array of ExtractedConcept objects.
 */
export function parseConcepts(rawOutput: string): ExtractedConcept[] {
  try {
    const parsed = JSON.parse(extractConceptsJson(rawOutput));
    const concepts: ExtractedConcept[] = parsed.concepts ?? [];
    return concepts
      .filter(
        (c) =>
          typeof c.concept === "string" &&
          typeof c.summary === "string" &&
          typeof c.is_new === "boolean" &&
          (c.tags === undefined || Array.isArray(c.tags)),
      )
      .map((c) => ({
        concept: c.concept,
        summary: c.summary,
        is_new: c.is_new,
        tags: Array.isArray(c.tags) ? c.tags : undefined,
      }));
  } catch {
    return [];
  }
}
