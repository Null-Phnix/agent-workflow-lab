// A convenience guard for this exercise, not a security sandbox.
const approvedScripts = new Set(['npm run build', 'npm test', 'npm run verify', 'npm run eval', 'npm run demo']);
let input = '';
try {
  for await (const chunk of process.stdin) {
    input += chunk;
    if (Buffer.byteLength(input) > 16_384) throw new Error('oversized');
  }
  const event = JSON.parse(input);
  if (event.hook_event_name !== 'PreToolUse' || event.tool_name !== 'Bash' || typeof event.tool_input?.command !== 'string') throw new Error('invalid');
  // Do not return 'allow': matching commands still follow the host's normal permissions.
  if (!approvedScripts.has(event.tool_input.command)) {
    console.log(JSON.stringify({ hookSpecificOutput: {
      hookEventName: 'PreToolUse', permissionDecision: 'deny',
      permissionDecisionReason: 'This exercise only permits the documented npm build/test/verify/demo commands. Ask the owner before expanding scope.',
    } }));
  }
} catch {
  console.error('Invalid or oversized hook input; action blocked.');
  process.exitCode = 2;
}
