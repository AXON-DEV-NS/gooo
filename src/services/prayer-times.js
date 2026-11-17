import { CalculationMethod, Coordinates, Madhab, PrayerTimes } from 'adhan';
import {
  OBLIGATORY_PRAYER_IDS,
  PRAYER_IDS,
  PRAYER_LABELS,
} from '../data/defaults.js';
import {
  addDaysToDateKey,
  computeRemainingMs,
  getZonedParts,
  pad2,
  zonedDateTimeToTimestampMs,
} from './clock.js';

const ALADHAN_BASE = 'https://api.aladhan.com/v1';

function extractHHMM(raw) {
  const match = String(raw || '').match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (!Number.isInteger(hh) || !Number.isInteger(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) {
    return null;
  }
  return `${pad2(hh)}:${pad2(mm)}`;
}

export function buildPrayerCacheKey(year, month, location, method) {
  const lat = Number(location.lat).toFixed(3);
  const lng = Number(location.lng).toFixed(3);
  return `${year}-${pad2(month)}@${lat},${lng}#m${method}`;
}

function getAdhanParamsForMethod(method = 5) {
  let params;
  switch (Number(method)) {
    case 4:
      params = CalculationMethod.UmmAlQura();
      break;
    case 3:
      params = CalculationMethod.MuslimWorldLeague();
      break;
    case 2:
      params = CalculationMethod.NorthAmerica();
      break;
    case 1:
      params = CalculationMethod.Karachi();
      break;
    case 5:
    default:
      params = CalculationMethod.Egyptian();
      break;
  }
  params.madhab = Madhab.Shafi;
  return params;
}

/**
 * حساب فلكي محلي مدمج عبر مكتبة adhan مضبوطة على إحداثيات فاقوس (أو الموقع المختار)
 * وطريقة الهيئة المصرية العامة للمساحة، يعمل للأبد عند انقطاع الإنترنت.
 */
export function computeLocalPrayerTimes(
  dateKey,
  lat = 30.7303,
  lng = 31.7936,
  timeZone = 'Africa/Cairo',
  method = 5
) {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  const coordinates = new Coordinates(Number(lat), Number(lng));
  const params = getAdhanParamsForMethod(method);
  const dateObj = new Date(year, month - 1, day);
  const pt = new PrayerTimes(coordinates, dateObj, params);

  const fmt = (dt) => {
    const p = getZonedParts(dt, timeZone);
    return `${pad2(p.hour)}:${pad2(p.minute)}`;
  };

  return {
    fajr: fmt(pt.fajr),
    shuruq: fmt(pt.sunrise),
    dhuhr: fmt(pt.dhuhr),
    asr: fmt(pt.asr),
    maghrib: fmt(pt.maghrib),
    isha: fmt(pt.isha),
  };
}

export function normalizeAlAdhanDay(timings) {
  return {
    fajr: extractHHMM(timings?.Fajr),
    shuruq: extractHHMM(timings?.Sunrise),
    dhuhr: extractHHMM(timings?.Dhuhr),
    asr: extractHHMM(timings?.Asr),
    maghrib: extractHHMM(timings?.Maghrib),
    isha: extractHHMM(timings?.Isha),
  };
}

export async function fetchMonthlyPrayerTimes(year, month, location, method = 5, timeoutMs = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url =
      `${ALADHAN_BASE}/calendar/${year}/${month}` +
      `?latitude=${encodeURIComponent(location.lat)}` +
      `&longitude=${encodeURIComponent(location.lng)}` +
      `&method=${encodeURIComponent(method)}` +
      `&timezonestring=${encodeURIComponent(location.timezone || 'Africa/Cairo')}`;

    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const payload = await res.json();
    if (!payload || !Array.isArray(payload.data)) {
      throw new Error('صيغة استجابة غير صالحة من خدمة المواقيت');
    }

    const days = {};
    for (const entry of payload.data) {
      const greg = entry?.date?.gregorian?.date; // DD-MM-YYYY
      if (!greg) continue;
      const [dd, mm, yyyy] = greg.split('-');
      const dateKey = `${yyyy}-${mm}-${dd}`;
      const normalized = normalizeAlAdhanDay(entry.timings);
      if (PRAYER_IDS.every((id) => Boolean(normalized[id]))) {
        days[dateKey] = normalized;
      }
    }

    return {
      fetchedAt: new Date().toISOString(),
      source: 'AlAdhan API (الهيئة المصرية للمساحة)',
      method,
      days,
    };
  } finally {
    clearTimeout(timer);
  }
}

