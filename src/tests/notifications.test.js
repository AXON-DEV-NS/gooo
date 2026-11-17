import { describe, expect, it } from 'vitest';
import { createDefaultSettings } from '../data/defaults.js';
import { zonedDateTimeToTimestampMs } from '../services/clock.js';
import { evaluateActiveAlerts } from '../services/notifications.js';
import { buildPrayerCacheKey, resolvePrayerState } from '../services/prayer-times.js';

function makePrayerFixture(settings) {
  const key = buildPrayerCacheKey(2026, 11, settings.location, settings.prayer.method);
  return {
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
}

describe('notifications engine', () => {
  it('prevents duplicate alert audio/triggering across page reloads via alertLedger', () => {
    const settings = createDefaultSettings();
    const cache = makePrayerFixture(settings);
    const nowMs = zonedDateTimeToTimestampMs('2026-11-16', '17:01', 'Africa/Cairo');
    const prayerState = resolvePrayerState(nowMs, settings, cache);

    const firstEval = evaluateActiveAlerts({
      nowMs,
      prayerState,
      settings,
      tasks: [],
      alertLedger: {},
    });
    expect(firstEval.newlyTriggered.some((a) => a.id === 'adhan-2026-11-16-maghrib')).toBe(true);

    // بعد تسجيل التنبيه في السجل وإعادة التقييم (محاكاة إعادة تحميل الصفحة)
    const ledgerAfterShown = {
      'adhan-2026-11-16-maghrib': {
        dateKey: '2026-11-16',
        status: 'shown',
        updatedAt: new Date(nowMs).toISOString(),
      },
    };
    const reloadEval = evaluateActiveAlerts({
      nowMs: nowMs + 15000,
      prayerState,
      settings,
      tasks: [],
      alertLedger: ledgerAfterShown,
    });
    expect(reloadEval.newlyTriggered.some((a) => a.id === 'adhan-2026-11-16-maghrib')).toBe(false);

    // بعد التجاهل لا يظهر إطلاقاً
    const dismissedEval = evaluateActiveAlerts({
      nowMs: nowMs + 20000,
      prayerState,
      settings,
      tasks: [],
      alertLedger: {
        'adhan-2026-11-16-maghrib': {
          dateKey: '2026-11-16',
          status: 'dismissed',
          updatedAt: new Date(nowMs).toISOString(),
        },
      },
    });
    expect(dismissedEval.activeAlerts.some((a) => a.id === 'adhan-2026-11-16-maghrib')).toBe(false);
  });

  it('suppresses non-critical care and task alerts during quiet hours', () => {
    const settings = createDefaultSettings();
    settings.alerts.quietHoursEnabled = true;
    settings.alerts.quietStart = '22:30';
    settings.alerts.quietEnd = '04:00';
    const cache = makePrayerFixture(settings);

    const lateNightMs = zonedDateTimeToTimestampMs('2026-11-16', '23:15', 'Africa/Cairo');
    const prayerState = resolvePrayerState(lateNightMs, settings, cache);
    const res = evaluateActiveAlerts({
      nowMs: lateNightMs,
      prayerState,
      settings,
      tasks: [
        {
          id: 't1',
          title: 'مذاكرة متأخرة',
          startTime: '23:10',
          endTime: '23:50',
          status: 'pending',
        },
      ],
      alertLedger: {},
    });

    expect(res.inQuietHours).toBe(true);
    expect(res.activeAlerts.some((a) => a.type === 'care')).toBe(false);
    expect(res.activeAlerts.some((a) => a.type === 'task')).toBe(false);
  });
});
