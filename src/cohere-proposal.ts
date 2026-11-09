import { request } from 'node:http';
import { json } from 'node:stream/consumers';
import { z } from 'zod';
import { TransferSchema, type Snapshot } from './workflow.js';

export const MODEL = 'command-r7b:7b';
export const Action = TransferSchema.omit({ requestId: true });
export const TASK = 'Propose moving four cables from depot to north.';

export const ProposalRecord = z.object({
  model: z.literal(MODEL), modelDigest: z.string().regex(/^[a-f0-9]{64}$/),
  runtime: z.string().min(1), observedAt: z.iso.datetime(),
  responseFormat: z.literal('json-schema'), proposal: Action,
});
export type ProposalRecord = z.infer<typeof ProposalRecord>;

export function readProposal(reply: unknown) {
  const parsed = z.object({
    model: z.literal(MODEL), done: z.literal(true),
    message: z.object({ role: z.literal('assistant'), content: z.string().min(1).max(2048),
      tool_calls: z.array(z.never()).optional() }),
  }).parse(reply);
  return Action.parse(JSON.parse(parsed.message.content));
}

/** One local model request. Only the six-row fixture, policy and task enter the prompt. */
export async function generateProposal(snapshot: Snapshot, policy: unknown): Promise<ProposalRecord> {
  const port = z.coerce.number().int().min(1).max(65535).parse(process.env.WORKFLOW_LAB_OLLAMA_PORT ?? 11434);
  function api(path: string, body?: unknown): Promise<unknown> {
    // Cold loading the weights can take longer than fetch's five-minute header timeout.
    const timeoutMs = body === undefined ? 10_000 : 8 * 60_000;
    return new Promise((resolve, reject) => {
      const req = request({
        hostname: '127.0.0.1', port, path, method: body === undefined ? 'GET' : 'POST',
        headers: { 'content-type': 'application/json' }, signal: AbortSignal.timeout(timeoutMs),
      }, res => {
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error('Local Ollama ' + path + ' returned HTTP ' + res.statusCode));
          return;
        }
        resolve(json(res));
      });
      req.on('error', reject);
      req.end(body === undefined ? undefined : JSON.stringify(body));
    });
  }
  const version = z.object({ version: z.string() }).parse(await api('/api/version'));
  const tags = z.object({ models: z.array(z.object({ name: z.string(), digest: z.string() })) })
    .parse(await api('/api/tags'));
  const installed = tags.models.find(m => m.name === MODEL);
  if (!installed) throw new Error('Install the local model first: ollama pull ' + MODEL);

  const { $schema: _dialect, ...format } = z.toJSONSchema(Action);
  const reply = await api('/api/chat', {
    model: MODEL, stream: false, keep_alive: 0, format,
    options: { temperature: 0, seed: 42, num_predict: 220, num_ctx: 4096 },
    messages: [
      { role: 'system', content: 'Return one JSON transfer proposal with from, to, sku and quantity. Use the exact inventory identifiers. A separate tool validates proposals. You cannot approve or execute transfers.' },
      { role: 'user', content: TASK + '\nInventory: ' + JSON.stringify(snapshot.stock) + '\nPolicy: ' + JSON.stringify(policy) },
    ],
  });
  return ProposalRecord.parse({
    model: MODEL, modelDigest: installed.digest, runtime: 'Ollama ' + version.version,
    observedAt: new Date().toISOString(), responseFormat: 'json-schema', proposal: readProposal(reply),
  });
}