export function getPrayerTimesForDate(dateKey, settings, cache, nowMs = Date.now()) {
  const [year, month] = String(dateKey).split('-').map(Number);
  const key = buildPrayerCacheKey(year, month, settings.location, settings.prayer.method);
  const monthCache = cache?.prayerMonths?.[key];

  if (monthCache && monthCache.days && monthCache.days[dateKey]) {
    const ageHours = (nowMs - new Date(monthCache.fetchedAt).getTime()) / 3600000;
    return {
      dateKey,
      timings: monthCache.days[dateKey],
      source: monthCache.source || 'بيانات محفوظة',
      fetchedAt: monthCache.fetchedAt,
      isCached: true,
      isStale: !Number.isFinite(ageHours) || ageHours > 24 * 7,
      isFallbackEstimate: false,
    };
  }

  return {
    dateKey,
    timings: computeLocalPrayerTimes(
      dateKey,
      settings.location.lat,
      settings.location.lng,
      settings.location.timezone,
      settings.prayer.method
    ),
    source: 'الحساب الفلكي المحلي المدمج (adhan — الهيئة المصرية)',
    fetchedAt: null,
    isCached: false,
    isStale: false,
    isFallbackEstimate: true,
  };
}

/**
 * تحديد الصلاة الحالية، الصلاة القادمة، العداد الحقيقي، ومرحلة الإقامة أو ما قبل الأذان.
 */
export function resolvePrayerState(nowMs, settings, cache) {
  const tz = settings.location.timezone || 'Africa/Cairo';
  const nowParts = getZonedParts(new Date(nowMs), tz);
  const todayKey = nowParts.dateKey;
  const tomorrowKey = addDaysToDateKey(todayKey, 1);

  const todayData = getPrayerTimesForDate(todayKey, settings, cache, nowMs);
  const tomorrowData = getPrayerTimesForDate(tomorrowKey, settings, cache, nowMs);

  const todayList = PRAYER_IDS.map((id) => {
    const hhmm = todayData.timings[id];
    const targetMs = zonedDateTimeToTimestampMs(todayKey, hhmm, tz);
    return {
      id,
      label: PRAYER_LABELS[id],
      hhmm,
      targetMs,
      isObligatory: OBLIGATORY_PRAYER_IDS.includes(id),
    };
  });

  // فحص هل نحن الآن في نافذة الإقامة لصلاة فرضت لتوها
  let activeIqama = null;
  if (settings.prayer.iqamaEnabled) {
    for (let i = todayList.length - 1; i >= 0; i -= 1) {
      const p = todayList[i];
      if (!p.isObligatory) continue;
      if (settings.prayer.iqamaEnabledByPrayer?.[p.id] === false) continue;
      const iqamaMins = Number(settings.prayer.iqamaMinutes?.[p.id] || 0);
      if (iqamaMins <= 0) continue;
      const iqamaEndMs = p.targetMs + iqamaMins * 60000;
      if (nowMs >= p.targetMs && nowMs < iqamaEndMs) {
        activeIqama = {
          prayerId: p.id,
          label: p.label,
          prayerMs: p.targetMs,
          endsAtMs: iqamaEndMs,
          remainingMs: computeRemainingMs(iqamaEndMs, nowMs),
          durationMinutes: iqamaMins,
        };
        break;
      }
    }
  }

  // تحديد الصلاة القادمة (أو فجر الغد إذا مضت صلاة العشاء)
  let nextPrayer = todayList.find((p) => p.targetMs > nowMs);
  let isTomorrow = false;

  if (!nextPrayer) {
    const tomorrowFajrHHMM = tomorrowData.timings.fajr;
    const tomorrowFajrMs = zonedDateTimeToTimestampMs(tomorrowKey, tomorrowFajrHHMM, tz);
    nextPrayer = {
      id: 'fajr',
      label: PRAYER_LABELS.fajr,
      hhmm: tomorrowFajrHHMM,
      targetMs: tomorrowFajrMs,
      isObligatory: true,
    };
    isTomorrow = true;
  }

  const remainingMs = computeRemainingMs(nextPrayer.targetMs, nowMs);
  const preAdhanMs = Math.max(0, Number(settings.prayer.preAdhanMinutes || 0)) * 60000;
  const preAdhanActive =
    nextPrayer.isObligatory && preAdhanMs > 0 && remainingMs > 0 && remainingMs <= preAdhanMs;

  // تحديد آخر صلاة مضت لتمييزها بصرياً في جدول الصلوات
  let currentPrayerId = null;
  for (let i = todayList.length - 1; i >= 0; i -= 1) {
    if (nowMs >= todayList[i].targetMs) {
      currentPrayerId = todayList[i].id;
      break;
    }
  }

  return {
    todayKey,
    todayData,
    todayList,
    currentPrayerId,
    nextPrayer: {
      ...nextPrayer,
      isTomorrow,
      remainingMs,
    },
    preAdhanActive,
    activeIqama,
  };
}
