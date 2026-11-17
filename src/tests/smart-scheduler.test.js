import { describe, expect, it } from 'vitest';
import { createDefaultSettings, createDefaultStudyProgress } from '../data/defaults.js';
import { DEFAULT_WEEKLY_SCHEDULE } from '../data/study-schedule.js';
import { zonedDateTimeToTimestampMs } from '../services/clock.js';
import { buildPrayerCacheKey } from '../services/prayer-times.js';
import {
  computeWeeklyStudyStats,
  resolveBlockStageFromElapsed,
  resolveDailyStudyPlan,
  toggleStudyBlockCompletion,
} from '../services/smart-scheduler.js';

function makePrayerCache(settings, dateKey, timings) {
  const [y, m] = dateKey.split('-').map(Number);
  const key = buildPrayerCacheKey(y, m, settings.location, settings.prayer.method);
  return {
    prayerMonths: {
      [key]: {
        fetchedAt: new Date().toISOString(),
        source: 'Test Fixture',
        days: { [dateKey]: timings },
      },
    },
  };
}

describe('smart study schedule & prayer auto-shifting', () => {
  it('defines exact 7-day weekly timetable (~12 hours/week) including Saturday big backlog & Friday weekly review', () => {
    let totalWeeklyMinutes = 0;
    for (let wd = 0; wd < 7; wd += 1) {
      for (const b of DEFAULT_WEEKLY_SCHEDULE[wd].blocks) {
        if (!b.isFreeRest) totalWeeklyMinutes += b.durationMinutes;
      }
    }
    // 4 أيام (أحد-أربعاء × 105د) + خميس 80د + جمعة 30د + سبت 185د = 715 دقيقة (11 ساعة و55 دقيقة ≈ 12 ساعة أسبوعياً)
    expect(totalWeeklyMinutes).toBe(715);
    expect(DEFAULT_WEEKLY_SCHEDULE[6].blocks).toHaveLength(5); // ٤ بلوكات مراكم + مراجعة المساء
    expect(DEFAULT_WEEKLY_SCHEDULE[5].blocks).toHaveLength(1); // مراجعة أسبوعية ٣٠ دقيقة فقط
    expect(DEFAULT_WEEKLY_SCHEDULE[4].blocks[2].isFreeRest).toBe(true); // ليلة حرة الخميس
  });

  it('decrements backlog counter from 9 when marking a [مراكم] block done and supports swapping Block 1 & 2', () => {
    const settings = createDefaultSettings();
    let progress = createDefaultStudyProgress();
    const mondayMs = zonedDateTimeToTimestampMs('2026-11-16', '12:00', 'Africa/Cairo'); // الاثنين
    const cache = makePrayerCache(settings, '2026-11-16', {
      fajr: '04:51', shuruq: '06:21', dhuhr: '11:41', asr: '14:38', maghrib: '18:30', isha: '19:45',
    });

    const planNormal = resolveDailyStudyPlan({ nowMs: mondayMs, settings, studyProgress: progress, cache });
    expect(planNormal.dayName).toBe('الاثنين');
    expect(planNormal.blocks[0].subject).toBe('إنجليزي');
    expect(planNormal.blocks[0].tag).toBe('جديد');
    expect(planNormal.blocks[1].subject).toBe('تاريخ');
    expect(planNormal.blocks[1].tag).toBe('مراكم');

    // تبديل البلوكين
    progress = { ...progress, swappedDates: { '2026-11-16': true } };
    const planSwapped = resolveDailyStudyPlan({ nowMs: mondayMs, settings, studyProgress: progress, cache });
    expect(planSwapped.blocks[0].subject).toBe('تاريخ');
    expect(planSwapped.blocks[0].tag).toBe('مراكم');
    expect(planSwapped.blocks[1].subject).toBe('إنجليزي');

    // تعليم بلوك المراكم منجز -> ينقص العداد من 9 إلى 8
    const toggled = toggleStudyBlockCompletion(progress, '2026-11-16', planSwapped.blocks[0]);
    expect(toggled.backlogDecremented).toBe(true);
    expect(toggled.backlogRemaining).toBe(8);

    const stats = computeWeeklyStudyStats(toggled.studyProgress, '2026-11-16', settings);
    expect(stats.completedMinutes).toBe(40);
    expect(stats.backlogRemaining).toBe(8);
  });

  it('auto-shifts Block 1 & Block 2 when winter Maghrib prayer intersects 16:30–17:10 and triggers active pause', () => {
    const settings = createDefaultSettings();
    const progress = createDefaultStudyProgress();
    // المغرب الساعة 16:55 أثناء بلوك 1 (16:30–17:10)، ومدة إقامة المغرب 10 + 5 بعد + 2 قبل = 17 دقيقة (16:53 إلى 17:10)
    const duringMaghribMs = zonedDateTimeToTimestampMs('2026-11-16', '16:58', 'Africa/Cairo');
    const cache = makePrayerCache(settings, '2026-11-16', {
      fajr: '04:51', shuruq: '06:21', dhuhr: '11:41', asr: '14:38', maghrib: '16:55', isha: '18:22',
    });

    const plan = resolveDailyStudyPlan({ nowMs: duringMaghribMs, settings, studyProgress: progress, cache });
    const b1 = plan.blocks[0];
    const b2 = plan.blocks[1];

    expect(b1.wasShifted).toBe(true);
    expect(b1.endTime).toBe('17:27'); // تمدد 17 دقيقة بعد 17:10
    expect(b2.wasShifted).toBe(true);
    expect(b2.startTime).toBe('17:37'); // أُزيح البلوك الثاني 17 دقيقة بعد 17:20
    expect(plan.activePrayerPause).not.toBeNull();
    expect(plan.activePrayerPause.prayerId).toBe('maghrib');
    expect(plan.activePrayerPause.message).toContain('توقف مؤقت لصلاة المغرب');

    // تجاوز الإزاحة يدوياً يعيد المواعيد الأصلية
    const overriddenProgress = { ...progress, overrideShiftDates: { '2026-11-16': true } };
    const overriddenPlan = resolveDailyStudyPlan({
      nowMs: duringMaghribMs, settings, studyProgress: overriddenProgress, cache,
    });
    expect(overriddenPlan.blocks[0].endTime).toBe('17:10');
    expect(overriddenPlan.activePrayerPause).toBeNull();
  });

  it('activates Ramadan mode window shifting and Eid holiday rest mode automatically', () => {
    const settings = createDefaultSettings();
    settings.study.ramadanMode = 'on';
    settings.study.ramadanWindow = 'after_taraweeh';
    const progress = createDefaultStudyProgress();
    const regularMs = zonedDateTimeToTimestampMs('2026-11-16', '12:00', 'Africa/Cairo');
    const cache = makePrayerCache(settings, '2026-11-16', {
      fajr: '04:51', shuruq: '06:21', dhuhr: '11:41', asr: '14:38', maghrib: '17:01', isha: '18:22',
    });

    const ramadanPlan = resolveDailyStudyPlan({ nowMs: regularMs, settings, studyProgress: progress, cache });
    expect(ramadanPlan.ramadanActive).toBe(true);
    expect(ramadanPlan.blocks[0].startTime >= '20:00').toBe(true);

    // يوم عيد الفطر (محاكاة عبر customEvents أو مطابقة اليوم الهجري 1 شوال)
    const eidSettings = createDefaultSettings();
    const eidPlan = resolveDailyStudyPlan({
      nowMs: regularMs,
      settings: eidSettings,
      studyProgress: progress,
      cache,
      customEvents: [
        { id: 'eid-fitr-1', title: 'عيد الفطر المبارك', dateKey: '2026-11-16', category: 'عيد', isEstimated: false },
      ],
    });
    expect(eidPlan.holidayStatus).toBe('eid');
    expect(eidPlan.holidayMessage).toContain('إجازة عيد سعيد');
    expect(eidPlan.blocks).toHaveLength(0);
  });

  it('resolves exact internal stages for 40m study block (5/30/5) and 25m evening review (10/10/5)', () => {
    expect(resolveBlockStageFromElapsed('study_block', 2 * 60000, 40).stage.id).toBe('recall');
    expect(resolveBlockStageFromElapsed('study_block', 10 * 60000, 40).stage.id).toBe('deep_focus');
    expect(resolveBlockStageFromElapsed('study_block', 37 * 60000, 40).stage.id).toBe('summary');

    expect(resolveBlockStageFromElapsed('evening_review', 4 * 60000, 25).stage.id).toBe('review_today');
    expect(resolveBlockStageFromElapsed('evening_review', 14 * 60000, 25).stage.id).toBe('review_3days');
    expect(resolveBlockStageFromElapsed('evening_review', 22 * 60000, 25).stage.id).toBe('review_week');

    expect(resolveBlockStageFromElapsed('break', 3 * 60000, 10).stage.id).toBe('break');
  });
});
