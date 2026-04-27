/**
 * HTML template functions for the static wiki web output.
 *
 * Produces self-contained HTML pages that work from the local filesystem
 * (file:// protocol) without a web server. Markdown content is inlined as
 * a JavaScript string variable and rendered client-side by marked.js (CDN).
 *
 * Exported templates:
 *   - conceptPage()  — individual concept page
 *   - indexPage()    — landing page with concept grid organised by category
 *   - buildSidebarHtml() — shared sidebar HTML block
 *
 * CSS and JS assets live in styles.ts to keep this file within 400 lines.
 */

import { logJsContent } from "./styles.js";
import type { HierarchyTree, HierarchyNode } from "../utils/types.js";
import type { PageSummary } from "../utils/types.js";

/** The CDN URL for the marked.js markdown renderer. */
const MARKED_CDN = "https://cdn.jsdelivr.net/npm/marked/marked.min.js";

// ---------------------------------------------------------------------------
// Types used by the log page
// ---------------------------------------------------------------------------

/** One row of source data for the log page. */
export interface SourceLogEntry {
  sourceFile: string;
  concepts: string[];
  compiledAt: string;
  /** False when the source file exists in sources/ but has not been compiled yet. */
  indexed: boolean;
}

// ---------------------------------------------------------------------------
// Sidebar HTML
// ---------------------------------------------------------------------------

/** Build a sidebar <li> tree link entry. */
function sidebarLink(title: string, href: string, isActive: boolean): string {
  const cls = isActive ? ' class="active"' : "";
  return `<li><a href="${href}"${cls}>${escapeHtml(title)}</a></li>`;
}

/** Recursively render a hierarchy node as nested <details> elements. */
function renderSidebarNode(
  node: HierarchyNode,
  summaryMap: Map<string, PageSummary>,
  activeSlug: string,
  conceptPathPrefix: string,
  depth: number,
): string {
  const containsActive = nodeContainsSlug(node, activeSlug);
  const openAttr = containsActive ? " open" : "";

  const conceptLinks = node.concepts
    .map((slug) => {
      const page = summaryMap.get(slug);
      const title = page?.title ?? slug;
      return sidebarLink(title, `${conceptPathPrefix}${slug}.html`, slug === activeSlug);
    })
    .join("\n");

  const childNodes = node.children
    .map((child) => renderSidebarNode(child, summaryMap, activeSlug, conceptPathPrefix, depth + 1))
    .join("\n");

  return `
<details${openAttr}>
  <summary>${escapeHtml(node.name)}</summary>
  <ul>${conceptLinks}</ul>
  ${childNodes}
</details>`.trim();
}

/**
 * Build the full sidebar HTML for a given page.
 * @param tree - The full hierarchy tree.
 * @param summaryMap - Map from concept slug to PageSummary for title lookup.
 * @param activeSlug - Slug of the currently displayed concept (empty for index/log).
 * @param conceptPathPrefix - Relative path prefix for concept href values.
 */
export function buildSidebarHtml(
  tree: HierarchyTree,
  summaryMap: Map<string, PageSummary>,
  activeSlug: string,
  conceptPathPrefix: string,
): string {
  const nodes = tree.categories
    .map((cat) => renderSidebarNode(cat, summaryMap, activeSlug, conceptPathPrefix, 0))
    .join("\n");
  return `<nav class="sidebar">${nodes}</nav>`;
}

// ---------------------------------------------------------------------------
// Page templates
// ---------------------------------------------------------------------------

/** Shared HTML <head> block — includes Google Fonts preconnects. */
function htmlHead(title: string, assetPrefix: string): string {
  return `<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)} — llmwiki</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="${assetPrefix}assets/style.css">
</head>`;
}

/**
 * Shared header bar.
 * @param indexHref - Relative href to index.html from the current page.
 * @param activeAction - Which header action to highlight ("concepts" | "log" | "").
 */
function htmlHeader(indexHref: string, activeAction = ""): string {
  const root = indexHref.replace("index.html", "");
  const cls = (name: string) => ` class="header-action${activeAction === name ? " active" : ""}"`;
  return `<header>
  <a class="logo" href="${indexHref}">llm<span>wiki</span></a>
  <div class="header-actions">
    <a${cls("concepts")} href="${root}concepts.html">Concepts</a>
    <a${cls("log")} href="${root}log.html">Log</a>
    <span class="header-action disabled">Index</span>
  </div>
  <input id="search" type="search" placeholder="Filter…" aria-label="Filter concepts">
</header>`;
}

