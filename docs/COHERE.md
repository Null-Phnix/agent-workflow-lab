# Can an approval outlive the inventory it describes?

The request is to move four fictional cables from the depot to the north store.
Cohere’s Command R7B receives the inventory and policy. Ollama's structured
output API requests four fields: source, destination, SKU and quantity. The
host validates those fields, supplies the request ID, binds the proposal to the
snapshot the model saw and calls the read-only MCP evaluator. The reviewer is a
scripted fixture. Neither actor has an inventory write tool.

The harness then simulates one cable being sold. The transfer remains affordable.
This makes a stale approval distinguishable from a simple stock shortage.

| Case | What changed | Expected result |
| --- | --- | --- |
| Unchanged | Original stock, proposal and matching review | Dry run passes and waits for the owner. |
| Stock changed | Stock goes from eight to seven. Proposal and review still refer to the old snapshot. | MCP dry run rejects stale inventory. |
| Updated plan, old review | The host rebinds the same transfer to the new stock. | MCP dry run passes. The gate rejects the old review. |
| Fresh review | A new fixture review covers the updated proposal and stock. | Dry run passes and waits for the owner. |

Each case reads inventory through MCP before and after the evaluation and checks
that the two reads agree. The client and server use the SDK’s in-memory
transport. The report includes both snapshot hashes, the subject named in the
review, the subject being evaluated and the actual rejection reasons. It counts
changed cases that incorrectly reach owner review (missed blocks), and current
cases that are held back (false blocks).
Separately, it checks that the model proposed the requested four cables in the
right direction. A different but affordable transfer can pass inventory checks
and still fail the user’s request.

## Reproduce the experiment

With Node 22 or later, install the locked packages and replay the published
[capture](../evidence/cohere-command-r7b.json):

```sh
npm ci --ignore-scripts
npm run demo:cohere
```

Replay reads the original model proposal, runs the local tools again and
compares the decisions with the capture. It writes `out/cohere-replay.json`
and reports zero new model calls.

For a live test, start Ollama locally, then run:

```sh
ollama pull command-r7b:7b
npm run demo:cohere -- --live
```

The live command calls Ollama on loopback (default port 11434, configurable
with `WORKFLOW_LAB_OLLAMA_PORT`). It records the model digest, runtime version,
time and proposed transfer in `out/cohere-live.json`. Temperature is
zero and the seed is 42. Model tags and inference runtimes can change, so
compare the recorded digest when reproducing a result. The command rejects
plain text, additional action fields and multiple proposals, and exits unsuccessfully when the
task or case expectations fail.

## What failed during development

The first cold start reached the client’s time limit while Ollama was still
loading the weights. A second attempt hit Node fetch’s five-minute response
header limit. The local adapter now uses one explicit request deadline, and the
recorded run used the same checksum-verified weights on an SSD.

The first inference that returned a response used Ollama's native tool-call
interface. The response had no structured tool call, so the adapter rejected it
before creating a plan. The recorded run uses a JSON schema for the model
proposal and lets the host call MCP. Its replay and metrics are specific to
this path.

This is a four-case integration check using one model proposal. It measures
the workflow’s handling of changed state, not model accuracy across a population
of tasks. The weights run locally and are distributed separately under their
own license. [Cohere model card](https://huggingface.co/CohereLabs/c4ai-command-r7b-12-2024) · [Ollama distribution](https://ollama.com/library/command-r7b)
