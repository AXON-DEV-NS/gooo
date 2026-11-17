import {
  SCHEMA_VERSION,
  createDefaultQuranProgress,
  createDefaultSettings,
  createDefaultStudyProgress,
  createInitialState,
} from '../data/defaults.js';

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isPlainObject(val) {
  return val !== null && typeof val === 'object' && !Array.isArray(val);
}

export function sanitizeJsonValue(val, depth = 0) {
  if (depth > 16) return null;
  if (Array.isArray(val)) {
    return val.map((item) => sanitizeJsonValue(item, depth + 1));
  }
  if (isPlainObject(val)) {
    const clean = {};
    for (const [k, v] of Object.entries(val)) {
      if (FORBIDDEN_KEYS.has(k)) continue;
      clean[k] = sanitizeJsonValue(v, depth + 1);
    }
    return clean;
  }
  return val;
}

function deepMergeDefaults(defaults, incoming) {
  if (!isPlainObject(defaults)) {
    return incoming !== undefined ? incoming : defaults;
  }
  const result = {};
  const src = isPlainObject(incoming) ? incoming : {};
  for (const key of Object.keys(defaults)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    // الخرائط ذات المفاتيح الديناميكية (التواريخ أو الأيام) تُحفظ مع تنقية أي مفاتيح خطرة
    if (isPlainObject(defaults[key]) && Object.keys(defaults[key]).length === 0 && isPlainObject(src[key])) {
      result[key] = sanitizeJsonValue(src[key]);
      continue;
    }
    result[key] = deepMergeDefaults(defaults[key], src[key]);
  }
  return result;
}

/**
 * ترحيل آمن للحالة المخزنة عند ترقية إصدار التطبيق (v0/v1 -> v2)
 * دون فقدان مهام المستخدم أو عاداته أو تقدم المذاكرة.
 */
export function migrateState(rawState) {
  const baseline = createInitialState();
  if (!isPlainObject(rawState)) {
    return baseline;
  }

  const incomingVersion = Number(rawState.schemaVersion || 0);
  const mergedSettings = deepMergeDefaults(createDefaultSettings(), rawState.settings);

  const tasks = Array.isArray(rawState.tasks) ? rawState.tasks : baseline.tasks;
  const habitsByDate = isPlainObject(rawState.habitsByDate) ? rawState.habitsByDate : {};
  const studyProgress = deepMergeDefaults(createDefaultStudyProgress(), rawState.studyProgress);
  const quranProgress = deepMergeDefaults(createDefaultQuranProgress(), rawState.quranProgress);
  const focusSessions = Array.isArray(rawState.focusSessions) ? rawState.focusSessions : [];
  const alertLedger = isPlainObject(rawState.alertLedger) ? rawState.alertLedger : {};
  const customEvents = Array.isArray(rawState.customEvents) ? rawState.customEvents : [];

  const cache = isPlainObject(rawState.cache)
    ? {
        prayerMonths: isPlainObject(rawState.cache.prayerMonths) ? rawState.cache.prayerMonths : {},
        weather: isPlainObject(rawState.cache.weather) ? rawState.cache.weather : null,
        timeDrift: isPlainObject(rawState.cache.timeDrift)
          ? deepMergeDefaults(baseline.cache.timeDrift, rawState.cache.timeDrift)
          : baseline.cache.timeDrift,
      }
    : baseline.cache;

  const systemLog = Array.isArray(rawState.systemLog) ? rawState.systemLog.slice(-40) : [];

  return {
    schemaVersion: incomingVersion < SCHEMA_VERSION ? SCHEMA_VERSION : incomingVersion,
    settings: mergedSettings,
    tasks,
    habitsByDate,
    studyProgress,
    quranProgress,
    focusSessions,
    alertLedger,
    customEvents,
    cache,
    systemLog,
  };
}
