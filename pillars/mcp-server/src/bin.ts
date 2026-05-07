#!/usr/bin/env node
/**
 * Bureau MCP Server — bin entry point.
 *
 * Usage:
 *   npx @bureau/mcp-server
 *
 * Required env:
 *   BUREAU_API_URL   — Bureau API server URL (default: http://localhost:3001)
 *   BUREAU_API_KEY   — Your Bureau API key
 *
 * Claude Code config (~/.claude/claude_code_config.json):
 *   {
 *     "mcpServers": {
 *       "bureau": {
 *         "command": "npx",
 *         "args": ["@bureau/mcp-server"],
 *         "env": {
 *           "BUREAU_API_URL": "https://api.bureau.id",
 *           "BUREAU_API_KEY": "bureau_live_..."
 *         }
 *       }
 *     }
 *   }
 */
import { startMcpServer } from "./index.js";

startMcpServer().catch((err: unknown) => {
  process.stderr.write(`Bureau MCP server fatal error: ${String(err)}\n`);
  process.exit(1);
});
