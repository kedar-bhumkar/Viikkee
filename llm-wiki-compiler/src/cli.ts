/**
 * CLI entry point for llmwiki — the knowledge compiler.
 *
 * Registers all commands (ingest, compile, query, watch, lint) via Commander.
 * Validates the correct API key for the selected LLM provider.
 * Designed for `npx llmwiki` or global install via `npm install -g llm-wiki-compiler`.
 */

// Load .env by walking up the directory tree (supports running from a wiki subdirectory).
import { config as dotenvConfig } from "dotenv";
import { existsSync } from "fs";
import { dirname, join, resolve } from "path";

(function loadEnvFile() {
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, ".env");
    if (existsSync(candidate)) { dotenvConfig({ path: candidate }); return; }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  dotenvConfig(); // fallback: try CWD silently
})();
import { createRequire } from "module";
import { Command } from "commander";
import ingestCommand from "./commands/ingest.js";
import compileCommand from "./commands/compile.js";
import queryCommand from "./commands/query.js";
import watchCommand from "./commands/watch.js";
import lintCommand from "./commands/lint.js";
import buildCommand from "./commands/build.js";
import { startMCPServer } from "./mcp/server.js";
import { DEFAULT_PROVIDER } from "./utils/constants.js";
import { resolveAnthropicAuthFromEnv } from "./utils/claude-settings.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

const program = new Command();

program
  .name("llmwiki")
  .description("The knowledge compiler — raw sources in, interlinked wiki out")
  .version(version);

program
  .command("ingest <source>")
  .description("Ingest a URL or local file into sources/")
  .action(async (source: string) => {
    try {
      await ingestCommand(source);
    } catch (err) {
      console.error(`\x1b[31mError:\x1b[0m ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  });

program
  .command("compile")
  .description("Compile sources/ into an interlinked wiki")
  .action(async () => {
    try {
      requireProvider();
      await compileCommand();
    } catch (err) {
      console.error(`\x1b[31mError:\x1b[0m ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  });

program
  .command("query <question>")
  .description("Ask a question against the wiki")
  .option("--save", "Save the answer as a wiki page")
  .action(async (question: string, options: { save?: boolean }) => {
    try {
      requireProvider();
      await queryCommand(process.cwd(), question, options);
    } catch (err) {
      console.error(`\x1b[31mError:\x1b[0m ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  });

program
  .command("watch")
  .description("Watch sources/ and auto-recompile+build on changes")
  .option("--ingest-dir <path>", "Also watch this directory and auto-ingest new .md/.txt/.pdf files")
  .option("--root <path>", "Wiki project root to compile/build against (defaults to cwd)")
  .action(async (options: { ingestDir?: string; root?: string }) => {
    try {
      requireProvider();
      await watchCommand(options);
    } catch (err) {
      console.error(`\x1b[31mError:\x1b[0m ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  });

program
  .command("lint")
  .description("Run rule-based quality checks against the wiki")
  .action(async () => {
    try {
      await lintCommand();
    } catch (err) {
      console.error(`\x1b[31mError:\x1b[0m ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  });

program
  .command("build")
  .description("Build a browsable static HTML wiki organised by concept hierarchy")
  .option("--regen-hierarchy", "Force regenerate hierarchy even if concept set is unchanged", false)
  .action(async (options: { regenHierarchy: boolean }) => {
    try {
      requireProvider();
      await buildCommand(options);
    } catch (err) {
      console.error(`\x1b[31mError:\x1b[0m ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  });

program
  .command("serve")
  .description("Start an MCP server exposing wiki tools and resources over stdio")
  .option("--root <dir>", "Project root directory", process.cwd())
  .action(async (options: { root: string }) => {
    try {
      // Per-tool credential checks happen inside the MCP layer so read-only
      // tools and ingest still work without an API key.
      await startMCPServer({ root: options.root, version });
    } catch (err) {
      console.error(`\x1b[31mError:\x1b[0m ${err instanceof Error ? err.message : err}`);
      process.exit(1);
    }
  });

/** API key env var required per provider. Null means no key needed. */
const PROVIDER_KEY_VARS: Record<string, string | null> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  ollama: null,
  minimax: "MINIMAX_API_KEY",
  openrouter: "OPENROUTER_API_KEY", // also needs OPENAI_API_KEY for embeddings (checked inside provider)
};

/** Exit with a helpful message if the selected provider's API key is missing. */
function requireProvider(): void {
  const provider = process.env.LLMWIKI_PROVIDER ?? DEFAULT_PROVIDER;

  if (provider === "anthropic") {
    const auth = resolveAnthropicAuthFromEnv();
    if (!auth.apiKey && !auth.authToken) {
      console.error(
        `\x1b[31mError:\x1b[0m Anthropic credentials are required for the "anthropic" provider.\n` +
          `  Set one of: export ANTHROPIC_API_KEY=<your-key> OR export ANTHROPIC_AUTH_TOKEN=<your-token>`,
      );
      process.exit(1);
    }
    return;
  }

  const keyVar = PROVIDER_KEY_VARS[provider];

  if (keyVar === undefined) {
    console.error(
      `\x1b[31mError:\x1b[0m Unknown provider "${provider}".\n` +
        `  Supported: ${Object.keys(PROVIDER_KEY_VARS).join(", ")}`,
    );
    process.exit(1);
  }

  if (keyVar && !process.env[keyVar]) {
    console.error(
      `\x1b[31mError:\x1b[0m ${keyVar} environment variable is required for the "${provider}" provider.\n` +
        `  Set it with: export ${keyVar}=<your-key>`,
    );
    process.exit(1);
  }
}

program.parse();
