import {
  filterAndSortVisibleTasks,
  getTaskRetentionCutoff,
  STALE_TASK_OVERDUE_DAYS,
} from '../services/taskRetention';

describe('task retention', () => {
  const now = new Date('2026-06-03T12:00:00.000Z');

  test('uses a seven day cutoff', () => {
    expect(STALE_TASK_OVERDUE_DAYS).toBe(7);
    expect(getTaskRetentionCutoff(now).toISOString()).toBe('2026-05-27T12:00:00.000Z');
  });

  test('filters tasks with due dates older than retention window', () => {
    const tasks = [
      { id: 'march-due', state: 'DUE', due_at: '2026-03-17T09:38:00.000Z' },
      { id: 'march-completed', state: 'COMPLETED', due_at: '2026-03-17T09:38:00.000Z' },
      { id: 'fresh-overdue', state: 'DUE', due_at: '2026-06-01T09:38:00.000Z' },
      { id: 'future', state: 'DUE', due_at: '2026-06-04T09:38:00.000Z' },
      { id: 'no-date', state: 'DUE', due_at: null },
    ];

    expect(filterAndSortVisibleTasks(tasks, now).map((task) => task.id)).toEqual([
      'fresh-overdue',
      'future',
      'no-date',
    ]);
  });

  test('keeps current active tasks ahead of recent history', () => {
    const tasks = [
      { id: 'completed-recent', state: 'COMPLETED', due_at: '2026-06-02T09:38:00.000Z' },
      { id: 'future', state: 'DUE', due_at: '2026-06-04T09:38:00.000Z' },
      { id: 'fresh-overdue', state: 'DUE', due_at: '2026-06-01T09:38:00.000Z' },
    ];

    expect(filterAndSortVisibleTasks(tasks, now).map((task) => task.id)).toEqual([
      'fresh-overdue',
      'future',
      'completed-recent',
    ]);
  });
});
