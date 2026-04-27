# Viikkee — Personal AI Knowledge Compiler

A self-compounding knowledge base that turns raw articles and clippings into an interlinked, browsable wiki — automatically.

Drop a Markdown file into your Obsidian Clippings folder. The watcher picks it up, an LLM extracts concepts and writes wiki pages, links are resolved across all pages, and a static web app is rebuilt — all without you doing anything.

---

## Origins & Credits

This project is built on top of **[llm-wiki-compiler](https://github.com/atomicmemory/llm-wiki-compiler)** by [Ethan Joffe](https://github.com/atomicmemory), which itself is a full implementation of the **LLM Wiki pattern** described by **[Andrej Karpathy](https://karpathy.ai)**.

Karpathy's original idea (from his [LLM Wiki gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)):

> Instead of re-discovering knowledge at query time, compile it once into a persistent, browsable artifact that compounds over time.

```
RAG:     query → search chunks → answer → forget
llmwiki: sources → compile → wiki → query → save → richer wiki → better answers
```

The compiler handles concept extraction, page generation, wikilink resolution, incremental change detection, multi-provider LLM support, MCP server integration, and Obsidian compatibility. All credit for that core pipeline goes to the original project.

---

## What This Fork Adds

This repository extends the original compiler with a **full static web interface** and an **Obsidian Clippings auto-ingest watcher**, turning it into a fully automated personal knowledge system.

### Static Web Wiki (`llmwiki build`)

A self-contained HTML wiki is generated under `wiki/web/` that can be served locally with `npx serve`:

| Feature | Detail |
|---|---|
| **Category sidebar** | Hierarchy tree with collapsible categories, active page highlight |
| **Landing page** | Concept cards organised by category, search filter |
| **Concept pages** | Full markdown rendered client-side, breadcrumb trail |
| **Hover tooltips** | Hover any `[[wikilink]]` to preview the concept summary inline |
| **Concepts page** | All concepts as pills, A–Z letter filter bar |
| **Log page** | All sources with compile date, sortable columns, pending badge |
| **Live search** | Filters sidebar, cards, pills, and log rows simultaneously |
| **Clean URLs** | `/concepts/daytona` works without `.html` via `serve.json` |

### Obsidian Clippings Auto-Ingest

The `watch` command gained an `--ingest-dir` flag that monitors an external folder (e.g. your Obsidian Clippings vault) for new `.md`, `.txt`, or `.pdf` files. When one arrives it is automatically ingested, compiled, and the web wiki rebuilt — no manual steps.

```bash
llmwiki watch --ingest-dir "/path/to/Obsidian Vault/Clippings"
```

### Reliable Hierarchy Placement

The incremental hierarchy placement (the cheap 1-LLM-call path) was found to silently truncate output for large concept batches, leaving slugs out of the tree and producing 404s. The thresholds were tightened so any batch of more than ~12 new concepts always triggers the reliable full evaluator loop instead.

---

## How It Works

```
New file in Obsidian Clippings
         ↓
   [Watcher] debounce 500ms
         ↓
   [Ingest] copy to sources/
         ↓
   [Change detection] hash vs state.json
         ↓
   [LLM ×1] extract concepts from source
         ↓
   [LLM ×N] write wiki page per concept  ← parallel, 10 at a time
         ↓
   [Resolver] add [[wikilinks]] — no LLM
         ↓
   [Indexgen] rewrite index.md — no LLM
         ↓
   [Hierarchy] place concepts in category tree — 0 / 1 / 2–6 LLM calls
         ↓
   [Web builder] generate HTML — no LLM
         ↓
   Browser-ready at localhost:3000
```

**LLM calls per new source:** 1 extraction + N page writes (one per concept) + hierarchy placement. A typical article producing 5 concepts costs ~6–7 LLM calls.

**Everything is incremental.** Unchanged sources are hashed and skipped. The hierarchy is cached and only rebuilt when the concept set changes.

---

## Quick Start

### Prerequisites

- Node.js >= 18
- An Anthropic API key (or OpenAI / Ollama — see original repo for provider docs)

### Install

```bash
git clone https://github.com/kedar-bhumkar/llmwiki
cd llmwiki/llm-wiki-compiler
npm install
npm run build
```

### Run (from your wiki project directory)

```bash
# Point to the compiler
export ANTHROPIC_API_KEY=sk-ant-...

# Ingest a source and compile
node /path/to/llm-wiki-compiler/dist/cli.js ingest https://some-article.com
node /path/to/llm-wiki-compiler/dist/cli.js compile
node /path/to/llm-wiki-compiler/dist/cli.js build

# Serve the web wiki
npx serve wiki/web --listen 3000
```

### With Obsidian auto-ingest

```bash
# Start the watcher — monitors your Clippings folder and auto-compiles
node /path/to/llm-wiki-compiler/dist/cli.js watch \
  --ingest-dir "/path/to/Obsidian Vault/Clippings"

# Serve in a separate terminal
npx serve wiki/web --listen 3000
```

### Windows convenience scripts

```
start-wiki.bat    — starts both the watcher and server
start-wiki.ps1    — PowerShell equivalent
```

---

## Project Structure

```
llm-wiki-compiler/        — TypeScript compiler source
  src/
    cli.ts                — Command entry point
    commands/             — build, compile, watch, ingest, query
    compiler/             — LLM pipeline: extraction, page gen, linking, hierarchy
    web/                  — Static wiki builder: templates, styles, HTML emitter
    providers/            — Anthropic, OpenAI, Ollama, MiniMax, OpenRouter
    mcp/                  — MCP server for agent integration
    utils/                — State, markdown, embeddings, constants

obsidian-wiki/            — Your personal wiki project (not committed)
  sources/                — Raw ingested source files
  wiki/
    concepts/             — One .md file per compiled concept
    web/                  — Static HTML wiki output
  .llmwiki/               — State, hierarchy cache, embeddings
```

---

## MCP Server

llmwiki ships an MCP server so AI agents (Claude Desktop, Cursor, Claude Code) can query and compile your wiki directly.

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "llmwiki": {
      "command": "node",
      "args": ["/path/to/llm-wiki-compiler/dist/cli.js", "mcp"],
      "cwd": "/path/to/your/obsidian-wiki"
    }
  }
}
```

Available tools: `query_wiki`, `search_pages`, `read_page`, `compile_wiki`, `ingest_source`, `wiki_status`, `lint_wiki`.

---

## License

MIT — see [llm-wiki-compiler/LICENSE](llm-wiki-compiler/LICENSE).

The original compiler is MIT licensed by Ethan Joffe. Additions in this fork are also MIT.
