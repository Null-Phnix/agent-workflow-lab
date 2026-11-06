import { createHash } from 'node:crypto';
import { z } from 'zod';

export const Store = z.enum(['depot', 'north', 'south']);
export const Sku = z.enum(['cable', 'adapter']);
const Units = z.number().int().min(0).max(1_000_000);
const Id = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/);
const Digest = z.string().regex(/^[a-f0-9]{64}$/);
export const TransferSchema = z.object({
  requestId: Id, from: Store, to: Store, sku: Sku,
  quantity: Units.min(1),
}).strict();
export const SnapshotSchema = z.object({
  version: z.literal(1),
  stock: z.array(z.object({ store: Store, sku: Sku, quantity: Units }).strict()).min(1).max(6),
  applied: z.array(TransferSchema).max(100),
}).strict().superRefine((value, ctx) => {
  const keys = value.stock.map(row => `${row.store}:${row.sku}`);
  if (new Set(keys).size !== keys.length) ctx.addIssue({ code: 'custom', message: 'Duplicate stock row' });
  const ids = value.applied.map(row => row.requestId);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'Duplicate applied request ID' });
});
export const PlanSchema = z.object({
  version: z.literal(1), inventoryHash: Digest, producer: Id,
  transfers: z.array(TransferSchema).min(1).max(20),
  // Free text is evidence only. It never changes rules, identity or authority.
  note: z.string().max(500).default(''),
}).strict();
export const ReviewSchema = z.object({
  subjectHash: Digest, reviewer: Id, verdict: z.enum(['approve', 'request_changes']),
  findings: z.array(z.string().min(1).max(300)).max(20),
}).strict();
export type Snapshot = z.infer<typeof SnapshotSchema>;
export type Plan = z.infer<typeof PlanSchema>;
export type Review = z.infer<typeof ReviewSchema>;
export const RULESET = 'inventory-transfer-v1';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj).sort().map(key => `${JSON.stringify(key)}:${canonical(obj[key])}`).join(',')}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error('Cannot hash an undefined value');
  return encoded;
}
export function hash(value: unknown): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}
export function inventoryHash(snapshot: Snapshot): string { return hash(SnapshotSchema.parse(snapshot)); }
export function subjectHash(snapshot: Snapshot, plan: Plan): string {
  return hash({ ruleset: RULESET, snapshot: SnapshotSchema.parse(snapshot), plan: PlanSchema.parse(plan) });
}
export type Evaluation = {
  subjectHash: string; ruleset: string; valid: boolean; violations: string[];
  projectedStock: Snapshot['stock']; skippedReplays: number;
};

/** Pure dry run. Never writes inventory, sends requests, or approves execution. */
export function evaluatePlan(snapshotInput: unknown, planInput: unknown): Evaluation {
  const snapshot = SnapshotSchema.parse(snapshotInput);
  const plan = PlanSchema.parse(planInput);
  const violations: string[] = [];
  if (plan.inventoryHash !== inventoryHash(snapshot)) violations.push('stale_inventory');
  const balances = new Map(snapshot.stock.map(row => [`${row.store}:${row.sku}`, row.quantity]));
  const original = new Map(balances);
  const seen = new Map(snapshot.applied.map(row => [row.requestId, hash(row)]));
  // Outbound capacity is based on the initial snapshot: transfers cannot rely on
  // another proposed transfer arriving first. This avoids order-dependent plans.
  const outbound = new Map<string, number>();
  let skippedReplays = 0;
  for (const move of plan.transfers) {
    const existing = seen.get(move.requestId);
    if (existing !== undefined) {
      if (existing !== hash(move)) violations.push(`conflicting_replay:${move.requestId}`);
      else skippedReplays++;
      continue;
    }
    seen.set(move.requestId, hash(move));
    if (move.from === move.to) { violations.push(`same_store:${move.requestId}`); continue; }
    const from = `${move.from}:${move.sku}`;
    const to = `${move.to}:${move.sku}`;
    if (!balances.has(from) || !balances.has(to)) { violations.push(`unknown_stock:${move.requestId}`); continue; }
    const total = (outbound.get(from) ?? 0) + move.quantity;
    outbound.set(from, total);
    if (total > (original.get(from) ?? 0)) violations.push(`insufficient_stock:${from}`);
    balances.set(from, balances.get(from)! - move.quantity);
    balances.set(to, balances.get(to)! + move.quantity);
  }
  // Capacity belongs to the projected end state, not a temporary iteration
  // order. Outbound affordability above still uses initial stock only.
  for (const [key, quantity] of balances) if (quantity > 1_000_000) violations.push(`stock_limit:${key}`);
  const valid = violations.length === 0;
  return {
    subjectHash: subjectHash(snapshot, plan), ruleset: RULESET, valid,
    violations: [...new Set(violations)], skippedReplays,
    // An invalid candidate never produces a partially applied stock proposal.
    projectedStock: valid ? snapshot.stock.map(row => ({ ...row, quantity: balances.get(`${row.store}:${row.sku}`)! })) : [],
  };
}

/** Review is evidence, not authorization. Even a clean result stops at the owner. */
export function reviewReadiness(snapshot: unknown, planInput: unknown, reviewInput?: unknown): {
  state: 'blocked_evaluation' | 'needs_review' | 'blocked_review' | 'awaiting_owner';
  reasons: string[]; evaluation: Evaluation; executionAllowed: false;
} {
  const plan = PlanSchema.parse(planInput);
  const evaluation = evaluatePlan(snapshot, plan);
  const base = { evaluation, executionAllowed: false as const };
  if (!evaluation.valid) return { ...base, state: 'blocked_evaluation', reasons: evaluation.violations };
  if (reviewInput === undefined) return { ...base, state: 'needs_review', reasons: ['No review provided'] };
  const review = ReviewSchema.parse(reviewInput);
  const reasons: string[] = [];
  if (review.subjectHash !== evaluation.subjectHash) reasons.push('stale_review');
  if (review.reviewer === plan.producer) reasons.push('self_review');
  if (review.verdict !== 'approve' || review.findings.length > 0) reasons.push('review_not_clear');
  return { ...base, state: reasons.length ? 'blocked_review' : 'awaiting_owner', reasons };
}