/** Breadcrumb trail as HTML. */
function buildBreadcrumbs(crumbs: Array<{ label: string; href?: string }>): string {
  const parts = crumbs.map((c, i) => {
    const isLast = i === crumbs.length - 1;
    if (isLast) return `<span>${escapeHtml(c.label)}</span>`;
    // Only render as a link when an href is provided — category crumbs have no page.
    const label = c.href
      ? `<a href="${c.href}">${escapeHtml(c.label)}</a>`
      : `<span>${escapeHtml(c.label)}</span>`;
    return `${label}<span class="sep">›</span>`;
  });
  return `<nav class="breadcrumbs">${parts.join("")}</nav>`;
}

/** Options for generating a concept page. */
export interface ConceptPageOptions {
  /** Concept title shown in <title> and breadcrumb. */
  title: string;
  /** Markdown source — wikilinks already resolved to .html hrefs. */
  markdownContent: string;
  /** Breadcrumb entries from root to this page. */
  breadcrumbs: Array<{ label: string; href?: string }>;
  /** Pre-built sidebar HTML block. */
  sidebarHtml: string;
  /** Relative path to wiki/web/ root (e.g. "../" for concepts/). */
  assetPrefix: string;
}

/**
 * Generate a full concept HTML page.
 * Markdown is inlined as a JS string and rendered client-side by marked.js.
 */
export function conceptPage(opts: ConceptPageOptions): string {
  const { title, markdownContent, breadcrumbs, sidebarHtml, assetPrefix } = opts;
  const indexHref = `${assetPrefix}index.html`;
  const escapedMd = escapeForJs(markdownContent);

  return `<!DOCTYPE html>
<html lang="en">
${htmlHead(title, assetPrefix)}
<body>
${htmlHeader(indexHref)}
<div class="layout">
  ${sidebarHtml}
  <main>
    <div class="content-wrap">
      ${buildBreadcrumbs(breadcrumbs)}
      <article id="content"></article>
    </div>
  </main>
</div>
<script>var md=\`${escapedMd}\`;</script>
<script src="${MARKED_CDN}"></script>
<script src="${assetPrefix}assets/summaries.js"></script>
<script src="${assetPrefix}assets/render.js"></script>
</body>
</html>`;
}

/** Options for the landing index page. */
export interface IndexPageOptions {
  /** Pre-built sidebar HTML block. */
  sidebarHtml: string;
  /** Hierarchy tree for building the category grid. */
  tree: HierarchyTree;
  /** Map from concept slug to PageSummary for titles and summaries. */
  summaryMap: Map<string, PageSummary>;
  /** Relative path prefix for concept href values on the index (e.g. "./concepts/"). */
  conceptPathPrefix: string;
}

/** Build a concept card anchor element. */
function conceptCard(page: PageSummary, href: string): string {
  return `<a class="concept-card" href="${href}">
  <div class="card-title">${escapeHtml(page.title)}</div>
  <div class="card-summary">${escapeHtml(page.summary)}</div>
</a>`;
}

/** Build the category+concept grid section for the index page. */
function buildIndexGrid(
  node: HierarchyNode,
  summaryMap: Map<string, PageSummary>,
  conceptPathPrefix: string,
  isTopLevel: boolean,
): string {
  const labelClass = isTopLevel ? "category-label" : "subcategory-label";
  const cards = node.concepts
    .map((slug) => {
      const page = summaryMap.get(slug);
      return page ? conceptCard(page, `${conceptPathPrefix}${slug}.html`) : "";
    })
    .filter(Boolean)
    .join("\n");

  const childSections = node.children
    .map((child) => buildIndexGrid(child, summaryMap, conceptPathPrefix, false))
    .join("\n");

  const grid = cards ? `<div class="concept-grid">${cards}</div>` : "";
  return `<section class="category-section">
  <div class="${labelClass}">${escapeHtml(node.name)}</div>
  ${grid}
  ${childSections}
</section>`;
}

/**
 * Generate the landing index.html page.
 * Shows all categories with concept cards organized by hierarchy.
 */
