# Lovable integration

Current implementation: the exported code in `lovable-ui` is integrated and served by root `npm run dev`. [Verified account integration](connected-ui.md). The manual workflow below remains useful for future Lovable exports; the Next.js screens are now retained reference code.

On 11 October 2026 the owner selected Lovable for the product UI. The current local Next.js app is an account integration harness, not a requirement that Lovable change frameworks. NestJS/PostgreSQL remain the single account and marketplace authority. See [ADR-0009](../adr/0009-lovable-ui-and-authoritative-api.md).

## MCP status and fallback

This machine's Codex configuration registers `https://mcp.lovable.dev` as an enabled server. `codex mcp list` reports Auth Unknown. No Lovable tools are exposed in the current session; querying the runtime server returns “unknown MCP server”. Configuration alone therefore does not establish a usable connection. No Lovable project has been created by Codex.

Lovable's official server uses OAuth, not a manual API key. To attempt repair in a local terminal:

```powershell
codex mcp login lovable
codex mcp list
```

Complete the browser OAuth flow with your own account, then restart Codex/the IDE extension so the next session can discover the tools. Localhost OAuth callbacks are supported by Lovable. If tools still do not appear, use the manual path below; do not paste login tokens or credentials into chat. Sources: [Lovable MCP server](https://docs.lovable.dev/integrations/lovable-mcp-server), [Codex MCP setup](https://developers.openai.com/codex/mcp/).

## Manual UI generation

1. Create a project in Lovable and paste the full [task 01 prompt](task-01-prompt.md).
2. Review the generated account screens. “Account service is not connected” is expected in hosted preview until a reachable API exists; it must not fabricate account creation.
3. Export/download the project or use Lovable's repository integration. Place the exported UI in a separate folder in this workspace for Codex to inspect and integrate. Preserve this backend and its contracts.
4. Integration will adapt the UI build/router and route `/v1/*` to NestJS, then rerun the real account journey. Do not overwrite `apps/api`, migrations or production documents with generated UI files.

Local Vite development can proxy `/v1` to `http://127.0.0.1:4000` on port 5173. Set `WEB_ORIGIN=http://localhost:5173` and allow this exact origin before starting API/worker so new verification links return to that UI. Cookies stay same-origin through the proxy. Production uses a single HTTPS origin; cloud preview and laptop localhost are different environments.

External dependencies: owner OAuth login if MCP is desired, the actual Lovable UI export, a chosen public brand/domain, production infrastructure and a live SMTP sender. None are invented or represented as completed.
