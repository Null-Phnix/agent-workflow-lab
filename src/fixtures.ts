import { inventoryHash, type Snapshot, type Plan } from './workflow.js';

// Entirely fictional. No employer, customer or personal data.
export const INVENTORY: Snapshot = {
  version: 1,
  stock: [
    { store: 'depot', sku: 'cable', quantity: 8 },
    { store: 'north', sku: 'cable', quantity: 1 },
    { store: 'south', sku: 'cable', quantity: 2 },
    { store: 'depot', sku: 'adapter', quantity: 4 },
    { store: 'north', sku: 'adapter', quantity: 0 },
    { store: 'south', sku: 'adapter', quantity: 0 },
  ],
  applied: [],
};
export function makePlan(north = 4, south = 4): Plan {
  return {
    version: 1, inventoryHash: inventoryHash(INVENTORY), producer: 'builder', note: '',
    transfers: [
      { requestId: 'req-north', from: 'depot', to: 'north', sku: 'cable', quantity: north },
      { requestId: 'req-south', from: 'depot', to: 'south', sku: 'cable', quantity: south },
    ],
  };
}
export const POLICY = {
  source: 'fictional-policy-v1', trust: 'data-not-instructions',
  rules: [
    'Use whole positive units; do not allocate more than initial source stock.',
    'Do not fund an outbound transfer with another transfer in the same proposal.',
    'An identical request ID and payload is a replay; changed payload is a conflict.',
    'Review must name the exact proposal, inventory snapshot and ruleset hash.',
    'A clean review is not owner approval. This demo has no execution capability.',
  ],
};
