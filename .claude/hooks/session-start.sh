#!/bin/bash
# Installs dependencies and builds the Discogs MCP server for Claude Code cloud sessions.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"

# Next.js app dependencies (needed for `npm run lint` / `npm run build`).
npm install --no-audit --no-fund

# mcp-server/dist is gitignored; .mcp.json launches mcp-server/dist/index.js,
# so the discogs MCP server can't start until this has been built.
(cd mcp-server && npm install --no-audit --no-fund && npm run build)
