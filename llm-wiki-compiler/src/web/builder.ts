/**
 * Static HTML wiki builder.
 *
 * Walks the hierarchy tree and concept pages to produce a self-contained
 * wiki/web/ directory that can be browsed directly from the filesystem
 * (file:// protocol) without a web server.
 *
 * Output layout:
 *   wiki/web/index.html              — landing page with category grid
 *   wiki/web/assets/style.css        — shared stylesheet
 *   wiki/web/assets/render.js        — marked.js initialisation + search
 *   wiki/web/concepts/{slug}.html    — one page per concept
 *
 * Wikilinks of the form [[Title]] are resolved to relative .html hrefs
 * during build so marked.js renders them as proper anchor tags.
 */

import { readdir, mkdir } from "fs/promises";
import path from "path";
import { atomicWrite, safeReadFile, parseFrontmatter } from "../utils/markdown.js";
import * as output from "../utils/output.js";
import { CONCEPTS_DIR, SOURCES_DIR, WEB_DIR } from "../utils/constants.js";
import { readState } from "../utils/state.js";
import { cssContent, renderJsContent } from "./styles.js";
import {
  buildSidebarHtml,
  conceptPage,
  conceptsPage,
  indexPage,
  logPage,
  escapeHtml,
} from "./templates.js";
import type { SourceLogEntry } from "./templates.js";
import type { HierarchyTree, HierarchyNode, PageSummary } from "../utils/types.js";

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Generate the full static HTML wiki under wiki/web/.
 * @param root - Project root directory.
 * @param tree - Approved hierarchy tree from the evaluator loop.
 */
export async function buildWeb(root: string, tree: HierarchyTree): Promise<void> {
  output.header("Building static wiki");

  const summaryMap = await loadSummaryMap(root);
  const slugToTitle = buildSlugToTitleMap(summaryMap);
  const webDir = path.join(root, WEB_DIR);

  await emitSharedAssets(webDir, summaryMap);
  await emitIndexPage(webDir, tree, summaryMap);
  await emitConceptPages(root, webDir, tree, summaryMap, slugToTitle);
  await emitConceptsPage(webDir, tree, summaryMap);
  await emitLogPage(root, webDir, tree, summaryMap);

  output.status("✓", output.success(`Wiki written to ${WEB_DIR}/index.html`));
}

// ---------------------------------------------------------------------------
// Asset emission
// ---------------------------------------------------------------------------

/** Write style.css, render.js, and summaries.js to wiki/web/assets/. */
async function emitSharedAssets(webDir: string, summaryMap: Map<string, PageSummary>): Promise<void> {
  const assetsDir = path.join(webDir, "assets");
  await mkdir(assetsDir, { recursive: true });
  await atomicWrite(path.join(assetsDir, "style.css"), cssContent());
  await atomicWrite(path.join(assetsDir, "render.js"), renderJsContent());
  await atomicWrite(path.join(assetsDir, "summaries.js"), buildSummariesJs(summaryMap));
  output.status("+", output.dim("assets/style.css, assets/render.js, assets/summaries.js"));
}

/**
 * Build a JS file exposing every concept's title and summary as a lookup map.
 * Consumed by render.js to power hover tooltips on wiki links.
 */
function buildSummariesJs(summaryMap: Map<string, PageSummary>): string {
  const obj: Record<string, { title: string; summary: string }> = {};
  for (const [slug, page] of summaryMap) {
    if (page.summary) obj[slug] = { title: page.title, summary: page.summary };
  }
  return `window.wikiSummaries=${JSON.stringify(obj)};`;
}

/** Emit wiki/web/index.html. */
async function emitIndexPage(
  webDir: string,
  tree: HierarchyTree,
  summaryMap: Map<string, PageSummary>,
): Promise<void> {
  const sidebarHtml = buildSidebarHtml(tree, summaryMap, "", "./concepts/");
  const html = indexPage({
    sidebarHtml,
    tree,
    summaryMap,
    conceptPathPrefix: "./concepts/",
  });
  await atomicWrite(path.join(webDir, "index.html"), html);
  output.status("+", output.dim("index.html"));
}

