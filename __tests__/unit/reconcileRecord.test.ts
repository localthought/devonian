import { describe, expect, it } from 'vitest';
import { reconcileRecord } from '../../src/reconcileRecord.js';

describe('reconcileRecord', () => {
  it('marks equal observations as agreed without changes', () => {
    const decision = reconcileRecord(
      { title: 'before' },
      { title: 'same' },
      { title: 'same' },
    );
    expect(decision.conflicts).toEqual([]);
    expect(decision.agreed).toEqual({ title: 'same' });
    expect(decision.local).toEqual({});
    expect(decision.remote).toEqual({});
  });

  it('reports a conflict when both sides edit the same field', () => {
    const decision = reconcileRecord(
      { title: 'before' },
      { title: 'local' },
      { title: 'remote' },
    );
    expect(decision.conflicts).toHaveLength(1);
    expect(decision.conflicts[0].property).toBe('title');
  });
});
