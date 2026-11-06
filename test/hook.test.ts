import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const run = (input: string) => spawnSync(process.execPath, ['scripts/hook.mjs'], { input, encoding: 'utf8', timeout: 2_000 });
const payload = (command: string) => JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command } });
test('documented command keeps normal permissions; never auto-allows', () => {
  for (const command of ['npm run build', 'npm test', 'npm run verify', 'npm run eval', 'npm run demo']) {
    const result = run(payload(command)); assert.equal(result.status, 0); assert.equal(result.stdout, '');
  }
});
test('chaining, alternate scripts and command substitutions are denied', () => {
  for (const command of ['npm test; echo nope', 'npm test && echo nope', 'npm test\necho nope', 'npm run demo $(echo nope)', 'npm run other', 'git push']) {
    const result = run(payload(command)); assert.equal(result.status, 0);
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, 'deny');
  }
});
test('malformed or oversized event blocks without logging raw input', () => {
  for (const input of ['not-json', '{}', 'x'.repeat(17_000), JSON.stringify({ tool_name: 'Read' })]) {
    const result = run(input); assert.equal(result.status, 2); assert.equal(result.stdout, '');
    assert.equal(result.stderr.trim(), 'Invalid or oversized hook input; action blocked.');
  }
});
