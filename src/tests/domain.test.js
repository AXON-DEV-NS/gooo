import { describe, expect, it } from 'vitest';
import { createDefaultSettings } from '../data/defaults.js';
import {
  computeHabitCompletion,
  cycleTaskStatus,
  getCurrentOrNextTask,
  getHabitRecordForDate,
  sortTasks,
  toggleHabitForDate,
} from '../services/domain.js';

describe('domain logic (habits & tasks)', () => {
  it('preserves yesterday habits when a new day starts and allows editing past days', () => {
    const settings = createDefaultSettings();
    let habitsByDate = {};
    habitsByDate = toggleHabitForDate(habitsByDate, '2026-11-15', 'fajr');
    habitsByDate = toggleHabitForDate(habitsByDate, '2026-11-15', 'quran');

    // دخول يوم جديد 2026-11-16
    const todayRec = getHabitRecordForDate(habitsByDate, '2026-11-16');
    expect(todayRec.fajr).toBe(false);
    expect(computeHabitCompletion(todayRec, settings).completedCount).toBe(0);

    // سجل الأمس لم يتأثر
    const yesterdayRec = getHabitRecordForDate(habitsByDate, '2026-11-15');
    expect(yesterdayRec.fajr).toBe(true);
    expect(yesterdayRec.quran).toBe(true);
    expect(computeHabitCompletion(yesterdayRec, settings).completedCount).toBe(2);

    // تصحيح يوم سابق 2026-11-15
    habitsByDate = toggleHabitForDate(habitsByDate, '2026-11-15', 'dhuhr');
    expect(computeHabitCompletion(getHabitRecordForDate(habitsByDate, '2026-11-15'), settings).completedCount).toBe(3);
  });

  it('sorts tasks by time and priority and resolves active/next task', () => {
    const tasks = [
      { id: '2', title: 'ثانية', startTime: '18:00', endTime: '19:00', priority: 'عادية', status: 'pending' },
      { id: '1', title: 'أولى', startTime: '15:00', endTime: '16:00', priority: 'عالية', status: 'completed' },
      { id: '3', title: 'حالية', startTime: '16:30', endTime: '17:30', priority: 'متوسطة', status: 'pending' },
    ];
    const sorted = sortTasks(tasks);
    expect(sorted.map((t) => t.id)).toEqual(['1', '3', '2']);
    expect(getCurrentOrNextTask(tasks, '17:00')?.id).toBe('3');
    expect(cycleTaskStatus('pending')).toBe('in_progress');
    expect(cycleTaskStatus('in_progress')).toBe('completed');
    expect(cycleTaskStatus('completed')).toBe('pending');
  });
});
