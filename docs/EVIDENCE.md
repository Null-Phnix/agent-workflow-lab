# Evidence and attribution

This repository was created on November 6, 2026 as a public, reproducible example.
Josii selected the goal: make his agent workflow understandable to an employer.
Tenjin/Codex implemented and tested this version. The attached Claude Code
instructions and reviewer definition are configuration examples, not evidence
that Claude produced this particular implementation.

## Existing project evidence

[Blackreach PR #34](https://github.com/Null-Phnix/Blackreach/pull/34) is a separate,
merged example of actual Claude Code work requested by Josii. It documents
integration of fixes, test corrections and two reported network-test limitations.
Its test counts belong to that historical run, not this repository.

Scriptorium's private review design informed the separation between a work
proposal, exact-revision evidence and owner authority. No private source,
configuration, vault text, logs or deployment addresses were copied here. The
inventory scenario is fictional and contains no employer data.

## Evidence types

| Evidence | Meaning | Does not establish |
|---|---|---|
| `npm run verify` | Compile, deterministic invariants, hook decisions and actual stdio MCP contract tests | General agent reliability |
| `npm run eval` | Ten expected outcomes through thirty real MCP calls | Model accuracy or safety |
| `npm run demo` | Four scripted failure/correction/review stages | Independent model/human review |
| `evals/questions.xml` | Ten independently answerable tasks for a later model trial | A completed model evaluation |
| GitHub Actions | Checks on the commit shown by that run | Installation in a real organization |

See [the recorded deterministic results](../evidence/evaluation.json) and
[local verification metadata](../evidence/verification.json). Re-run the commands
to verify your checkout. Fixture results are intentionally repeatable.

## Failure found during this build

An invariant test exposed an order-dependent capacity check. A full destination
could receive stock and also send stock within a batch. Checking capacity after
each row rejected one row order while accepting the other, despite identical
final balances. The fix checks the final stock cap after the batch, while still
checking outbound affordability against initial stock. The failing regression
was retained and then passed. This was a defect in this new example, not a
claimed historical production incident or a fix personally typed by Josii.

The first MCP integration test also failed TypeScript compilation because SDK
results carry unknown structured data. The test now validates returned data with
schemas rather than asserting an unchecked type.

## Upstream references

- [MCP TypeScript SDK v2](https://ts.sdk.modelcontextprotocol.io/v2/)
- [MCP tools](https://modelcontextprotocol.io/specification/2026-07-28/server/tools)
- [Claude Code hooks](https://code.claude.com/docs/en/hooks)
- [Claude Code MCP configuration](https://code.claude.com/docs/en/mcp)

Dependencies are pinned in package-lock.json. Documentation and APIs were checked
on November 6, 2026. The proof remains deliberately small; LIMITS.md lists the
authorization, deployment and model-evaluation work it does not implement.
