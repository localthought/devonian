import { ConnectClockify } from './ui/ConnectClockify';
import { ConnectGitHub } from './ui/ConnectGitHub';
import { ConnectNotion } from './ui/ConnectNotion';
import { ClockifyUpgrade } from './ui/ClockifyUpgrade';
import { googleCalendarIntegration } from './ui/GoogleCalendar';

/** Host UI registry: the consumer supplies the peer aliases used by these components. */
export const integrationRegistry = [
  { id: 'github-issues', label: 'GitHub issues', Component: ConnectGitHub, catalogDirect: true },
  {
    id: 'clockify', name: 'Clockify', icon: '⏱️', Component: ConnectClockify,
    description: 'Bring your completed work into the Time Tracker.',
    capabilities: 'Import completed entries with project and person links, start/end times and billable flags.',
    events: 'Review imports before applying them. This first version does not sync changes back.',
    limitation: 'Your entries only; up to 31 days. No active timers, updates, deletions, tags, task links, rates or custom fields.',
    keywords: 'clockify time tracking timesheet projects billable import',
    createsWorkspace: false,
  },
  {
    id: 'notion', name: 'Notion', icon: '📓', Component: ConnectNotion,
    description: 'Work with your Notion database in Atomic.',
    capabilities: 'Sync supported row fields, property names and table or board views.',
    events: 'Start automations from newly discovered rows.',
    limitation: 'Formatted text, relations, formulas and filtered views need additional mappings.',
    keywords: 'notion database table board rows knowledge tasks automation',
    createsWorkspace: true,
  },
] as const;
export const pluginUpgradeRegistry = [{ Component: ClockifyUpgrade }] as const;
export const externalIntegrationRegistry = [googleCalendarIntegration] as const;
export { GoogleCalendarImportControls, GoogleCalendarSync, googleCalendarIntegration } from './ui/GoogleCalendar';
export { externalIntegrationEvidence } from './evidence';

export { ConnectClockify } from './ui/ConnectClockify';
export { ConnectGitHub } from './ui/ConnectGitHub';
export { ClockifyUpgrade } from './ui/ClockifyUpgrade';
export { clockifyUpgrade } from './ui/clockifyUpgradeSource';
export { ConnectNotion } from './ui/ConnectNotion';
export { ConnectNotionManual } from './ui/ConnectNotionManual';
export {
  notionAuth,
  waitForNotion,
  waitForManagedNotion,
} from './ui/notionAuth';
export { installNotion } from './ui/notionInstaller';
export { timeTrackerTables } from './clockify/atomic';
export { install as installNotionIntegration } from './notion/atomic';
export { manifest as clockifyManifest } from './clockify/model';
export { manifest as notionManifest } from './notion/model';
export * as clockify from './clockify/model';
export * as notion from './notion/model';
