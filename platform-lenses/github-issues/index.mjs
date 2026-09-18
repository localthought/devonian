/** Versioned entry point for the GitHub issue Atomic lens. */
import { Bridge } from './bridge.mjs';

export const descriptor = {
  id: 'github-issues',
  version: '1.0.0',
  platform: 'github',
  lens: 'github-issues',
};

/** Create a GitHub lens with host supplied runtime, ports and persistence. */
export function createBridge(host, options) {
  if (!host || typeof host !== 'object') throw new Error('Lens host is required');
  if (!options || typeof options !== 'object') throw new Error('Lens options are required');
  return new Bridge({ ...options, devonian: host });
}

export { Bridge } from './bridge.mjs';
export * from './ports.mjs';
export * from './proxy.mjs';
export * from './adapter.ts';
export * from './tracker-actions.ts';
export * from './types.mjs';
