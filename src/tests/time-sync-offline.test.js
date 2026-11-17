import { describe, expect, it } from 'vitest';
import { createDefaultSettings } from '../data/defaults.js';
import { getDailyContentForDateKey } from '../data/religious-content.js';
import { getDayOfYear, zonedDateTimeToTimestampMs } from '../services/clock.js';
import { evaluateActiveAlerts } from '../services/notifications.js';
import { computeLocalPrayerTimes, getPrayerTimesForDate } from '../services/prayer-times.js';
import {
  computeDriftFromServerTime,
  getAccurateNowMs,
  validateDeviceClockSanity,
} from '../services/time-sync.js';
import { getWeatherSnapshot } from '../services/weather.js';

describe('hybrid online/offline resilience & time drift', () => {
  it('computes accurate time drift offset and detects manual clock rollback sanity', () => {
    // لنفترض أن ساعة التلفاز متأخرة ساعة كاملة (+3600 ثانية فرق)
    const deviceNow = 1794840000000;
    const serverNow = deviceNow + 3600000;
    const drift = computeDriftFromServerTime(serverNow, deviceNow - 50, deviceNow, 'WorldTimeAPI');
    expect(drift.offsetMs).toBe(3600025);

    const acc = getAccurateNowMs(drift, deviceNow + 10000);
    expect(acc.driftReset).toBe(false);
    expect(acc.nowMs).toBe(deviceNow + 10000 + drift.offsetMs);

    // إذا تم تعديل ساعة الجهاز للخلف مقارنة بآخر وقت دقيق موثوق -> إعادة ضبط آمنة
    const broken = validateDeviceClockSanity(drift, deviceNow - 5000000);
    expect(broken.valid).toBe(false);
    expect(broken.offsetMs).toBe(0);
  });

  it('falls back seamlessly to built-in adhan astronomical calculation for Faqus across summer DST and winter offline', () => {
    const settings = createDefaultSettings();
    const emptyCache = { prayerMonths: {} };

    // شتاء (16 نوفمبر)
    const winterRes = getPrayerTimesForDate('2026-11-16', settings, emptyCache);
    expect(winterRes.isFallbackEstimate).toBe(true);
    expect(winterRes.source).toContain('adhan');
    expect(winterRes.timings.fajr < winterRes.timings.dhuhr).toBe(true);
    expect(winterRes.timings.maghrib < winterRes.timings.isha).toBe(true);

    // صيف (15 يوليو — التوقيت الصيفي في مصر UTC+3)
    const summerTimings = computeLocalPrayerTimes('2026-07-15', 30.7303, 31.7936, 'Africa/Cairo', 5);
    expect(summerTimings.dhuhr >= '12:50').toBe(true); // الظهر بعد 12:50 صيفاً بسبب التوقيت الصيفي
    expect(summerTimings.maghrib >= '18:50').toBe(true);
  });

  it('marks cached weather as expired beyond 6 hours so local study summary takes over', () => {
    const nowMs = Date.UTC(2026, 10, 16, 18, 0, 0);
    const freshSnap = getWeatherSnapshot(
      { weather: { temperature: 24, descriptionAr: 'صافية', fetchedAt: new Date(nowMs - 60 * 60000).toISOString() } },
      nowMs
    );
    expect(freshSnap.expiredBeyondSixHours).toBe(false);

    const expiredSnap = getWeatherSnapshot(
      { weather: { temperature: 24, descriptionAr: 'صافية', fetchedAt: new Date(nowMs - 7 * 3600000).toISOString() } },
      nowMs
    );
    expect(expiredSnap.expiredBeyondSixHours).toBe(true);
  });

  it('rotates daily Quran, Hadith, and English vocabulary offline by Day of Year', () => {
    const d1 = getDayOfYear('2026-01-01');
    const d2 = getDayOfYear('2026-01-02');
    expect(d1).toBe(1);
    expect(d2).toBe(2);

    const c1 = getDailyContentForDateKey('2026-01-01');
    const c2 = getDailyContentForDateKey('2026-01-02');
    expect(c1.verse.id).not.toBe(c2.verse.id);
    expect(c1.hadith.source).toContain('صحيح');
    expect(c1.words).toHaveLength(3);
    expect(c1.words[0].example).toBeTruthy();
  });

  it('triggers daily 22:00 phone-outside-room and 22:30 sleep discipline alerts', () => {
    const settings = createDefaultSettings();
    const at2205Ms = zonedDateTimeToTimestampMs('2026-11-16', '22:05', 'Africa/Cairo');
    const eval2205 = evaluateActiveAlerts({ nowMs: at2205Ms, prayerState: null, settings, tasks: [], alertLedger: {} });
    expect(eval2205.activeAlerts.some((a) => a.title.includes('إبعاد الموبايل'))).toBe(true);

    const at2235Ms = zonedDateTimeToTimestampMs('2026-11-16', '22:35', 'Africa/Cairo');
    const eval2235 = evaluateActiveAlerts({ nowMs: at2235Ms, prayerState: null, settings, tasks: [], alertLedger: {} });
    expect(eval2235.inQuietHours).toBe(true);
    expect(eval2235.activeAlerts.some((a) => a.title.includes('النوم أولاً'))).toBe(true);
  });
});
