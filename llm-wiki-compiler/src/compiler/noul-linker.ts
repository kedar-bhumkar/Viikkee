/**
 * TypeSafe Noul-based link selection and duplicate detection for the wiki pipeline.
 *
 * Replaces free-form LLM wikilink generation with a structured selection pass:
 * given a page and its semantically similar candidates, Noul judges each
 * "should this page link to X?" in one parallel TypeSafe call. Prevents
 * hallucinated links structurally — the page writer can only link to pre-approved
 * pages. Gracefully no-ops when TYPESAFE_API_KEY is unset or on any error.
 *
 * Also provides duplicate detection: before a newly extracted concept is written
 * as a new page, Noul checks whether it substantially overlaps with an existing
 * page, preventing near-duplicate entries from accumulating in the corpus.
 */

import { noul, TypeSafeClient } from "@typesafe-ai/sdk";
import type { NoulQuestion, NoulResponse, JsonValue, EntryType } from "@typesafe-ai/sdk";
import { readEmbeddingStore } from "../utils/embeddings.js";
import type { EmbeddingEntry, EmbeddingStore } from "../utils/embeddings.js";
import {
  NOUL_CANDIDATE_COUNT,
  NOUL_LINK_THRESHOLD,
  NOUL_DEDUP_THRESHOLD,
} from "../utils/constants.js";
import * as output from "../utils/output.js";
import type { ExtractedConcept } from "../utils/types.js";

type PageSummary = { title: string; summary: string };

/** Return true when a TypeSafe API key is configured. */
function hasTypeSafeKey(): boolean {
  return Boolean(process.env.TYPESAFE_API_KEY);
}

/**
 * Score embedding store entries by term overlap with a query title and tags.
 * Avoids re-embedding — works entirely from stored text metadata.
 * Title overlap is weighted 3×; summary overlap is 1×.
 */
function findCandidates(
  store: EmbeddingStore,
  queryTitle: string,
  queryTags: string[],
  excludeSlug: string,
): EmbeddingEntry[] {
  const stopWords = new Set(["the", "a", "an", "of", "in", "for", "and", "or", "to", "is", "are"]);
  const queryWords = new Set(
    [...queryTitle.toLowerCase().split(/\W+/), ...queryTags.map(t => t.toLowerCase())]
      .filter(w => w.length > 3 && !stopWords.has(w)),
  );

  const pool = store.entries.filter(e => e.slug !== excludeSlug);
  if (queryWords.size === 0) return pool.slice(0, NOUL_CANDIDATE_COUNT);

  return pool
    .map(entry => ({
      entry,
      score:
        entry.title.toLowerCase().split(/\W+/).filter(w => queryWords.has(w)).length * 3 +
        entry.summary.toLowerCase().split(/\W+/).filter(w => queryWords.has(w)).length,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, NOUL_CANDIDATE_COUNT)
    .map(s => s.entry);
}

/** Build one Noul question per candidate for link selection. */
function buildLinkQuestions(
  source: PageSummary,
  candidates: EmbeddingEntry[],
): Record<string, NoulQuestion> {
  const questions: Record<string, NoulQuestion> = {};
  for (let i = 0; i < candidates.length; i++) {
    questions[`link_${i}`] = noul({
      source: { title: source.title, summary: source.summary },
      candidate: { title: candidates[i].title, summary: candidates[i].summary },
      question: "Should the source wiki page link to the candidate wiki page?",
    });
  }
  return questions;
}

/** Build one Noul question per candidate for duplicate detection. */
function buildDedupQuestions(
  extracted: PageSummary,
  candidates: EmbeddingEntry[],
): Record<string, NoulQuestion> {
  const questions: Record<string, NoulQuestion> = {};
  for (let i = 0; i < candidates.length; i++) {
    questions[`dup_${i}`] = noul({
      existing: { title: candidates[i].title, summary: candidates[i].summary },
      question: "Does the extracted concept describe the same topic as the existing wiki page?",
    });
  }
  return questions;
}

/** Submit all questions to TypeSafe in one call and return the answers map. */
async function callNoul(
  state: EntryType,
  questions: Record<string, NoulQuestion>,
): Promise<Record<string, NoulResponse>> {
  const client = new TypeSafeClient();
  const response = await client.systemOne({ state, questions });
  return response.answers as unknown as Record<string, NoulResponse>;
}

/**
 * Select which existing wiki pages the given concept should link to.
 * Returns an empty array when TYPESAFE_API_KEY is not set, the embedding store
 * is absent, or any error occurs — callers fall back to freehand wikilinks.
 */
export async function selectApprovedLinks(
  root: string,
  slug: string,
  concept: { title: string; summary: string; tags?: string[] },
): Promise<string[]> {
  if (!hasTypeSafeKey()) return [];
  try {
    const store = await readEmbeddingStore(root);
    if (!store || store.entries.length === 0) return [];

    const candidates = findCandidates(store, concept.title, concept.tags ?? [], slug);
    if (candidates.length === 0) return [];

    const source: PageSummary = { title: concept.title, summary: concept.summary };
    const answers = await callNoul({ source }, buildLinkQuestions(source, candidates));

    const approved = candidates.filter(
      (_, i) => (answers[`link_${i}`]?.noul ?? 0) >= NOUL_LINK_THRESHOLD,
    );
    if (approved.length > 0) {
      output.status("🔗", output.dim(`Noul approved ${approved.length} link(s) for "${concept.title}"`));
    }
    return approved.map(c => c.title);
  } catch (err) {
    output.status("!", output.warn(`Noul link selection skipped: ${err instanceof Error ? err.message : String(err)}`));
    return [];
  }
}

/**
 * Filter newly extracted concepts by removing near-duplicates of existing wiki pages.
 * Non-new concepts (is_new: false) are always kept. When TYPESAFE_API_KEY is unset
 * or on any error, the full list is returned unchanged.
 */
export async function filterDuplicates(
  root: string,
  concepts: ExtractedConcept[],
): Promise<ExtractedConcept[]> {
  if (!hasTypeSafeKey()) return concepts;
  try {
    const store = await readEmbeddingStore(root);
    if (!store || store.entries.length === 0) return concepts;

    const result: ExtractedConcept[] = [];
    for (const concept of concepts) {
      if (!concept.is_new) { result.push(concept); continue; }

      const candidates = findCandidates(store, concept.concept, [], "");
      if (candidates.length === 0) { result.push(concept); continue; }

      const extracted: PageSummary = { title: concept.concept, summary: concept.summary };
      const answers = await callNoul({ extracted }, buildDedupQuestions(extracted, candidates));
      const isDuplicate = Object.values(answers).some(a => (a?.noul ?? 0) >= NOUL_DEDUP_THRESHOLD);

      if (isDuplicate) {
        output.status("-", output.warn(`Noul dedup: skipping "${concept.concept}" (near-duplicate)`));
      } else {
        result.push(concept);
      }
    }
    return result;
  } catch (err) {
    output.status("!", output.warn(`Noul dedup skipped: ${err instanceof Error ? err.message : String(err)}`));
    return concepts;
  }
}
