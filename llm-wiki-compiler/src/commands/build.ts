/**
 * Commander action for `llmwiki build`.
 *
 * Orchestrates two steps:
 *   1. Hierarchy — loads concept summaries and runs the generator→evaluator loop
 *      (or returns the cached .llmwiki/hierarchy.json if concepts haven't changed).
 *   2. Web build — walks the approved hierarchy and emits a self-contained
 *      static HTML wiki under wiki/web/.
 *
 * Exits early with a helpful message when no compiled concepts exist yet.
 */

import path from "path";
import { existsSync } from "fs";
import { collectPageSummaries } from "../compiler/indexgen.js";
import { buildHierarchy } from "../compiler/hierarchy.js";
import { buildWeb } from "../web/builder.js";
import * as output from "../utils/output.js";
import { CONCEPTS_DIR } from "../utils/constants.js";

/** Options forwarded from the CLI option parser. */
export interface BuildOptions {
  /** Force hierarchy regeneration even when the concept set has not changed. */
  regenHierarchy: boolean;
}

/**
 * Run the build command from the current working directory.
 * @param options - CLI options (regenHierarchy flag).
 */
export default async function buildCommand(options: BuildOptions): Promise<void> {
  const root = process.cwd();
  const conceptsPath = path.join(root, CONCEPTS_DIR);

  if (!existsSync(conceptsPath)) {
    output.status(
      "!",
      output.warn("No compiled concepts found. Run `llmwiki compile` first."),
    );
    return;
  }

  const concepts = await collectPageSummaries(conceptsPath);

  if (concepts.length === 0) {
    output.status(
      "!",
      output.warn("No concepts found in wiki/concepts/. Run `llmwiki compile` first."),
    );
    return;
  }

  const hierarchyState = await buildHierarchy(root, concepts, options.regenHierarchy);
  await buildWeb(root, hierarchyState.tree);
}