// ---------------------------------------------------------------------------
// Concepts page emission
// ---------------------------------------------------------------------------

/** Emit wiki/web/concepts.html — all concept pills grouped alphabetically. */
async function emitConceptsPage(
  webDir: string,
  tree: HierarchyTree,
  summaryMap: Map<string, PageSummary>,
): Promise<void> {
  const sidebarHtml = buildSidebarHtml(tree, summaryMap, "", "./concepts/");
  const html = conceptsPage({ sidebarHtml, summaryMap, conceptPathPrefix: "./concepts/" });
  await atomicWrite(path.join(webDir, "concepts.html"), html);
  output.status("+", output.dim("concepts.html"));
}

// ---------------------------------------------------------------------------
// Log page emission
// ---------------------------------------------------------------------------

/**
 * Emit wiki/web/log.html — all source files, indexed ones first (newest first),
 * then any un-compiled files listed alphabetically at the bottom.
 */
async function emitLogPage(
  root: string,
  webDir: string,
  tree: HierarchyTree,
  summaryMap: Map<string, PageSummary>,
): Promise<void> {
  const state = await readState(root);
  const indexedNames = new Set(Object.keys(state.sources).map((f) => path.basename(f)));

  const indexedEntries: SourceLogEntry[] = Object.entries(state.sources)
    .map(([file, s]) => ({ sourceFile: path.basename(file), concepts: s.concepts, compiledAt: s.compiledAt, indexed: true }))
    .sort((a, b) => b.compiledAt.localeCompare(a.compiledAt));

  const pendingEntries: SourceLogEntry[] = await loadPendingSources(root, indexedNames);

  const sidebarHtml = buildSidebarHtml(tree, summaryMap, "", "./concepts/");
  const html = logPage({ sidebarHtml, sources: [...indexedEntries, ...pendingEntries], summaryMap, conceptPathPrefix: "./concepts/" });
  await atomicWrite(path.join(webDir, "log.html"), html);
  output.status("+", output.dim("log.html"));
}

