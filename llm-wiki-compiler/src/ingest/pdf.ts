/**
 * PDF ingestion module for the llmwiki knowledge compiler.
 *
 * Reads a PDF file from disk and extracts its plain text using pdf-parse.
 * The title is derived from the filename so the result fits the same
 * FileIngestResult shape used by the markdown/text ingestor.
 */

import { readFile } from "fs/promises";
import path from "path";
import pdfParse from "pdf-parse";

/** Shared result shape with the rest of the file ingestor. */
interface PdfIngestResult {
  title: string;
  content: string;
}

/** Derive a human-readable title from a filename (without extension). */
function titleFromFilename(filePath: string): string {
  const basename = path.basename(filePath, path.extname(filePath));
  return basename.replace(/[-_]+/g, " ").trim();
}

/**
 * Ingest a PDF file and return its extracted text content.
 * @param filePath - Absolute or relative path to a .pdf file.
 * @returns Title derived from the filename and the extracted plain text.
 * @throws On read failure or PDF parsing error.
 */
export default async function ingestPdf(filePath: string): Promise<PdfIngestResult> {
  const buffer = await readFile(filePath);
  const result = await pdfParse(buffer);
  return { title: titleFromFilename(filePath), content: result.text };
}
