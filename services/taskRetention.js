export const STALE_TASK_OVERDUE_DAYS = 7;
export const ACTIVE_TASK_STATES = ['DUE', 'OPEN'];

const DAY_MS = 86400000;
const HISTORY_TASK_STATES = ['COMPLETED', 'SKIPPED'];

export function getTaskRetentionCutoff(now = new Date()) {
  return new Date(now.getTime() - STALE_TASK_OVERDUE_DAYS * DAY_MS);
}

export function isTaskPastRetention(task, now = new Date()) {
  if (!task?.due_at) return false;
  const dueAt = new Date(task.due_at);
  if (Number.isNaN(dueAt.getTime())) return false;
  return dueAt < getTaskRetentionCutoff(now);
}

function getTaskTime(task) {
  if (!task?.due_at) return Number.MAX_SAFE_INTEGER;
  const time = new Date(task.due_at).getTime();
  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
}

function getTaskSortRank(task) {
  if (ACTIVE_TASK_STATES.includes(task.state)) return 0;
  if (HISTORY_TASK_STATES.includes(task.state)) return 2;
  return 1;
}

export function filterAndSortVisibleTasks(tasks, now = new Date()) {
  return (tasks || [])
    .filter((task) => !isTaskPastRetention(task, now))
    .sort((a, b) => {
      const rankDelta = getTaskSortRank(a) - getTaskSortRank(b);
      if (rankDelta !== 0) return rankDelta;

      const aTime = getTaskTime(a);
      const bTime = getTaskTime(b);
      return getTaskSortRank(a) === 2 ? bTime - aTime : aTime - bTime;
    });
}
