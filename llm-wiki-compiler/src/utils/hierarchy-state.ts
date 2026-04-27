/**
 * Manages .llmwiki/hierarchy.json — the persisted concept taxonomy produced
 * by the hierarchy evaluator loop.
 *
 * Uses the same atomic-write pattern (write to .tmp then rename) as state.ts
 * to prevent corruption from interrupted builds. Returns null on any read
 * failure so callers can treat a missing or corrupt file as "needs rebuild".
 */

import { readFile, writeFile, rename, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { LLMWIKI_DIR, HIERARCHY_FILE } from "./constants.js";
import { normalizeNode } from "../compiler/hierarchy-prompts.js";
import type { HierarchyState } from "./types.js";

/**
 * Read .llmwiki/hierarchy.json.
 * Returns null if the file is absent or contains corrupt JSON.
 * @param root - Project root directory.
 */
export async function readHierarchy(root: string): Promise<HierarchyState | null> {
  const filePath = path.join(root, HIERARCHY_FILE);
  if (!existsSync(filePath)) return null;

  try {
    const raw = await readFile(filePath, "utf-8");
    const state = JSON.parse(raw) as HierarchyState;
    // Normalize nodes so missing `children`/`concepts` fields never cause
    // runtime crashes when the cached JSON was written from an LLM that omitted them.
    state.tree.categories = (state.tree.categories as unknown as Record<string, unknown>[]).map(normalizeNode);
    return state;
  } catch {
    return null;
  }
}

/**
 * Atomically write .llmwiki/hierarchy.json.
 * Writes to a .tmp file first, then renames to prevent partial writes.
 * @param root - Project root directory.
 * @param state - The hierarchy state to persist.
 */
export async function writeHierarchy(root: string, state: HierarchyState): Promise<void> {
  const dir = path.join(root, LLMWIKI_DIR);
  await mkdir(dir, { recursive: true });

  const filePath = path.join(root, HIERARCHY_FILE);
  const tmpPath = filePath + ".tmp";

  await writeFile(tmpPath, JSON.stringify(state, null, 2), "utf-8");
  await rename(tmpPath, filePath);
}
