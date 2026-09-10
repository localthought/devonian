import github from '../github-issues/plugin.js?raw';
import notion from './notion/plugin.js?raw';
import clockify from './clockify/plugin.js?raw';

export const externalIntegrationEvidence = {
  'github-issues': github,
  notion,
  clockify,
} as const;
