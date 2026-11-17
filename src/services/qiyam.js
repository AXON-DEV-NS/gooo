import {
  addDaysToDateKey,
  getZonedParts,
  pad2,
  zonedDateTimeToTimestampMs,
} from './clock.js';
import { getPrayerTimesForDate } from './prayer-times.js';

export const QIYAM_HADITH = Object.freeze({
  text: 'ينزل ربنا تبارك وتعالى كل ليلة إلى السماء الدنيا حين يبقى ثلث الليل الآخر يقول: من يدعوني فأستجيب له، من يسألني فأعطيه، من يستغفرني فأغفر له.',
  narrator: 'أبو هريرة رضي الله عنه',
  source: 'متفق عليه — صحيح البخاري (رقم ١١٤٥) وصحيح مسلم (رقم ٧٥٨)',
  grade: 'صحيح',
});

/**
 * حساب بداية الثلث الأخير من الليل فلكياً:
 * الثلث الأخير = وقت المغرب + ثلثا المدة بين المغرب والفجر التالي.
 */
export function computeQiyamNightTimes(nowMs, settings, cache) {
  const tz = settings?.location?.timezone || 'Africa/Cairo';
  const parts = getZonedParts(new Date(nowMs), tz);
  const todayKey = parts.dateKey;

  // قبل الفجر (بعد منتصف الليل): الليلة بدأت من مغرب الأمس إلى فجر اليوم
  const todayTimes = getPrayerTimesForDate(todayKey, settings, cache, nowMs).timings;
  const todayFajrMs = zonedDateTimeToTimestampMs(todayKey, todayTimes.fajr, tz);

  let nightDateKey = todayKey;
  let maghribMs;
  let fajrMs;

  if (nowMs < todayFajrMs) {
    const yesterdayKey = addDaysToDateKey(todayKey, -1);
    const yesterdayTimes = getPrayerTimesForDate(yesterdayKey, settings, cache, nowMs).timings;
    nightDateKey = yesterdayKey;
    maghribMs = zonedDateTimeToTimestampMs(yesterdayKey, yesterdayTimes.maghrib, tz);
    fajrMs = todayFajrMs;
  } else {
    const tomorrowKey = addDaysToDateKey(todayKey, 1);
    const tomorrowTimes = getPrayerTimesForDate(tomorrowKey, settings, cache, nowMs).timings;
    maghribMs = zonedDateTimeToTimestampMs(todayKey, todayTimes.maghrib, tz);
    fajrMs = zonedDateTimeToTimestampMs(tomorrowKey, tomorrowTimes.fajr, tz);
  }

  const nightDurationMs = Math.max(3600000, fajrMs - maghribMs);
  const lastThirdStartMs = maghribMs + Math.round((2 * nightDurationMs) / 3);

  const qiyamMode = settings?.qiyam?.mode || 'last_third';
  const beforeMins = Math.max(10, Number(settings?.qiyam?.beforeFajrMinutes || 45));
  const reminderTargetMs =
    qiyamMode === 'before_fajr' ? fajrMs - beforeMins * 60000 : lastThirdStartMs;

  const lastThirdParts = getZonedParts(new Date(lastThirdStartMs), tz);
  const reminderParts = getZonedParts(new Date(reminderTargetMs), tz);
  const fajrParts = getZonedParts(new Date(fajrMs), tz);

  return {
    nightDateKey,
    maghribMs,
    fajrMs,
    lastThirdStartMs,
    reminderTargetMs,
    lastThirdHHMM: `${pad2(lastThirdParts.hour)}:${pad2(lastThirdParts.minute)}`,
    reminderHHMM: `${pad2(reminderParts.hour)}:${pad2(reminderParts.minute)}`,
    fajrHHMM: `${pad2(fajrParts.hour)}:${pad2(fajrParts.minute)}`,
  };
}
