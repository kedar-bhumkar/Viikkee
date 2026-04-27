/**
 * Markdown parsing and manipulation helpers.
 * Handles YAML frontmatter extraction, slugification, and atomic file writes
 * for wiki pages.
 */

import { writeFile, rename, unlink, readFile, mkdir } from "fs/promises";
import path from "path";
import yaml from "js-yaml";

/** Convert a human-readable concept title to a filename slug. */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/['']/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Build YAML frontmatter string from key-value pairs. */
export function buildFrontmatter(fields: Record<string, unknown>): string {
  const dumped = yaml.dump(fields, { lineWidth: -1, quotingType: '"' }).trimEnd();
  return `---\n${dumped}\n---`;
}

/** Parse YAML frontmatter from a markdown string. Returns { meta, body }. */
export function parseFrontmatter(content: string): {
  meta: Record<string, unknown>;
  body: string;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return { meta: {}, body: content };
  }

  let meta: Record<string, unknown> = {};
  try {
    const parsed = yaml.load(match[1]);
    if (parsed && typeof parsed === "object") {
      meta = parsed as Record<string, unknown>;
    }
  } catch {
    // Malformed YAML — return empty meta so callers degrade gracefully.
  }
  return { meta, body: match[2] };
}

/** Max rename attempts before falling back to a direct overwrite. */
const RENAME_MAX_ATTEMPTS = 4;

/** Delay between rename retries — increases with each attempt. */
const RENAME_RETRY_BASE_MS = 50;

/**
 * Atomically write a file (write to .tmp, then rename).
 * On Windows, `rename` can fail with EPERM when another process (e.g. a static
 * file server) briefly holds the destination file open. We retry with
 * linear back-off and fall back to a direct overwrite on the final attempt.
 */
export async function atomicWrite(filePath: string, content: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = filePath + ".tmp";
  await writeFile(tmpPath, content, "utf-8");

  for (let attempt = 1; attempt <= RENAME_MAX_ATTEMPTS; attempt++) {
    try {
      await rename(tmpPath, filePath);
      return;
    } catch (err) {
      const isEperm = err instanceof Error && (err as NodeJS.ErrnoException).code === "EPERM";
      if (!isEperm || attempt === RENAME_MAX_ATTEMPTS) {
        // Last resort: direct overwrite (non-atomic but better than crashing).
        await writeFile(filePath, content, "utf-8");
        await unlink(tmpPath).catch(() => {});
        return;
      }
      await new Promise((r) => setTimeout(r, RENAME_RETRY_BASE_MS * attempt));
    }
  }
}

/**
 * Extract all source filenames from ^[filename.md] citation markers in a page body.
 * Handles single citations (^[source.md]) and multi-source (^[a.md, b.md]).
 * @param body - The markdown body text to parse.
 * @returns Array of unique source filenames.
 */
export function extractCitations(body: string): string[] {
  const citationPattern = /\^\[([^\]]+)\]/g;
  const filenames = new Set<string>();

  let match;
  while ((match = citationPattern.exec(body)) !== null) {
    const inner = match[1];
    for (const part of inner.split(",")) {
      const trimmed = part.trim();
      if (trimmed.length > 0) {
        filenames.add(trimmed);
      }
    }
  }

  return [...filenames];
}

/** Read a file, returning empty string if it doesn't exist. */
export async function safeReadFile(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf-8");
  } catch {
    return "";
  }
}

/**
 * Validate that a wiki page has non-empty content and valid frontmatter.
 * Returns true if the page is valid.
 */
export function validateWikiPage(content: string): boolean {
  if (!content || content.trim().length === 0) return false;

  const { meta, body } = parseFrontmatter(content);
  if (!meta.title) return false;
  if (body.trim().length === 0) return false;

  return true;
}
