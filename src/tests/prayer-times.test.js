import { describe, expect, it } from 'vitest';
import { createDefaultSettings } from '../data/defaults.js';
import { zonedDateTimeToTimestampMs } from '../services/clock.js';
import {
  buildPrayerCacheKey,
  computeLocalPrayerTimes,
  normalizeAlAdhanDay,
  resolvePrayerState,
} from '../services/prayer-times.js';

describe('prayer-times service', () => {
  it('normalizes AlAdhan timing strings stripping timezone labels', () => {
    const day = normalizeAlAdhanDay({
      Fajr: '04:51 (EET)',
      Sunrise: '06:21 (EET)',
      Dhuhr: '11:41 (EET)',
      Asr: '14:38 (EET)',
      Maghrib: '17:01 (EET)',
      Isha: '18:22 (EET)',
    });
    expect(day).toEqual({
      fajr: '04:51',
      shuruq: '06:21',
      dhuhr: '11:41',
      asr: '14:38',
      maghrib: '17:01',
      isha: '18:22',
    });
  });

  it('produces sensible local astronomical fallback times for Faqus', () => {
    const times = computeLocalPrayerTimes('2026-11-16', 30.7294, 31.8022, 'Africa/Cairo');
    expect(times.fajr < times.shuruq).toBe(true);
    expect(times.shuruq < times.dhuhr).toBe(true);
    expect(times.dhuhr < times.asr).toBe(true);
    expect(times.asr < times.maghrib).toBe(true);
    expect(times.maghrib < times.isha).toBe(true);
  });

  it('resolves next prayer, pre-adhan window, iqama window, and midnight rollover to tomorrow Fajr', () => {
    const settings = createDefaultSettings();
    const key = buildPrayerCacheKey(2026, 11, settings.location, settings.prayer.method);
    const cache = {
      prayerMonths: {
        [key]: {
          fetchedAt: new Date().toISOString(),
          source: 'AlAdhan API',
          days: {
            '2026-11-16': {
              fajr: '04:51',
              shuruq: '06:21',
              dhuhr: '11:41',
              asr: '14:38',
              maghrib: '17:01',
              isha: '18:22',
            },
            '2026-11-17': {
              fajr: '04:52',
              shuruq: '06:22',
              dhuhr: '11:41',
              asr: '14:38',
              maghrib: '17:00',
              isha: '18:21',
            },
          },
        },
      },
    };

    // 16:55 (6 دقائق قبل المغرب) -> تفعيل تنبيه ما قبل الأذان
    const beforeMaghribMs = zonedDateTimeToTimestampMs('2026-11-16', '16:55', 'Africa/Cairo');
    const preState = resolvePrayerState(beforeMaghribMs, settings, cache);
    expect(preState.nextPrayer.id).toBe('maghrib');
    expect(preState.nextPrayer.isTomorrow).toBe(false);
    expect(preState.preAdhanActive).toBe(true);
    expect(preState.activeIqama).toBeNull();

    // 17:05 (بعد أذان المغرب بـ 4 دقائق، ومدة الإقامة 10 دقائق) -> إقامة نشطة
    const duringIqamaMs = zonedDateTimeToTimestampMs('2026-11-16', '17:05', 'Africa/Cairo');
    const iqState = resolvePrayerState(duringIqamaMs, settings, cache);
    expect(iqState.activeIqama).not.toBeNull();
    expect(iqState.activeIqama.prayerId).toBe('maghrib');
    expect(iqState.nextPrayer.id).toBe('isha');

    // 20:00 (بعد العشاء) -> الصلاة القادمة هي فجر الغد
    const afterIshaMs = zonedDateTimeToTimestampMs('2026-11-16', '20:00', 'Africa/Cairo');
    const nightState = resolvePrayerState(afterIshaMs, settings, cache);
    expect(nightState.nextPrayer.id).toBe('fajr');
    expect(nightState.nextPrayer.isTomorrow).toBe(true);
    expect(nightState.nextPrayer.hhmm).toBe('04:52');
  });
});
