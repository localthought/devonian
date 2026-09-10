import { ConnectClockify } from './ui/ConnectClockify';
import { ConnectGitHub } from './ui/ConnectGitHub';
import { ConnectNotion } from './ui/ConnectNotion';
import { googleCalendarIntegration } from './ui/GoogleCalendar';

/** Host UI registry: the consumer supplies the peer aliases used by these components. */
export const integrationRegistry = [
  { id: 'github-issues', label: 'GitHub issues', Component: ConnectGitHub, catalogDirect: true },
  { id: 'clockify', label: 'Clockify', Component: ConnectClockify },
  { id: 'notion', label: 'Notion', Component: ConnectNotion },
] as const;
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
