import assert from 'node:assert/strict';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { Client, InMemoryTransport } from '@modelcontextprotocol/client';
import { z } from 'zod';
import { generateProposal, ProposalRecord, TASK } from './cohere-proposal.js';
import { INVENTORY } from './fixtures.js';
import { createServer } from './server.js';
import { inventoryHash, PlanSchema, reviewReadiness, SnapshotSchema, subjectHash, type Plan, type Review, type Snapshot } from './workflow.js';

const FILE = 'evidence/cohere-command-r7b.json';
const InventoryRead = z.object({ snapshot: SnapshotSchema, inventoryHash: z.string(), fixture: z.literal(true) });
const ToolDecision = z.object({ valid: z.boolean(), violations: z.array(z.string()) });
type Propose = (snapshot: Snapshot, policy: unknown) => Promise<ProposalRecord>;
type State = ReturnType<typeof reviewReadiness>['state'];

function fixtureReview(snapshot: Snapshot, plan: Plan): Review {
  return { reviewer: 'fixture-reviewer', verdict: 'approve', findings: [], subjectHash: subjectHash(snapshot, plan) };
}

export async function runTrial(propose: Propose) {
  let current = structuredClone(INVENTORY);
  const server = createServer(() => current);
  const client = new Client({ name: 'cohere-inventory-trial', version: '1.0.0' });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    async function call(name: string, args: Record<string, unknown> = {}) {
      const result = await client.callTool({ name, arguments: args });
      if (result.isError || !result.structuredContent) throw new Error('MCP tool failed: ' + name);
      return result.structuredContent;
    }
    async function readInventory() {
      const read = InventoryRead.parse(await call('workflow_get_inventory'));
      assert.equal(read.inventoryHash, inventoryHash(read.snapshot), 'Inventory digest does not match rows');
      return read;
    }
    const original = await readInventory();
    const source = await propose(original.snapshot, await call('workflow_get_policy'));
    const action = source.proposal;
    const taskMatched = action.from === 'depot' && action.to === 'north' && action.sku === 'cable' && action.quantity === 4;
    const plan = PlanSchema.parse({ version: 1, inventoryHash: original.inventoryHash, producer: 'cohere-r7b',
      transfers: [{ requestId: 'cohere-demo-01', ...action }], note: '' });
    const originalReview = fixtureReview(original.snapshot, plan);

    async function checkCase(id: string, candidate: Plan, review: Review, expected: State, reasons: string[]) {
      const before = await readInventory();
      const dryRun = await call('workflow_evaluate_plan', { plan: candidate });
      const tool = ToolDecision.parse(dryRun);
      const gate = reviewReadiness(before.snapshot, candidate, review);
      const after = await readInventory();
      const toolAgrees = isDeepStrictEqual(dryRun, gate.evaluation);
      return {
        id, expected, observed: gate.state, expectedReasons: reasons, reasons: gate.reasons,
        depotCables: before.snapshot.stock.find(r => r.store === 'depot' && r.sku === 'cable')!.quantity,
        inventoryBefore: before.inventoryHash, inventoryAfter: after.inventoryHash,
        planInventory: candidate.inventoryHash, reviewSubject: review.subjectHash,
        currentSubject: gate.evaluation.subjectHash, toolAcceptedPlan: tool.valid,
        toolAgrees, executionAllowed: gate.executionAllowed,
        pass: gate.state === expected && isDeepStrictEqual(gate.reasons, reasons) &&
          toolAgrees && !gate.executionAllowed && before.inventoryHash === after.inventoryHash,
      };
    }
    const cases = [await checkCase('unchanged', plan, originalReview, 'awaiting_owner', [])];
    // The test harness simulates a sale after review. Four units still fit.
    current = { ...current, stock: current.stock.map(r => r.store === 'depot' && r.sku === 'cable'
      ? { ...r, quantity: r.quantity - 1 } : r) };
    cases.push(await checkCase('stock-changed', plan, originalReview, 'blocked_evaluation', ['stale_inventory']));
    const rebound = { ...plan, inventoryHash: inventoryHash(current) };
    cases.push(await checkCase('updated-plan-old-review', rebound, originalReview, 'blocked_review', ['stale_review']));
    cases.push(await checkCase('fresh-review', rebound, fixtureReview(current, rebound), 'awaiting_owner', []));
    return { task: TASK, source, taskMatched, reviewSource: 'scripted fixture', cases, metrics: {
      cases: cases.length, passed: cases.filter(c => c.pass).length,
      missedBlocks: cases.filter(c => c.expected !== 'awaiting_owner' && c.observed === 'awaiting_owner').length,
      falseBlocks: cases.filter(c => c.expected === 'awaiting_owner' && c.observed !== 'awaiting_owner').length,
    } };
  } finally {
    try { await client.close(); } finally { await server.close(); }
  }
}

async function main(args: string[]) {
  const live = args.length === 1 && args[0] === '--live';
  if (!live && args.length) throw new Error('Usage: npm run demo:cohere [-- --live]');
  const recorded = live ? undefined : JSON.parse(await readFile(FILE, 'utf8'));
  const trial = await runTrial(live ? generateProposal : async () => ProposalRecord.parse(recorded.source));
  if (!live) {
    assert.equal(recorded.mode, 'live');
    assert.equal(recorded.modelCallsThisRun, 1);
    for (const key of ['task', 'taskMatched', 'reviewSource', 'cases', 'metrics'] as const) {
      assert.deepEqual(trial[key], recorded[key], 'Replay diverged at ' + key);
    }
  }
  const mode = live ? 'live' : 'replay';
  const result = { mode, modelCallsThisRun: live ? 1 : 0, ...trial };
  await mkdir('out', { recursive: true });
  const path = 'out/cohere-' + mode + '.json';
  const tempPath = path + '.' + randomUUID() + '.tmp';
  await writeFile(tempPath, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  await rename(tempPath, path);
  console.log(mode + ' | ' + trial.source.model + ' | model calls this run: ' + result.modelCallsThisRun);
  console.table(trial.cases.map(c => ({ case: c.id, stock: c.depotCables, outcome: c.observed, reasons: c.reasons.join(', '), pass: c.pass })));
  console.log('Requested transfer matched:', trial.taskMatched, '| Gate results:', trial.metrics, '| Report:', path);
  if (!trial.taskMatched || trial.metrics.passed !== trial.metrics.cases) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main(process.argv.slice(2));
