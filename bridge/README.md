# Local CLI bridge

Lets the Code window's AI panel use a command-line agent on your machine (Claude Code by default). The browser can't run a CLI itself, so this small Node script (no dependencies) does it and streams the output back.

```
node bridge/claude-code-bridge.mjs
```

It prints a token. In Sites, open Project settings > AI, pick "Local CLI (Claude Code, etc.)", paste the token and press Test connection.

- Listens on `127.0.0.1:4317` only (`SITES_AI_PORT` to change). Requests need the token and must come from a localhost origin (`SITES_AI_ORIGINS=https://example.com` to allow others).
- Runs `claude -p --output-format stream-json --verbose --include-partial-messages --tools ""` with the prompt on stdin, in a fresh temp directory, with tools turned off so it only writes text. Set `SITES_AI_CMD` to use any other CLI that reads a prompt on stdin and prints its answer, e.g. `SITES_AI_CMD="llm -m gpt-4o"`.
- `SITES_AI_TOKEN` fixes the token between restarts; `SITES_AI_TIMEOUT` (seconds, default 600) stops long runs.
