# Agent Workflow Lab

A small, runnable example of how I direct coding agents and check their work.
The exercise moves fictional stock between stores. It exposes read-only MCP
tools, catches a bad proposal, rejects an outdated review and stops for a human.

This is a new public teaching example distilled from my working practices. It
is not a copy of my private services or evidence of enterprise deployment. I
used Codex to implement this version. The Claude Code setup is included so you
can inspect the instructions and try the workflow in your own session.

## Run it in two minutes

Node.js 22 or newer:

```sh
npm ci --ignore-scripts
npm run verify
npm run eval
npm run demo
```

No account, API key or model subscription is needed for those commands.
Installation fetches locked npm packages. The tests and demo use local fixtures.

```text
Over-allocation blocked: blocked_evaluation [executionAllowed=false]
Corrected proposal needs review: needs_review [executionAllowed=false]
Old review rejected: blocked_review [executionAllowed=false]
Matching fixture review stops at owner: awaiting_owner [executionAllowed=false]
```

The report is written to `out/demo.json`. The builder proposals and reviewer
verdict in this command are **scripted fixtures**, not model output. The tests
also launch a real MCP server process, discover its tools and call them over
stdio. Those are different kinds of evidence.

## A Cohere model proposes a transfer

Command R7B receives a fictional inventory request and returns a structured
proposal. The host sends it to the read-only MCP evaluator. After a scripted
reviewer approves the proposal, a simulated sale changes
depot stock from eight cables to seven. The requested four still fit. Can the
proposal or the approval be reused?

```sh
npm run demo:cohere
```

This replays the [recorded model call](evidence/cohere-command-r7b.json) and
rechecks four cases through the MCP tools without calling a model. For a fresh
local inference and the expected results, see [the Cohere experiment](docs/COHERE.md).

## What to inspect

| Question | Evidence |
|---|---|
| How is the agent's scope explained? | [CLAUDE.md](CLAUDE.md) |
| What tools can it call? | [MCP server](src/server.ts), [.mcp.json](.mcp.json) |
| What happens when the proposal is wrong? | [Evaluator and review gate](src/workflow.ts), [tests](test/workflow.test.ts) |
| How is review separated from execution? | [Reviewer instructions](.claude/agents/proposal-reviewer.md), [design](docs/DESIGN.md) |
| What does the hook enforce? | [Hook](scripts/hook.mjs), [tests](test/hook.test.ts), [limits](docs/LIMITS.md) |
| What would run periodically? | [Disabled schedule example](examples/daily-check.cron.example) |
| What can I say about this honestly? | [Evidence and attribution](docs/EVIDENCE.md) |

## Try it with Claude Code

After building, start Claude Code from this directory with the absolute project
path in `WORKFLOW_LAB_ROOT`:

```sh
export WORKFLOW_LAB_ROOT="$PWD"
claude
```

Inspect the project configuration before trusting it. Approve only the local
`workflow_lab` server when Claude asks, and confirm its three tools in `/mcp`.
Use your normal account and permission settings. No global settings change is
needed. A model session uses your own subscription or API allowance.

Try: "Read the fixture inventory and policy. Propose four cables for north and
four for south, using distinct request IDs. Evaluate the plan. Explain what is
still needed before anyone acts on it. Do not execute anything."

For a failure case, request six and five instead. The evaluator must reject the
combined allocation even though each transfer individually fits the eight-unit
source stock. Ask the agent to correct the plan and explain the failure.

The included read-only reviewer definition is optional. Its separate context
is a workflow aid, not authenticated independent review. **No model session is
claimed by the deterministic demo.** See [limits](docs/LIMITS.md).

## Where the pattern comes from

I designed and operate Scriptorium, a private Git forge for coding agents with
distinct identities, review records and owner authorization. Blackreach is my
public browser-agent project. I also built an internal retail inventory workflow
with AI assistance, refined through use and coworker feedback.

- [Blackreach source and controlled demos](https://github.com/Null-Phnix/Blackreach)
- [Real Claude Code work: Blackreach PR #34](https://github.com/Null-Phnix/Blackreach/pull/34)
- [Blackreach project page](https://phnix.dev/projects/blackreach)
- [Portfolio](https://phnix.dev/)

My contribution is problem selection, requirements, workflow design, agent
direction and review of observed results. Coding agents perform substantial
implementation and testing. This repository was created in November 2026; it
does not stand in for years of professional software employment.

## Boundaries

The MCP tools use fictional inventory and have no filesystem or network access
through their inputs. The optional live model demo connects only to a local
Ollama server. The hash
detects which input a review describes; it does not authenticate the reviewer.
Nothing here claims SOC 2/ISO certification, enterprise scale, RAG quality or
model-level prompt-injection resistance.

MIT licensed. See [LICENSE](LICENSE).
