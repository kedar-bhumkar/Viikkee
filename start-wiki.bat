@echo off
SET LLMWIKI_PROVIDER=openrouter
SET OPENROUTER_API_KEY=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
SET LLMWIKI_MODEL=google/gemini-3-flash-preview
SET LLMWIKI_EMBEDDING_MODEL=openai/text-embedding-3-small
SET LLMWIKI_HIERARCHY_MODEL=google/gemini-3-flash-preview
SET LLMWIKI_MAX_TOKENS=2048
start "" /B node "C:\DDrive\Programming\Project\ai-ml\llm-wiki\llm-wiki-compiler\dist\cli.js" watch --root "C:\DDrive\Programming\Project\ai-ml\llm-wiki\obsidian-wiki" --ingest-dir "C:\Users\Hercules\OneDrive\Documents\Obsidian Vault\Clippings"
start "" /B npx serve "C:\DDrive\Programming\Project\ai-ml\llm-wiki\obsidian-wiki\wiki\web" --listen 3000
