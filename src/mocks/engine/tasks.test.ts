import { describe, expect, it } from 'vitest';
import { collectTasks, DAY, dueState, HOUR, registerTaskSource } from './tasks';

describe('dueState', () => {
  const start = '2026-10-20T00:00:00.000Z';
  const at = (iso: string) => new Date(iso).getTime();

  it('quá hạn khi đã qua mốc', () => {
    expect(dueState(start, DAY, at('2026-10-21T01:00:00.000Z'))).toEqual({
      dueAt: '2026-10-21T00:00:00.000Z',
      severity: 'overdue',
    });
  });

  it('sắp tới hạn khi còn dưới một phần tư thời hạn', () => {
    expect(dueState(start, DAY, at('2026-10-20T19:00:00.000Z')).severity).toBe('due_soon');
    expect(dueState(start, DAY, at('2026-10-20T12:00:00.000Z')).severity).toBe('info');
  });
});

describe('collectTasks', () => {
  registerTaskSource({
    kind: 'test.a',
    permission: 'a.view',
    collect: (companyId) => [
      { id: '1', kind: 'test.a', group: 'A', title: 'Còn hạn', detail: '', dueAt: '2026-10-30T00:00:00.000Z', severity: 'info', ref: { type: 'order', id: companyId } },
      { id: '2', kind: 'test.a', group: 'A', title: 'Quá hạn', detail: '', dueAt: '2026-10-29T00:00:00.000Z', severity: 'overdue', ref: { type: 'order', id: companyId } },
    ],
  });

  it('lọc theo quyền và xếp việc quá hạn lên đầu', () => {
    expect(collectTasks('c1', [])).toEqual([]);
    expect(collectTasks('c1', ['a.view'], 2 * HOUR).map((t) => t.title)).toEqual(['Quá hạn', 'Còn hạn']);
  });
});
