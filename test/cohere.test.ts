import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { json } from 'node:stream/consumers';
import test from 'node:test';
import { z } from 'zod';
import { runTrial } from '../src/cohere-demo.js';
import { generateProposal, MODEL, readProposal, type ProposalRecord } from '../src/cohere-proposal.js';
import { INVENTORY, POLICY } from '../src/fixtures.js';

const args = { from: 'depot', to: 'north', sku: 'cable', quantity: 4 } as const;
const record: ProposalRecord = {
  model: MODEL, modelDigest: '0'.repeat(64), runtime: 'test fixture', observedAt: '2026-01-01T00:00:00Z',
  responseFormat: 'json-schema', proposal: args,
};
const reply = (content: string) => ({ model: MODEL, done: true, message: { role: 'assistant', content } });

test('only a complete, single structured proposal from the selected model is accepted', () => {
  const valid = reply(JSON.stringify(args));
  assert.deepEqual(readProposal(valid), args);
  for (const wrong of [reply('Transfer complete!'), reply(JSON.stringify([args, args])), { ...valid, model: 'other' },
    { ...valid, done: false }, { ...valid, message: { ...valid.message, tool_calls: [{}] } },
    reply(JSON.stringify({ ...args, approved: true }))]) {
    assert.throws(() => readProposal(wrong));
  }
});

test('the local adapter requests the transfer schema once and captures the served model identity', async t => {
  const paths: string[] = [];
  let chat: unknown;
  const http = createServer(async (req, res) => {
    paths.push(req.url ?? '');
    const send = (data: unknown) => res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(data));
    if (req.url === '/api/version') return void send({ version: 'test' });
    if (req.url === '/api/tags') return void send({ models: [{ name: MODEL, digest: record.modelDigest }] });
    if (req.url === '/api/chat' && req.method === 'POST') {
      chat = await json(req);
      return void send(reply(JSON.stringify(args)));
    }
    res.writeHead(404).end();
  });
  await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve));
  const address = http.address();
  assert.ok(address && typeof address !== 'string');
  const previous = process.env.WORKFLOW_LAB_OLLAMA_PORT;
  process.env.WORKFLOW_LAB_OLLAMA_PORT = String(address.port);
  t.after(async () => {
    if (previous === undefined) delete process.env.WORKFLOW_LAB_OLLAMA_PORT;
    else process.env.WORKFLOW_LAB_OLLAMA_PORT = previous;
    await new Promise<void>((resolve, reject) => http.close(err => err ? reject(err) : resolve()));
  });
  const proposal = await generateProposal(INVENTORY, POLICY);
  assert.deepEqual(paths, ['/api/version', '/api/tags', '/api/chat']);
  const body = z.object({
    model: z.literal(MODEL), format: z.object({ type: z.literal('object'), required: z.array(z.string()), additionalProperties: z.literal(false) }),
    messages: z.array(z.object({ role: z.string(), content: z.string() })),
  }).parse(chat);
  assert.deepEqual([...body.format.required].sort(), ['from', 'quantity', 'sku', 'to']);
  assert.match(body.messages.find(m => m.role === 'user')?.content ?? '', /four cables/);
  assert.deepEqual(proposal.proposal, args);
  assert.equal(proposal.modelDigest, record.modelDigest);
});

test('changing stock invalidates the snapshot and refreshing a plan alone cannot reuse its old review', async () => {
  const trial = await runTrial(async () => record);
  assert.equal(trial.taskMatched, true);
  assert.deepEqual(trial.metrics, { cases: 4, passed: 4, missedBlocks: 0, falseBlocks: 0 });
  const [initial, stale, rebound, fresh] = trial.cases;
  assert.ok(initial && stale && rebound && fresh);
  assert.notEqual(initial.inventoryBefore, stale.inventoryBefore);
  assert.deepEqual(stale.reasons, ['stale_inventory']);
  assert.equal(stale.toolAcceptedPlan, false);
  assert.equal(rebound.toolAcceptedPlan, true);
  assert.deepEqual(rebound.reasons, ['stale_review']);
  assert.equal(rebound.reviewSubject, initial.reviewSubject);
  assert.equal(fresh.reviewSubject, fresh.currentSubject);
  assert.equal(fresh.executionAllowed, false);
  assert.ok(trial.cases.every(c => c.inventoryBefore === c.inventoryAfter));
});

test('a legal but incorrect model proposal fails the task even when all four gate checks pass', async () => {
  const trial = await runTrial(async () => ({
    ...record, proposal: { ...args, quantity: 3 },
  }));
  assert.equal(trial.metrics.passed, 4);
  assert.equal(trial.taskMatched, false);
});
