/**
 * A generic bidirectional reflection engine: keeps records on two
 * `syncables`-backed systems of record in agreement (creates, open/closed
 * state, comments), using hidden origin markers to tell an original from a
 * reflected copy and never bounce a copy back onward.
 *
 * Extracted from `localthought/reflector`'s own reflect loop — see
 * `localthought/atomic-plugins#6` — so other hosts (reflector itself, and any
 * future bridge) can reuse the same engine instead of each keeping their own
 * copy. A host builds two {@link ReflectionSide}s (its own document/overlay/
 * auth machinery bound to a `syncables` client) and hands them to
 * {@link ReflectionEngine}; {@link ReflectionRunner} then wraps that engine
 * with a background interval loop plus an on-demand trigger.
 */
export {
  ReflectionEngine,
  type ReflectionSide,
  type ReflectionOptions,
  type ReflectionSummary,
} from './engine.js';
export {
  ReflectionRunner,
  type Reflectable,
  type ReflectionRun,
} from './runner.js';
export {
  embedMarker,
  hasMarker,
  parseMarker,
  renderMarker,
  stripMarker,
  type OriginRef,
} from './marker.js';
export { InMemoryIdMap, FileIdMap, type IdMap, type Link } from './id-map.js';
export { InMemoryKvStore, FileKvStore, type KvStore } from './kv-store.js';