export function indexPage(opts: IndexPageOptions): string {
  const { sidebarHtml, tree, summaryMap, conceptPathPrefix } = opts;
  const conceptCount = summaryMap.size;
  const sections = tree.categories
    .map((cat) => buildIndexGrid(cat, summaryMap, conceptPathPrefix, true))
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
${htmlHead("Knowledge Wiki", "./")}
<body>
${htmlHeader("./index.html")}
<div class="layout">
  ${sidebarHtml}
  <main>
    <div class="content-wrap">
      <div class="page-header">
        <h1 class="page-title">Knowledge Wiki</h1>
        <p class="page-subtitle">${conceptCount} concept${conceptCount !== 1 ? "s" : ""} organised by topic</p>
      </div>
      ${sections}
    </div>
  </main>
</div>
<script src="${MARKED_CDN}"></script>
<script src="./assets/summaries.js"></script>
<script src="./assets/render.js"></script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Concepts page
// ---------------------------------------------------------------------------

/** Options for the all-concepts pill page. */
export interface ConceptsPageOptions {
  sidebarHtml: string;
  summaryMap: Map<string, PageSummary>;
  conceptPathPrefix: string;
}

/**
 * Group concepts alphabetically and render them as pill links.
 * Concepts whose title starts with a non-letter are grouped under "#".
 * Returns both the groups HTML and the sorted list of present letters.
 */
function buildConceptPills(
  summaryMap: Map<string, PageSummary>,
  conceptPathPrefix: string,
): { html: string; letters: string[] } {
  const sorted = [...summaryMap.values()].sort((a, b) => a.title.localeCompare(b.title));
  const groups = new Map<string, PageSummary[]>();
  for (const page of sorted) {
    const letter = /^[A-Za-z]/.test(page.title) ? page.title[0].toUpperCase() : "#";
    if (!groups.has(letter)) groups.set(letter, []);
    groups.get(letter)!.push(page);
  }
  const html = [...groups.entries()].map(([letter, pages]) => {
    const pills = pages.map((p) =>
      `<a class="concept-pill" href="${conceptPathPrefix}${p.slug}.html">${escapeHtml(p.title)}</a>`,
    ).join("");
    return `<div class="concepts-group" data-letter="${letter}">
  <div class="concepts-letter">${letter}</div>
  <div class="concepts-cloud">${pills}</div>
</div>`;
  }).join("\n");
  return { html, letters: [...groups.keys()] };
}

/** Build the horizontal A–Z navigation bar for the concepts page. */
function buildAlphaNav(letters: string[]): string {
  const allBtn = `<button class="alpha-btn active" data-letter="all">All</button>`;
  const letterBtns = letters.map((l) => `<button class="alpha-btn" data-letter="${l}">${l}</button>`).join("");
  return `<div class="alpha-nav">${allBtn}${letterBtns}</div>`;
}

/** Inline JS: letter filter for the concepts page. Exposes window.applyAlphaFilter for render.js. */
const ALPHA_FILTER_JS = `
(function(){
  var cur='all';
  function apply(l){
    cur=l;
    document.querySelectorAll('.concepts-group').forEach(function(g){
      g.style.display=(l==='all'||g.dataset.letter===l)?'':'none';
    });
    document.querySelectorAll('.alpha-btn').forEach(function(b){
      b.classList.toggle('active',b.dataset.letter===l);
    });
  }
  window.applyAlphaFilter=function(){apply(cur);};
  document.querySelectorAll('.alpha-btn').forEach(function(b){
    b.addEventListener('click',function(){apply(b.dataset.letter);});
  });
})();`.trim();

/** Generate the all-concepts page (concepts.html) with alphabetically grouped pills. */
export function conceptsPage(opts: ConceptsPageOptions): string {
  const { sidebarHtml, summaryMap, conceptPathPrefix } = opts;
  const count = summaryMap.size;
  const { html: pillsHtml, letters } = buildConceptPills(summaryMap, conceptPathPrefix);
  return `<!DOCTYPE html>
<html lang="en">
${htmlHead("All Concepts", "./")}
<body>
${htmlHeader("./index.html", "concepts")}
<div class="layout">
  ${sidebarHtml}
  <main>
    <div class="content-wrap">
      <div class="page-header">
        <h1 class="page-title">All Concepts</h1>
        <p class="page-subtitle">${count} concept${count !== 1 ? "s" : ""} — click a letter or use the search bar</p>
      </div>
      ${buildAlphaNav(letters)}
      ${pillsHtml}
    </div>
  </main>
</div>
<script src="${MARKED_CDN}"></script>
<script src="./assets/summaries.js"></script>
<script src="./assets/render.js"></script>
<script>${ALPHA_FILTER_JS}</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Log page
// ---------------------------------------------------------------------------

/** Options for the source log page. */
export interface LogPageOptions {
  /** Pre-built sidebar HTML block. */
  sidebarHtml: string;
  /** Sources sorted by compiledAt descending. */
  sources: SourceLogEntry[];
  /** Map from concept slug to PageSummary for link titles. */
  summaryMap: Map<string, PageSummary>;
  /** Relative path prefix for concept href values (e.g. "./concepts/"). */
  conceptPathPrefix: string;
}

/** Format an ISO timestamp as a human-readable local date string. */
function formatLogDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-US", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** Convert a source filename to a readable display name. */
function formatSourceName(filename: string): string {
  return filename.replace(/\.md$/, "").replace(/-/g, " ");
}

/** Build a concept tag anchor element. */
function conceptTag(slug: string, title: string, conceptPathPrefix: string): string {
  return `<a class="log-concept-tag" href="${conceptPathPrefix}${slug}.html">${escapeHtml(title)}</a>`;
}

/** Build the log table body rows from source entries. */
function buildLogTableRows(
  sources: SourceLogEntry[],
  summaryMap: Map<string, PageSummary>,
  conceptPathPrefix: string,
): string {
  return sources.map((s, i) => {
    const num = i + 1;
    const rowCls = s.indexed ? "" : ' class="log-row-pending"';
    const dateCell = s.indexed ? escapeHtml(formatLogDate(s.compiledAt)) : "—";
    const conceptsCell = s.indexed
      ? s.concepts.map((slug) => conceptTag(slug, summaryMap.get(slug)?.title ?? slug, conceptPathPrefix)).join("")
      : `<span class="log-pending-badge">Not indexed</span>`;
    return `<tr${rowCls} data-idx="${num}" data-date="${s.compiledAt}" data-count="${s.concepts.length}">
  <td class="log-num">${num}</td>
  <td class="log-source">${escapeHtml(formatSourceName(s.sourceFile))}</td>
  <td class="log-date">${dateCell}</td>
  <td><div class="log-concepts">${conceptsCell}</div></td>
</tr>`;
  }).join("\n");
}

/**
 * Generate the source log HTML page (log.html).
 * Shows every indexed source sorted by most-recently-compiled first.
 */
export function logPage(opts: LogPageOptions): string {
  const { sidebarHtml, sources, summaryMap, conceptPathPrefix } = opts;
  const indexedCount = sources.filter((s) => s.indexed).length;
  const totalCount = sources.length;
  const subtitle = totalCount === 0
    ? "No sources found"
    : indexedCount === totalCount
      ? `${totalCount} source${totalCount !== 1 ? "s" : ""} indexed — click a column header to sort`
      : `${indexedCount} of ${totalCount} sources indexed — click a column header to sort`;

  const rows = buildLogTableRows(sources, summaryMap, conceptPathPrefix);
  const tableHtml = sources.length === 0
    ? "<p>No sources found.</p>"
    : `<table class="log-table">
<thead><tr>
  <th data-col="0">#</th>
  <th data-col="1">Source</th>
  <th data-col="2">Indexed On</th>
  <th data-col="3">Concepts</th>
</tr></thead>
<tbody>${rows}</tbody>
</table>`;

  return `<!DOCTYPE html>
<html lang="en">
${htmlHead("Source Log", "./")}
<body class="log-page">
${htmlHeader("./index.html", "log")}
<div class="layout">
  ${sidebarHtml}
  <main>
    <div class="content-wrap">
      <div class="page-header">
        <h1 class="page-title">Source Log</h1>
        <p class="page-subtitle">${subtitle}</p>
      </div>
      ${tableHtml}
    </div>
  </main>
</div>
<script src="${MARKED_CDN}"></script>
<script src="./assets/summaries.js"></script>
<script src="./assets/render.js"></script>
<script>${logJsContent()}</script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/** Escape a string for safe inclusion in an HTML attribute or text node. */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Escape content for safe embedding inside a JS template literal.
 * Escapes backslashes, backticks, and `${` sequences.
 */
export function escapeForJs(content: string): string {
  return content
    .replace(/\\/g, "\\\\")
    .replace(/`/g, "\\`")
    .replace(/\$\{/g, "\\${");
}

/** Check whether a hierarchy node (or any descendant) contains a given concept slug. */
function nodeContainsSlug(node: HierarchyNode, slug: string): boolean {
  if (node.concepts.includes(slug)) return true;
  return node.children.some((child) => nodeContainsSlug(child, slug));
}
