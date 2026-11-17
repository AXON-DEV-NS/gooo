import { parseHHMMToMinutes } from './clock.js';

const PRIORITY_WEIGHT = {
  'عالية': 3,
  'متوسطة': 2,
  'عادية': 1,
};

export function sortTasks(tasks = []) {
  return [...tasks].sort((a, b) => {
    const startA = parseHHMMToMinutes(a.startTime) ?? 9999;
    const startB = parseHHMMToMinutes(b.startTime) ?? 9999;
    if (startA !== startB) return startA - startB;
    return (PRIORITY_WEIGHT[b.priority] || 0) - (PRIORITY_WEIGHT[a.priority] || 0);
  });
}

export function getCurrentOrNextTask(tasks = [], currentHHMM) {
  const ordered = sortTasks(tasks).filter((t) => t.status !== 'completed');
  if (ordered.length === 0) return null;

  const explicitActive = ordered.find((t) => t.status === 'in_progress');
  if (explicitActive) return explicitActive;

  const curMins = parseHHMMToMinutes(currentHHMM);
  if (curMins !== null) {
    const insideWindow = ordered.find((t) => {
      const s = parseHHMMToMinutes(t.startTime);
      const e = parseHHMMToMinutes(t.endTime);
      return s !== null && e !== null && curMins >= s && curMins <= e;
    });
    if (insideWindow) return insideWindow;

    const upcoming = ordered.find((t) => {
      const s = parseHHMMToMinutes(t.startTime);
      return s !== null && s >= curMins;
    });
    if (upcoming) return upcoming;
  }

  return ordered[0];
}

export function cycleTaskStatus(currentStatus) {
  if (currentStatus === 'pending') return 'in_progress';
  if (currentStatus === 'in_progress') return 'completed';
  return 'pending';
}

export function getTaskStatusLabel(status) {
  if (status === 'completed') return 'مكتملة';
  if (status === 'in_progress') return 'قيد التنفيذ';
  return 'لم تبدأ';
}

export function createTaskRecord({ title, category = 'مذاكرة', startTime = '16:00', endTime = '17:00', priority = 'متوسطة' }) {
  const nowIso = new Date().toISOString();
  const id = `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  return {
    id,
    title: String(title || '').trim(),
    category: String(category || 'عام').trim(),
    startTime,
    endTime,
    priority,
    status: 'pending',
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export function getHabitItemsConfig(settings) {
  const items = [
    { id: 'fajr', label: 'صلاة الفجر', group: 'الصلوات' },
    { id: 'dhuhr', label: 'صلاة الظهر', group: 'الصلوات' },
    { id: 'asr', label: 'صلاة العصر', group: 'الصلوات' },
    { id: 'maghrib', label: 'صلاة المغرب', group: 'الصلوات' },
    { id: 'isha', label: 'صلاة العشاء', group: 'الصلوات' },
    { id: 'quran', label: 'ورد القرآن الكريم', group: 'اليوم' },
    { id: 'study', label: 'إنجاز مهمة المذاكرة', group: 'اليوم' },
  ];

  if (settings?.habits?.enableWater !== false) {
    items.push({ id: 'water', label: 'شرب الماء الكافي', group: 'العناية' });
  }
  if (settings?.habits?.enableMovement !== false) {
    items.push({ id: 'movement', label: 'حركة ونشاط بدني خفيف', group: 'العناية' });
  }
  return items;
}

export function createEmptyHabitDay() {
  return {
    fajr: false,
    dhuhr: false,
    asr: false,
    maghrib: false,
    isha: false,
    quran: false,
    study: false,
    water: false,
    movement: false,
  };
}

export function getHabitRecordForDate(habitsByDate, dateKey) {
  return {
    ...createEmptyHabitDay(),
    ...(habitsByDate?.[dateKey] || {}),
  };
}

export function computeHabitCompletion(dayRecord, settings) {
  const items = getHabitItemsConfig(settings);
  const completedCount = items.filter((item) => Boolean(dayRecord?.[item.id])).length;
  const totalCount = items.length;
  const percent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  return { completedCount, totalCount, percent };
}

export function toggleHabitForDate(habitsByDate, dateKey, habitId) {
  const existing = getHabitRecordForDate(habitsByDate, dateKey);
  const updatedDay = {
    ...existing,
    [habitId]: !existing[habitId],
    updatedAt: new Date().toISOString(),
  };
  return {
    ...(habitsByDate || {}),
    [dateKey]: updatedDay,
  };
}