/** Read source files that have not yet been compiled and return them as pending entries. */
async function loadPendingSources(root: string, indexedNames: Set<string>): Promise<SourceLogEntry[]> {
  try {
    const files = await readdir(path.join(root, SOURCES_DIR));
    return files
      .filter((f) => f.endsWith(".md") && !indexedNames.has(f))
      .sort()
      .map((f) => ({ sourceFile: f, concepts: [], compiledAt: "", indexed: false }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Concept page emission
// ---------------------------------------------------------------------------

/** Emit wiki/web/concepts/{slug}.html for every concept in the tree. */
async function emitConceptPages(
  root: string,
  webDir: string,
  tree: HierarchyTree,
  summaryMap: Map<string, PageSummary>,
  slugToTitle: Map<string, string>,
): Promise<void> {
  const conceptsWebDir = path.join(webDir, "concepts");
  await mkdir(conceptsWebDir, { recursive: true });

  const allSlugs = collectAllSlugs(tree);
  let emitted = 0;

  for (const slug of allSlugs) {
    const breadcrumbs = findBreadcrumbs(tree, slug, summaryMap);
    const rawMd = await safeReadFile(path.join(root, CONCEPTS_DIR, `${slug}.md`));
    if (!rawMd) continue;

    const { body } = parseFrontmatter(rawMd);
    const resolvedMd = resolveWikilinks(body, slugToTitle);
    const sidebarHtml = buildSidebarHtml(tree, summaryMap, slug, "./");
    const page = summaryMap.get(slug);

    const html = conceptPage({
      title: page?.title ?? slug,
      markdownContent: resolvedMd,
      breadcrumbs,
      sidebarHtml,
      assetPrefix: "../",
    });

    await atomicWrite(path.join(conceptsWebDir, `${slug}.html`), html);
    emitted++;
  }

  output.status("+", output.dim(`${emitted} concept pages`));
}

// ---------------------------------------------------------------------------
// Markdown helpers
// ---------------------------------------------------------------------------

/**
 * Replace [[Title]] wikilinks with relative markdown links pointing to .html files.
 * Unresolved wikilinks (no matching slug) are rendered as bold text.
 * @param content - Markdown body text.
 * @param slugToTitle - Map from title (lowercased) to concept slug.
 */
function resolveWikilinks(content: string, slugToTitle: Map<string, string>): string {
  return content.replace(/\[\[([^\]]+)\]\]/g, (_, title: string) => {
    const slug = slugToTitle.get(title.toLowerCase());
    return slug ? `[${title}](./${slug}.html)` : `**${escapeHtml(title)}**`;
  });
}

// ---------------------------------------------------------------------------
// Hierarchy traversal helpers
// ---------------------------------------------------------------------------

/** Collect every concept slug that appears anywhere in the tree. */
function collectAllSlugs(tree: HierarchyTree): string[] {
  const slugs: string[] = [];
  for (const cat of tree.categories) collectNodeSlugs(cat, slugs);
  return slugs;
}

/** Recursively collect slugs from a node and its children. */
function collectNodeSlugs(node: HierarchyNode, acc: string[]): void {
  acc.push(...node.concepts);
  for (const child of node.children) collectNodeSlugs(child, acc);
}

/** Breadcrumb entry: label + optional href. */
interface Crumb {
  label: string;
  href?: string;
}

/**
 * Build the breadcrumb trail for a concept slug.
 * Returns [Home, Category?, Subcategory?, ConceptTitle].
 */
function findBreadcrumbs(
  tree: HierarchyTree,
  targetSlug: string,
  summaryMap: Map<string, PageSummary>,
): Crumb[] {
  const base: Crumb[] = [{ label: "Home", href: "../index.html" }];
  const trail = findTrail(tree.categories, targetSlug, []);
  const conceptTitle = summaryMap.get(targetSlug)?.title ?? targetSlug;
  return [...base, ...trail, { label: conceptTitle }];
}

/**
 * Recursively search nodes for the target slug, building the ancestor trail.
 * Each category crumb links to index.html anchored to its sidebar section.
 * Returns an array of crumbs for the nodes that contain the slug.
 */
function findTrail(
  nodes: HierarchyNode[],
  targetSlug: string,
  ancestors: Crumb[],
): Crumb[] {
  for (const node of nodes) {
    const current = [...ancestors, { label: node.name, href: `../index.html#cat-${node.slug}` }];
    if (node.concepts.includes(targetSlug)) return current;
    const deeper = findTrail(node.children, targetSlug, current);
    if (deeper.length > 0) return deeper;
  }
  return [];
}

// ---------------------------------------------------------------------------
// Page summary helpers
// ---------------------------------------------------------------------------

/** Load all concept page summaries from wiki/concepts/ into a slug-keyed map. */
async function loadSummaryMap(root: string): Promise<Map<string, PageSummary>> {
  const conceptsPath = path.join(root, CONCEPTS_DIR);
  const map = new Map<string, PageSummary>();
  let files: string[];

  try {
    files = await readdir(conceptsPath);
  } catch {
    return map;
  }

  for (const file of files.filter((f) => f.endsWith(".md"))) {
    const slug = file.replace(/\.md$/, "");
    const content = await safeReadFile(path.join(conceptsPath, file));
    if (!content) continue;
    const { meta } = parseFrontmatter(content);
    if (!meta.title || meta.orphaned) continue;
    map.set(slug, {
      slug,
      title: meta.title as string,
      summary: typeof meta.summary === "string" ? meta.summary : "",
    });
  }

  return map;
}

/** Build a lowercase-title → slug lookup for wikilink resolution. */
function buildSlugToTitleMap(summaryMap: Map<string, PageSummary>): Map<string, string> {
  const map = new Map<string, string>();
  for (const [slug, page] of summaryMap) {
    map.set(page.title.toLowerCase(), slug);
  }
  return map;
}
