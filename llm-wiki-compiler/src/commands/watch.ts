/**
 * Commander action for `llmwiki watch`.
 *
 * Two independent watchers run concurrently:
 *
 *   1. sources/ watcher — detects changes to already-ingested sources and
 *      triggers an incremental compile pass (existing behaviour).
 *
 *   2. ingest-dir watcher (optional, --ingest-dir <path>) — monitors an
 *      external directory (e.g. an Obsidian Clippings vault) for new or
 *      changed .md / .txt / .pdf files.  Each matching file is automatically
 *      ingested into sources/ before the compile pass runs.
 *
 * After every successful compile, a `build` pass regenerates the static HTML
 * wiki so the browser preview stays in sync without any manual intervention.
 *
 * Changes are debounced (500 ms) and compile/build calls are serialised —
 * changes that arrive while a pass is running are queued as a single follow-up.
 */

import { watch as chokidarWatch } from "chokidar";
import { existsSync } from "fs";
import path from "path";
import { compile } from "../compiler/index.js";
import { ingestSource } from "./ingest.js";
import buildCommand from "./build.js";
import { SOURCES_DIR } from "../utils/constants.js";
import * as output from "../utils/output.js";

const DEBOUNCE_MS = 500;

/** Extensions the ingest-dir watcher picks up. */
const INGESTABLE_EXTENSIONS = new Set([".md", ".txt", ".pdf"]);

/** Options forwarded from the CLI option parser. */
export interface WatchOptions {
  /** If set, also watch this directory and auto-ingest new/changed files. */
  ingestDir?: string;
  /**
   * Project root to compile/build against.
   * Defaults to process.cwd(). Use when the CLI is invoked from a parent
   * directory (e.g. via launch.json) so paths resolve to the right wiki.
   */
  root?: string;
}

// ---------------------------------------------------------------------------
// Compile + build pipeline
// ---------------------------------------------------------------------------

/** Run compile then build, logging errors without crashing the watcher. */
async function runPipeline(root: string): Promise<void> {
  try {
    await compile(root);
  } catch (err) {
    output.status("!", output.error(`Compile failed: ${err instanceof Error ? err.message : String(err)}`));
    return;
  }

  try {
    await buildCommand({ regenHierarchy: false });
  } catch (err) {
    output.status("!", output.error(`Build failed: ${err instanceof Error ? err.message : String(err)}`));
  }
}

// ---------------------------------------------------------------------------
// Serialised scheduler — prevents overlapping compile+build passes
// ---------------------------------------------------------------------------

/** Scheduler state shared between both watchers. */
interface Scheduler {
  running: boolean;
  pending: boolean;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  /** Files queued to ingest before the next compile pass. */
  pendingIngests: Set<string>;
}

function makeScheduler(): Scheduler {
  return { running: false, pending: false, debounceTimer: null, pendingIngests: new Set() };
}

/** Flush pending ingests then run the compile+build pipeline. */
async function flushPipeline(root: string, scheduler: Scheduler): Promise<void> {
  if (scheduler.running) {
    scheduler.pending = true;
    return;
  }

  scheduler.running = true;

  const toIngest = [...scheduler.pendingIngests];
  scheduler.pendingIngests.clear();

  for (const filePath of toIngest) {
    try {
      output.status("→", output.info(`Auto-ingesting: ${path.basename(filePath)}`));
      await ingestSource(filePath);
    } catch (err) {
      output.status("!", output.warn(`Ingest skipped (${path.basename(filePath)}): ${err instanceof Error ? err.message : String(err)}`));
    }
  }

  await runPipeline(root);
  scheduler.running = false;

  if (scheduler.pending) {
    scheduler.pending = false;
    await flushPipeline(root, scheduler);
  }
}

/** Debounce helper — schedules a pipeline flush after DEBOUNCE_MS quiet time. */
function scheduleFlush(root: string, scheduler: Scheduler, label: string): void {
  output.status("~", output.dim(label));
  if (scheduler.debounceTimer) clearTimeout(scheduler.debounceTimer);
  scheduler.debounceTimer = setTimeout(() => flushPipeline(root, scheduler), DEBOUNCE_MS);
}

// ---------------------------------------------------------------------------
// Watchers
// ---------------------------------------------------------------------------

/** Watch sources/ for any changes and trigger a pipeline flush. */
function watchSourcesDir(root: string, sourcesPath: string, scheduler: Scheduler): void {
  const watcher = chokidarWatch(sourcesPath, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 200 },
  });

  watcher
    .on("add",    (p) => scheduleFlush(root, scheduler, `sources/ added: ${path.basename(p)}`))
    .on("change", (p) => scheduleFlush(root, scheduler, `sources/ changed: ${path.basename(p)}`))
    .on("unlink", (p) => scheduleFlush(root, scheduler, `sources/ deleted: ${path.basename(p)}`));
}

/** Watch an external directory and queue ingestable files for auto-ingestion. */
function watchIngestDir(root: string, ingestDir: string, scheduler: Scheduler): void {
  output.status("👁", output.info(`Watching ingest directory: ${ingestDir}`));

  const watcher = chokidarWatch(ingestDir, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 500 },
  });

  const onFile = (filePath: string): void => {
    const ext = path.extname(filePath).toLowerCase();
    if (!INGESTABLE_EXTENSIONS.has(ext)) return;
    scheduler.pendingIngests.add(filePath);
    scheduleFlush(root, scheduler, `new file detected: ${path.basename(filePath)}`);
  };

  watcher.on("add", onFile).on("change", onFile);
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Start watching for changes and run the compile+build pipeline on every event.
 * @param options.ingestDir - Optional external directory to monitor for new sources.
 */
export default async function watchCommand(options: WatchOptions = {}): Promise<void> {
  // Resolve root first — chdir so all relative paths (sources/, wiki/, .llmwiki/)
  // inside compile/build/ingest resolve against the correct wiki project.
  if (options.root) {
    process.chdir(path.resolve(options.root));
  }
  const root = process.cwd();
  const sourcesPath = path.resolve(SOURCES_DIR);

  if (!existsSync(sourcesPath)) {
    output.status("!", output.warn('No sources/ directory found. Run `llmwiki ingest <url>` first.'));
    return;
  }

  output.header("llmwiki watch");
  output.status("👁", output.info(`Watching ${sourcesPath} for changes...`));
  if (options.ingestDir) {
    output.status("i", output.dim(`Auto-ingest from: ${options.ingestDir}`));
  }
  output.status("i", output.dim("Compile + build will run on every change. Press Ctrl+C to stop.\n"));

  const scheduler = makeScheduler();
  watchSourcesDir(root, sourcesPath, scheduler);

  if (options.ingestDir) {
    watchIngestDir(root, options.ingestDir, scheduler);
  }

  // Keep the process alive until Ctrl+C
  await new Promise<void>(() => {});
}
