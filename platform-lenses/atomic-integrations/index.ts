import { ConnectClockify } from './ui/ConnectClockify';
import { ConnectNotion } from './ui/ConnectNotion';

/** Host UI registry: the consumer supplies the peer aliases used by these components. */
export const integrationRegistry = [
  { id: 'clockify', label: 'Clockify', Component: ConnectClockify },
  { id: 'notion', label: 'Notion', Component: ConnectNotion },
] as const;

export { ConnectClockify } from './ui/ConnectClockify';
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
