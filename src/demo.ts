import { mkdir, writeFile } from 'node:fs/promises';
import { INVENTORY, makePlan } from './fixtures.js';
import { evaluatePlan, reviewReadiness } from './workflow.js';

const broken = makePlan(6, 5);
const corrected = makePlan(4, 4);
const failed = evaluatePlan(INVENTORY, broken);
const passed = evaluatePlan(INVENTORY, corrected);
const staleReview = { subjectHash: failed.subjectHash, reviewer: 'fixture-reviewer', verdict: 'approve', findings: [] };
const currentReview = { ...staleReview, subjectHash: passed.subjectHash };
const report = {
  kind: 'deterministic-control-demo', modelInvocations: 0,
  reviewer: 'scripted fixture, not an independent model or human review',
  stages: [
    { name: 'Over-allocation blocked', result: reviewReadiness(INVENTORY, broken) },
    { name: 'Corrected proposal needs review', result: reviewReadiness(INVENTORY, corrected) },
    { name: 'Old review rejected', result: reviewReadiness(INVENTORY, corrected, staleReview) },
    { name: 'Matching fixture review stops at owner', result: reviewReadiness(INVENTORY, corrected, currentReview) },
  ],
};
await mkdir('out', { recursive: true });
await writeFile('out/demo.json', JSON.stringify(report, null, 2) + '\n');
console.log('Agent Workflow Lab | fictional data | zero model calls');
for (const stage of report.stages) console.log(`${stage.name}: ${stage.result.state} [executionAllowed=false]`);
console.log('Inspectable report: out/demo.json');
