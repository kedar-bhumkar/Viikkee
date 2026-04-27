/**
 * Local file ingestion module.
 *
 * Reads .md, .txt, and .pdf files from the local filesystem and returns
 * their content ready for the compilation pipeline:
 *   - .md  — returned as-is
 *   - .txt  — wrapped in a markdown fenced block
 *   - .pdf  — text extracted via pdf-parse (see ./pdf.ts)
 *
 * All other extensions are rejected with a descriptive error.
 */

import { readFile } from "fs/promises";
import path from "path";
import ingestPdf from "./pdf.js";

const SUPPORTED_EXTENSIONS = new Set([".md", ".txt", ".pdf"]);

interface FileIngestResult {
  title: string;
  content: string;
}

/** Derive a human-readable title from a filename (without extension). */
function titleFromFilename(filePath: string): string {
  const basename = path.basename(filePath, path.extname(filePath));
  return basename.replace(/[-_]+/g, " ").trim();
}

/** Wrap plain text content in a markdown fenced block. */
function wrapPlainText(text: string): string {
  return `\`\`\`\n${text}\n\`\`\``;
}

/** Read and return a .md or .txt file formatted as markdown. */
async function ingestTextFile(filePath: string, ext: string): Promise<FileIngestResult> {
  const raw = await readFile(filePath, "utf-8");
  const title = titleFromFilename(filePath);
  const content = ext === ".md" ? raw : wrapPlainText(raw);
  return { title, content };
}

/**
 * Ingest a local file and return its content as markdown.
 * @param filePath - Absolute or relative path to a .md, .txt, or .pdf file.
 * @returns An object with a title derived from the filename and the content.
 * @throws On unsupported file type or read failure.
 */
export default async function ingestFile(filePath: string): Promise<FileIngestResult> {
  const ext = path.extname(filePath).toLowerCase();

  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    throw new Error(
      `Unsupported file type "${ext}". Only .md, .txt, and .pdf files are supported.`,
    );
  }

  if (ext === ".pdf") return ingestPdf(filePath);
  return ingestTextFile(filePath, ext);
}
