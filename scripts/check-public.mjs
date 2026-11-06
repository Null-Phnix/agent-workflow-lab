import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const excluded = new Set(['.git', 'node_modules', 'dist', 'out']);
const patterns = [
  [/\/(?:home|Users|mnt)\//, 'machine-specific absolute path'],
  [/\b100\.(?:6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\.\d+\.\d+\b/, 'private overlay address'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key'],
  [/\b(?:sk-proj|ghp|github_pat)-?[A-Za-z0-9_]{24,}/, 'credential-shaped value'],
];
let count = 0;
async function scan(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Public tree contains a symlink: ${path}`);
    if (entry.isDirectory()) { await scan(path); continue; }
    if (/^\.env(?:\.|$)/.test(entry.name) && entry.name !== '.env.example') throw new Error(`Local environment file: ${path}`);
    const data = await readFile(path, 'utf8'); count++;
    for (const [pattern, label] of patterns) if (pattern.test(data)) throw new Error(`${label}: ${path}`);
  }
}
await scan('.');
console.log(`Public-content scan passed (${count} files). Heuristic only; manual review and secret scanning remain separate.`);
