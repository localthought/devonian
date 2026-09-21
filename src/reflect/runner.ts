import type { ReflectionSummary } from './engine.js';

/** Anything with a `reflect()` pass — {@link ReflectionEngine}'s shape. */
export interface Reflectable {
  reflect(): Promise<ReflectionSummary>;
}

/** A summary plus when it ran, for a status endpoint. */
export interface ReflectionRun {
  at: string;
  summary: ReflectionSummary;
}

/**
 * Runs a {@link Reflectable} (normally a {@link ReflectionEngine}) on a
 * background interval and on demand.
 *
 * `reflectNow()` is the "reflect now" seam (an HTTP trigger, or a live-test
 * harness kick) and the background loop both go through one serialized chain,
 * so a manual trigger and a scheduled tick never overlap.
 *
 * This class has no notion of configuration, persistence, or how `engine` was
 * built — a host application owns all of that and passes in a ready
 * `Reflectable` plus the display metadata (`intervalMs`, `direction`,
 * `systems`) it wants echoed back from {@link status}.
 */
export class ReflectionRunner {
  private timer: ReturnType<typeof setInterval> | undefined;
  private chain: Promise<unknown> = Promise.resolve();
  private lastRun: ReflectionRun | undefined;
  private lastError: string | undefined;

  constructor(
    private readonly engine: Reflectable,
    private readonly intervalMs: number,
    private readonly direction: 'bidirectional' | 'a-to-b',
    private readonly systems: [string, string],
  ) {}

  /** Triggers one reflection pass, serialized with the loop and other triggers. */
  async reflectNow(): Promise<ReflectionSummary> {
    const run = this.chain.then(() => this.engine.reflect());
    // Keep the chain alive regardless of this run's outcome.
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    try {
      const summary = await run;
      this.lastRun = { at: new Date().toISOString(), summary };
      this.lastError = undefined;
      return summary;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  /** Starts the background loop (an immediate pass, then every `intervalMs`). */
  start(): void {
    if (this.timer) {
      return;
    }
    const tick = (): void => {
      void this.reflectNow().catch((error: unknown) => {
        console.error('Reflection pass failed:', error);
      });
    };
    tick();
    this.timer = setInterval(tick, this.intervalMs);
    if (typeof this.timer.unref === 'function') {
      this.timer.unref();
    }
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  status(): {
    enabled: true;
    direction: string;
    intervalMs: number;
    systems: [string, string];
    lastRun?: ReflectionRun;
    lastError?: string;
  } {
    return {
      enabled: true,
      direction: this.direction,
      intervalMs: this.intervalMs,
      systems: this.systems,
      ...(this.lastRun ? { lastRun: this.lastRun } : {}),
      ...(this.lastError ? { lastError: this.lastError } : {}),
    };
  }
}
