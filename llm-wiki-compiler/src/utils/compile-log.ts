/**
 * Append-only compile log for the llmwiki knowledge compiler.
 *
 * Each successful compilation run appends one JSON line to
 * .llmwiki/compile-log.jsonl, recording timestamps, counts, and which
 * concepts were new vs updated. The file is created on first write.
 * Append failures are non-fatal — they emit a warning but never abort a build.
 */

import { appendFile, mkdir } from "fs/promises";
import path from "path";
import { COMPILE_LOG_FILE, LLMWIKI_DIR } from "./constants.js";
import type { CompileLogEntry } from "./types.js";

/**
 * Append a single log entry to .llmwiki/compile-log.jsonl.
 * Creates the .llmwiki directory and the log file if they don't exist.
 * @param root - Project root directory.
 * @param entry - Structured data for this compilation run.
 */
export async function appendCompileLog(root: string, entry: CompileLogEntry): Promise<void> {
  const logPath = path.join(root, COMPILE_LOG_FILE);
  const llmwikiDir = path.join(root, LLMWIKI_DIR);

  await mkdir(llmwikiDir, { recursive: true });
  await appendFile(logPath, JSON.stringify(entry) + "\n", "utf-8");
}
