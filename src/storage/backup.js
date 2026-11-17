import { SCHEMA_VERSION } from '../data/defaults.js';
import { migrateState, sanitizeJsonValue } from './migrations.js';
import { BackupPayloadSchema } from './schema.js';

export function exportBackupJson(state, nowIso = new Date().toISOString()) {
  const payload = {
    app: 'jawoo',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: nowIso,
    data: {
      settings: state.settings,
      tasks: state.tasks,
      habitsByDate: state.habitsByDate,
      studyProgress: state.studyProgress,
      quranProgress: state.quranProgress,
      focusSessions: state.focusSessions,
      alertLedger: state.alertLedger,
      customEvents: state.customEvents,
    },
  };
  return JSON.stringify(payload, null, 2);
}

export function parseAndValidateBackup(rawText) {
  if (typeof rawText !== 'string' || rawText.trim().length === 0) {
    return { ok: false, error: 'الملف فارغ أو لا يحتوي على نص JSON صالح.' };
  }
  if (rawText.length > 2_000_000) {
    return { ok: false, error: 'حجم ملف النسخة الاحتياطية يتجاوز الحد الآمن المسموح (٢ ميجابايت).' };
  }

  let parsed;
  try {
    parsed = sanitizeJsonValue(JSON.parse(rawText));
  } catch {
    return { ok: false, error: 'تعذر قراءة الملف: صيغة JSON غير صحيحة.' };
  }

  const check = BackupPayloadSchema.safeParse(parsed);
  if (!check.success) {
    return {
      ok: false,
      error: 'البيانات المستوردة لا تطابق بنية نسخة «جووو» المعتمدة.',
      details: check.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    };
  }

  const normalized = migrateState({
    schemaVersion: check.data.schemaVersion,
    ...check.data.data,
  });

  return {
    ok: true,
    exportedAt: check.data.exportedAt,
    summary: {
      tasksCount: normalized.tasks.length,
      habitDaysCount: Object.keys(normalized.habitsByDate).length,
      focusSessionsCount: normalized.focusSessions.length,
      customEventsCount: normalized.customEvents.length,
      backlogRemaining: normalized.studyProgress?.backlogRemaining ?? 9,
    },
    stateData: normalized,
  };
}

export function mergeRestoredBackup(currentState, validatedBackup) {
  return {
    ...validatedBackup.stateData,
    cache: currentState.cache || { prayerMonths: {}, weather: null },
    systemLog: currentState.systemLog || [],
  };
}
