# What the demo proves and what it does not

The local tests establish the stated fixture arithmetic, schema rejections,
review freshness, hook decisions and real MCP protocol interaction for the
tested versions. They do not establish correctness for every future change.

The prompt-injection fixture proves only that free text cannot alter this
deterministic evaluator. A model could still misunderstand that text, produce
a poor plan or choose an inappropriate tool in a broader environment. No model
security benchmark has been run here.

The hook restricts the literal Bash command to documented npm commands and
does not auto-grant permissions. It is not a sandbox. An actor who can edit the
hook, npm scripts or other files can defeat that convention. Other tool types
and globally configured tools remain subject to the host's own policy. Use a
separate OS/container identity and genuine access controls for untrusted agents.

Reviewer IDs are declared values, not authenticated identities. A hash binds
the review to content, not to who wrote it. The fixture review in npm run demo
is scripted. A separate Claude reviewer conversation has not been run as part
of that command, and separate context alone is not an authorization boundary.

No action is executed, reserved, sent, merged or deployed. A real integration
needs authenticated owner approval, durable idempotency records, transaction
isolation, a recheck of inventory at execution time and reconciliation after
uncertain outcomes. This example has none of those external side effects.

MCP uses stdio, not a listening server. The three tools access only six stock
rows and five policy rules embedded in this repository. They accept no file
paths, remote URLs or credentials. Schema sizes are bounded. npm packages are
locked, but dependency installation is still a network operation.

The public-content scan is heuristic. It complements manual inspection and a
separate secret scanner; a pass is not a promise that an arbitrary future file
is suitable for publication.
