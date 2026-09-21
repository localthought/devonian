import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ReflectionRunner,
  type Reflectable,
} from '../../../src/reflect/runner.js';
import type { ReflectionSummary } from '../../../src/reflect/engine.js';

const emptySummary: ReflectionSummary = {
  created: [],
  updated: [],
  errors: [],
};

function fakeEngine(
  impl: () => Promise<ReflectionSummary>,
): Reflectable & { calls: number } {
  const engine = {
    calls: 0,
    reflect: async (): Promise<ReflectionSummary> => {
      engine.calls += 1;
      return impl();
    },
  };
  return engine;
}

describe('ReflectionRunner', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reports status before any run', () => {
    const runner = new ReflectionRunner(
      fakeEngine(async () => emptySummary),
      1000,
      'bidirectional',
      ['a', 'b'],
    );
    const status = runner.status();
    expect(status).toEqual({
      enabled: true,
      direction: 'bidirectional',
      intervalMs: 1000,
      systems: ['a', 'b'],
    });
  });

  it('reflectNow runs the engine and records the run in status', async () => {
    const summary: ReflectionSummary = {
      created: [{ kind: 'issue', from: 'a#1', to: 'b#2' }],
      updated: [],
      errors: [],
    };
    const runner = new ReflectionRunner(
      fakeEngine(async () => summary),
      1000,
      'bidirectional',
      ['a', 'b'],
    );

    const result = await runner.reflectNow();
    expect(result).toBe(summary);

    const status = runner.status();
    expect(status.lastRun?.summary).toBe(summary);
    expect(status.lastError).toBeUndefined();
    expect(typeof status.lastRun?.at).toBe('string');
  });

  it('records lastError on a failed pass and clears it on the next success', async () => {
    let fail = true;
    const runner = new ReflectionRunner(
      fakeEngine(async () => {
        if (fail) throw new Error('boom');
        return emptySummary;
      }),
      1000,
      'bidirectional',
      ['a', 'b'],
    );

    await expect(runner.reflectNow()).rejects.toThrow('boom');
    expect(runner.status().lastError).toBe('boom');

    fail = false;
    await runner.reflectNow();
    expect(runner.status().lastError).toBeUndefined();
  });

  it('serializes concurrent reflectNow calls so they never overlap', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const engine = fakeEngine(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return emptySummary;
    });
    const runner = new ReflectionRunner(engine, 1000, 'bidirectional', [
      'a',
      'b',
    ]);

    await Promise.all([
      runner.reflectNow(),
      runner.reflectNow(),
      runner.reflectNow(),
    ]);
    expect(maxInFlight).toBe(1);
    expect(engine.calls).toBe(3);
  });

  it('start() runs immediately and again on each interval; stop() cancels it', async () => {
    vi.useFakeTimers();
    const engine = fakeEngine(async () => emptySummary);
    const runner = new ReflectionRunner(engine, 100, 'bidirectional', [
      'a',
      'b',
    ]);

    runner.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(engine.calls).toBe(1);

    await vi.advanceTimersByTimeAsync(250);
    expect(engine.calls).toBe(3);

    runner.stop();
    await vi.advanceTimersByTimeAsync(500);
    expect(engine.calls).toBe(3);
  });

  it('start() is idempotent — calling it twice does not double the interval', async () => {
    vi.useFakeTimers();
    const engine = fakeEngine(async () => emptySummary);
    const runner = new ReflectionRunner(engine, 100, 'bidirectional', [
      'a',
      'b',
    ]);

    runner.start();
    runner.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(100);
    expect(engine.calls).toBe(2);
    runner.stop();
  });
});
