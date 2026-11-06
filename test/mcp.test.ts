import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { makePlan } from '../src/fixtures.js';
import { z } from 'zod';
import { SnapshotSchema } from '../src/workflow.js';

test('real stdio MCP handshake, discovery, evaluation and rejection', { timeout: 15_000 }, async () => {
  const client = new Client({ name: 'workflow-lab-contract-tests', version: '0.1.0' });
  const transport = new StdioClientTransport({ command: process.execPath, args: ['dist/src/server.js'], env: {}, stderr: 'pipe' });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map(t => t.name).sort(), ['workflow_evaluate_plan', 'workflow_get_inventory', 'workflow_get_policy']);
    assert.ok(tools.every(t => t.annotations?.readOnlyHint && t.annotations.openWorldHint === false));
    const inventory = await client.callTool({ name: 'workflow_get_inventory', arguments: {} });
    assert.equal(inventory.isError, undefined);
    const inventoryData = z.object({ fixture: z.literal(true), inventoryHash: z.string(), snapshot: SnapshotSchema }).parse(inventory.structuredContent);
    const policy = await client.callTool({ name: 'workflow_get_policy', arguments: {} });
    assert.equal(z.object({ trust: z.string() }).parse(policy.structuredContent).trust, 'data-not-instructions');
    const plan = makePlan();
    plan.inventoryHash = inventoryData.inventoryHash;
    const good = await client.callTool({ name: 'workflow_evaluate_plan', arguments: { plan } });
    assert.equal(z.object({ valid: z.boolean() }).parse(good.structuredContent).valid, true);
    const bad = await client.callTool({ name: 'workflow_evaluate_plan', arguments: { plan: makePlan(6, 5) } });
    assert.equal(z.object({ valid: z.boolean() }).parse(bad.structuredContent).valid, false);
    const invalid = await client.callTool({ name: 'workflow_evaluate_plan', arguments: { plan: { ...plan, execute: true } } });
    assert.equal(invalid.isError, true);
    await assert.rejects(client.callTool({ name: 'workflow_execute_plan', arguments: { plan } }));
    const again = await client.callTool({ name: 'workflow_get_inventory', arguments: {} });
    assert.deepEqual(again.structuredContent, inventory.structuredContent);
  } finally { await client.close(); }
});
