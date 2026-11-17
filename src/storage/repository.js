import { APP_META, createInitialState } from '../data/defaults.js';
import { addDaysToDateKey, getZonedParts } from '../services/clock.js';
import { migrateState } from './migrations.js';

export function isLocalStorageAvailable(storage = globalThis.localStorage) {
  try {
    if (!storage) return false;
    const probeKey = '__jawoo_probe__';
    storage.setItem(probeKey, '1');
    const val = storage.getItem(probeKey);
    storage.removeItem(probeKey);
    return val === '1';
  } catch {
    return false;
  }
}

export function pruneEphemeralState(state, todayKey) {
  const cutoffKey = addDaysToDateKey(todayKey, -14);
  const nextLedger = {};
  for (const [k, entry] of Object.entries(state.alertLedger || {})) {
    if (entry?.dateKey && entry.dateKey >= cutoffKey) {
      nextLedger[k] = entry;
    }
  }

  // الاحتفاظ بآخر ٤ أشهر فقط في الذاكرة المؤقتة لمواقيت الصلاة لتفادي امتلاء localStorage
  const monthEntries = Object.entries(state.cache?.prayerMonths || {}).sort((a, b) =>
    b[0].localeCompare(a[0])
  );
  const nextMonths = Object.fromEntries(monthEntries.slice(0, 4));

  return {
    ...state,
    alertLedger: nextLedger,
    focusSessions: (state.focusSessions || []).slice(-200),
    systemLog: (state.systemLog || []).slice(-40),
    cache: {
      prayerMonths: nextMonths,
      weather: state.cache?.weather || null,
      timeDrift: state.cache?.timeDrift || null,
    },
  };
}

export function loadAppState(storage = globalThis.localStorage) {
  try {
    if (!isLocalStorageAvailable(storage)) {
      return {
        state: createInitialState(),
        storageAvailable: false,
        recoveredFromError: false,
      };
    }

    const raw = storage.getItem(APP_META.storageKey);
    if (!raw) {
      const initial = createInitialState();
      return {
        state: initial,
        storageAvailable: true,
        recoveredFromError: false,
      };
    }

    const parsed = JSON.parse(raw);
    const migrated = migrateState(parsed);
    const todayKey = getZonedParts(new Date(), migrated.settings.location.timezone).dateKey;
    return {
      state: pruneEphemeralState(migrated, todayKey),
      storageAvailable: true,
      recoveredFromError: false,
    };
  } catch {
    return {
      state: createInitialState(),
      storageAvailable: isLocalStorageAvailable(storage),
      recoveredFromError: true,
    };
  }
}

export function saveAppState(state, storage = globalThis.localStorage) {
  try {
    if (!isLocalStorageAvailable(storage)) {
      return { ok: false, reason: 'التخزين المحلي غير متاح في هذا المتصفح' };
    }
    const todayKey = getZonedParts(new Date(), state.settings?.location?.timezone || 'Africa/Cairo').dateKey;
    const pruned = pruneEphemeralState(state, todayKey);
    storage.setItem(APP_META.storageKey, JSON.stringify(pruned));
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      reason: err?.name === 'QuotaExceededError' ? 'امتلاء مساحة التخزين المحلي' : 'تعذر حفظ البيانات محلياً',
    };
  }
}
