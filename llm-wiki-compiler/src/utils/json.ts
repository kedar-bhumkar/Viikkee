/**
 * Shared JSON extraction utility for the compilation pipeline.
 * Handles the three output formats that LLMs may produce:
 *   1. `<think>...</think>` reasoning blocks (MiniMax-M2.7 and other reasoning models)
 *   2. Markdown fenced code blocks (` ```json ... ``` `)
 *   3. Raw JSON embedded anywhere in the response text
 */

/**
 * Extract a parseable JSON string from raw LLM output.
 * Strips reasoning blocks and code fences, then locates the first JSON boundary.
 * @param text - Raw output from an LLM that is expected to contain JSON.
 * @returns A string suitable for passing to JSON.parse().
 */
export function extractJsonString(text: string): string {
  // Strip complete think blocks, then truncated ones (no closing tag — response was cut off).
  const stripped = text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*/gi, "")
    .trim();

  const codeBlock = stripped.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) return codeBlock[1].trim();

  const start = Math.min(
    stripped.indexOf("{") === -1 ? Infinity : stripped.indexOf("{"),
    stripped.indexOf("[") === -1 ? Infinity : stripped.indexOf("["),
  );
  return start === Infinity ? stripped : stripped.slice(start).trim();
}
