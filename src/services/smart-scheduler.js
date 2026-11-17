import { PRAYER_LABELS } from '../data/defaults.js';
import {
  DEFAULT_WEEKLY_SCHEDULE,
  getGuideForSubject,
  getStagesForBlockKind,
} from '../data/study-schedule.js';
import { getDayOccasionContext } from './calendar.js';
import {
  addDaysToDateKey,
  formatTime24FromMinutes,
  getWeekStartDateKey,
  getZonedParts,
  parseHHMMToMinutes,
  toArabicDigits,
  zonedDateTimeToTimestampMs,
} from './clock.js';
import { getPrayerTimesForDate } from './prayer-times.js';

const OBLIGATORY_IDS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

export function buildPrayerWindowsForDay(timings, settings) {
  if (!timings) return [];
  const pauseBefore = Math.max(0, Number(settings?.study?.prayerPauseBeforeMinutes ?? 2));
  const resumeAfter = Math.max(0, Number(settings?.study?.prayerResumeAfterMinutes ?? 5));

  return OBLIGATORY_IDS.map((pid) => {
    const adhanMin = parseHHMMToMinutes(timings[pid]);
    if (adhanMin === null) return null;
    const iqamaEnabled =
      settings?.prayer?.iqamaEnabled !== false &&
      settings?.prayer?.iqamaEnabledByPrayer?.[pid] !== false;
    const iqamaMin = iqamaEnabled ? Number(settings?.prayer?.iqamaMinutes?.[pid] ?? 15) : 15;

    const startMin = adhanMin - pauseBefore;
    const endMin = adhanMin + iqamaMin + resumeAfter;
    return {
      prayerId: pid,
      label: PRAYER_LABELS[pid],
      adhanMin,
      startMin,
      endMin,
      durationMinutes: endMin - startMin,
      startHHMM: formatTime24FromMinutes(startMin),
      endHHMM: formatTime24FromMinutes(endMin),
    };
  }).filter(Boolean);
}

export function getRawDayBlocks(weekdayIndex, settings, studyProgress, dateKey) {
  const customDay = settings?.study?.customBlocksByDay?.[String(weekdayIndex)];
  const baseDay = DEFAULT_WEEKLY_SCHEDULE[weekdayIndex] || DEFAULT_WEEKLY_SCHEDULE[0];
  const sourceBlocks = Array.isArray(customDay) && customDay.length > 0 ? customDay : baseDay.blocks;

  const weakest = settings?.study?.weakestSubject || 'عربي';
  const cloned = sourceBlocks.map((b) => ({
    ...b,
    subject: b.subject === 'مرن' ? weakest : b.subject,
    originalStartTime: b.startTime,
    originalEndTime: b.endTime,
  }));

  // تبديل ترتيب البلوكين (١ و ٢) إذا فعّله المستخدم لهذا اليوم
  if (studyProgress?.swappedDates?.[dateKey]) {
    const studyIndices = [];
    cloned.forEach((b, idx) => {
      if (b.kind === 'study_block') studyIndices.push(idx);
    });
    if (studyIndices.length >= 2) {
      const i1 = studyIndices[0];
      const i2 = studyIndices[1];
      const b1 = cloned[i1];
      const b2 = cloned[i2];
      cloned[i1] = {
        ...b1,
        subject: b2.subject,
        tag: b2.tag,
        isFlexibleWeakest: b2.isFlexibleWeakest,
      };
      cloned[i2] = {
        ...b2,
        subject: b1.subject,
        tag: b1.tag,
        isFlexibleWeakest: b1.isFlexibleWeakest,
      };
    }
  }

  return cloned;
}

function applyRamadanWindowShift(blocks, prayerTimings, ramadanWindow) {
  const ishaMin = parseHHMMToMinutes(prayerTimings?.isha) ?? 18 * 60 + 30;
  const fajrMin = parseHHMMToMinutes(prayerTimings?.fajr) ?? 4 * 60 + 30;

  let nextAfternoonStart =
    ramadanWindow === 'before_fajr'
      ? Math.max(60, fajrMin - 120) // ينتهي قبل السحور والفجر
      : Math.max(ishaMin + 55, 20 * 60 + 15); // بعد التراويح

  let eveningShiftedStart =
    ramadanWindow === 'before_fajr'
      ? Math.max(ishaMin + 55, 20 * 60 + 30)
      : nextAfternoonStart + 100;

  return blocks.map((b) => {
    const dur = Number(b.durationMinutes || 40);
    if (b.cluster === 'afternoon' && (b.kind === 'study_block' || b.kind === 'weekly_review')) {
      const startMin = nextAfternoonStart;
      const endMin = startMin + dur;
      nextAfternoonStart = endMin + 10;
      return {
        ...b,
        startTime: formatTime24FromMinutes(startMin),
        endTime: formatTime24FromMinutes(endMin),
        ramadanShifted: true,
        shiftReason: ramadanWindow === 'before_fajr' ? 'وضع رمضان (قبل الفجر)' : 'وضع رمضان (بعد التراويح)',
      };
    }
    if (b.cluster === 'evening' && b.kind === 'evening_review') {
      const startMin = eveningShiftedStart;
      const endMin = startMin + dur;
      return {
        ...b,
        startTime: formatTime24FromMinutes(startMin),
        endTime: formatTime24FromMinutes(endMin),
        ramadanShifted: true,
        shiftReason: 'وضع رمضان الدراسي',
      };
    }
    return b;
  });
}

export function applyPrayerAutoShift(blocks, prayerWindows, enabled = true) {
  if (!enabled || !prayerWindows || prayerWindows.length === 0) {
    return blocks.map((b) => ({
      ...b,
      wasShifted: Boolean(b.ramadanShifted),
      intersections: [],
    }));
  }

  const carryByCluster = { morning: 0, afternoon: 0, evening: 0 };

  return blocks.map((b) => {
    const cluster = b.cluster || 'afternoon';
    let startMin = parseHHMMToMinutes(b.startTime) ?? 0;
    let endMin = parseHHMMToMinutes(b.endTime) ?? startMin + Number(b.durationMinutes || 40);
    const intersections = [];
    const shiftReasons = b.shiftReason ? [b.shiftReason] : [];

    if (carryByCluster[cluster] > 0) {
      startMin += carryByCluster[cluster];
      endMin += carryByCluster[cluster];
    }

    for (const pw of prayerWindows) {
      // تداخل إذا تقاطعت نافذة الصلاة مع وقت البلوك
      if (pw.startMin < endMin && pw.endMin > startMin) {
        if (pw.startMin <= startMin) {
          // الصلاة تبدأ قبل أو عند بداية البلوك -> يبدأ البلوك بعد انتهاء الصلاة
          const delta = pw.endMin - startMin;
          startMin += delta;
          endMin += delta;
          carryByCluster[cluster] += delta;
          intersections.push({
            ...pw,
            mode: 'delayed_start',
            shiftMinutes: delta,
          });
          shiftReasons.push(`تأجيل ${toArabicDigits(delta)} د لصلاة ${pw.label}`);
        } else {
          // الصلاة تقع في منتصف البلوك -> يتوقف البلوك مؤقتاً وتُمدد نهايته ويزاح البلوك التالي
          const pauseSpan = pw.endMin - pw.startMin;
          endMin += pauseSpan;
          carryByCluster[cluster] += pauseSpan;
          intersections.push({
            ...pw,
            mode: 'mid_block_pause',
            shiftMinutes: pauseSpan,
          });
          shiftReasons.push(`إزاحة ${toArabicDigits(pauseSpan)} د لصلاة ${pw.label}`);
        }
      }
    }

    const nextStartTime = formatTime24FromMinutes(startMin);
    const nextEndTime = formatTime24FromMinutes(endMin);
    const wasShifted =
      nextStartTime !== b.originalStartTime ||
      nextEndTime !== b.originalEndTime ||
      intersections.length > 0;

    return {
      ...b,
      startTime: nextStartTime,
      endTime: nextEndTime,
      wasShifted,
      shiftReason: shiftReasons.join(' · '),
      intersections,
    };
  });
}

export function resolveDailyStudyPlan({
  nowMs,
  settings,
  studyProgress,
  cache,
  customEvents = [],
}) {
  const tz = settings.location.timezone || 'Africa/Cairo';
  const parts = getZonedParts(new Date(nowMs), tz);
  const dateKey = parts.dateKey;
  const weekdayIndex = parts.weekdayIndex;

  const occasion = getDayOccasionContext(nowMs, settings, customEvents);
  const prayerDay = getPrayerTimesForDate(dateKey, settings, cache, nowMs);
  const prayerWindows = buildPrayerWindowsForDay(prayerDay.timings, settings);

  const dayMeta = DEFAULT_WEEKLY_SCHEDULE[weekdayIndex] || DEFAULT_WEEKLY_SCHEDULE[0];

  // حالة العيد: إجازة عيد سعيد دون احتساب تأخير في المراكم
  if (occasion.isEid) {
    return {
      dateKey,
      weekdayIndex,
      dayName: dayMeta.dayName,
      holidayStatus: 'eid',
      holidayTitle: occasion.eidEvent.title,
      holidayMessage: 'إجازة عيد سعيد — راحة واستمتاع (لا يُحتسب تأخير في المراكم اليوم)',
      ramadanActive: false,
      ramadanSuggestionAvailable: false,
      isSwapped: false,
      shiftOverridden: false,
      prayerWindows,
      activePrayerPause: null,
      blocks: [],
      completedCount: 0,
      totalCount: 0,
      occasion,
    };
  }

  let rawBlocks = getRawDayBlocks(weekdayIndex, settings, studyProgress, dateKey);

  const ramadanMode = settings?.study?.ramadanMode || 'auto';
  const ramadanActive = ramadanMode === 'on';
  const ramadanSuggestionAvailable =
    ramadanMode === 'auto' && occasion.isRamadan && !studyProgress?.ramadanPromptDismissed;

  if (ramadanActive) {
    rawBlocks = applyRamadanWindowShift(
      rawBlocks,
      prayerDay.timings,
      settings?.study?.ramadanWindow || 'after_taraweeh'
    );
  }

  const shiftOverridden = Boolean(studyProgress?.overrideShiftDates?.[dateKey]);
  const autoShiftEnabled = Boolean(settings?.study?.autoShiftOnPrayer) && !shiftOverridden;
  const shiftedBlocks = applyPrayerAutoShift(rawBlocks, prayerWindows, autoShiftEnabled);

  const completedMap = studyProgress?.completedBlocksByDate?.[dateKey] || {};
  const blocks = shiftedBlocks.map((b) => {
    const completed = Boolean(completedMap[b.id]);
    const guide = getGuideForSubject(b.subject, settings?.study?.weakestSubject);
    return {
      ...b,
      completed,
      guideText: guide.text,
      stages: getStagesForBlockKind(b.kind),
    };
  });

  // فحص هل الوقت الحالي داخل نافذة توقف للصلاة متقاطعة مع بلوك
  const curMins = parts.hour * 60 + parts.minute;
  let activePrayerPause = null;
  if (autoShiftEnabled) {
    for (const b of blocks) {
      if (b.isFreeRest || b.completed) continue;
      for (const ix of b.intersections || []) {
        if (curMins >= ix.startMin && curMins < ix.endMin) {
          activePrayerPause = {
            prayerId: ix.prayerId,
            label: ix.label,
            blockId: b.id,
            resumeHHMM: ix.endHHMM,
            resumeAtMs: zonedDateTimeToTimestampMs(dateKey, ix.endHHMM, tz),
            message: `توقف مؤقت لصلاة ${ix.label} — سيُستكمل البلوك تلقائياً بعد الصلاة (${toArabicDigits(ix.endHHMM)})`,
          };
          break;
        }
      }
      if (activePrayerPause) break;
    }
  }

  const countableBlocks = blocks.filter((b) => !b.isFreeRest);
  const completedCount = countableBlocks.filter((b) => b.completed).length;

  return {
    dateKey,
    weekdayIndex,
    dayName: dayMeta.dayName,
    holidayStatus: occasion.isOfficialHoliday ? 'official' : 'normal',
    holidayTitle: occasion.officialHoliday?.title || null,
    holidayMessage: occasion.isOfficialHoliday
      ? `تهنئة بمناسبة ${occasion.officialHoliday.title} — البلوكات اليوم مرنة`
      : null,
    ramadanActive,
    ramadanSuggestionAvailable,
    isSwapped: Boolean(studyProgress?.swappedDates?.[dateKey]),
    shiftOverridden,
    autoShiftEnabled,
    prayerWindows,
    activePrayerPause,
    blocks,
    completedCount,
    totalCount: countableBlocks.length,
    occasion,
  };
}

/**
 * حساب المرحلة الداخلية الحالية (١/٣ أو ٢/٣ أو ٣/٣) بناءً على الزمن المنقضي داخل البلوك.
 */
export function resolveBlockStageFromElapsed(kind, elapsedMs, totalDurationMinutes) {
  if (kind === 'break') {
    const totalMs = 10 * 60000;
    const clamped = Math.max(0, Math.min(totalMs, elapsedMs));
    const stages = getStagesForBlockKind('break');
    return {
      stageIndex: 0,
      totalStages: 1,
      stage: stages[0],
      stageRemainingMs: Math.max(0, totalMs - clamped),
    };
  }

  const stages = getStagesForBlockKind(kind);
  const totalDefinedMin = stages.reduce((sum, s) => sum + s.durationMinutes, 0);
  const scale = totalDefinedMin > 0 ? (totalDurationMinutes || totalDefinedMin) / totalDefinedMin : 1;

  let accMs = 0;
  for (let i = 0; i < stages.length; i += 1) {
    const stageDurationMs = Math.round(stages[i].durationMinutes * scale * 60000);
    const stageEndMs = accMs + stageDurationMs;
    if (elapsedMs < stageEndMs || i === stages.length - 1) {
      return {
        stageIndex: i,
        totalStages: stages.length,
        stage: stages[i],
        stageRemainingMs: Math.max(0, stageEndMs - elapsedMs),
      };
    }
    accMs = stageEndMs;
  }

  return {
    stageIndex: 0,
    totalStages: stages.length,
    stage: stages[0],
    stageRemainingMs: 0,
  };
}

export function computeWeeklyStudyStats(studyProgress, todayKey, settings) {
  const weekStart = getWeekStartDateKey(todayKey);
  let completedMinutes = 0;
  let completedBlocksCount = 0;

  for (let i = 0; i < 7; i += 1) {
    const dk = addDaysToDateKey(weekStart, i);
    const [y, m, d] = dk.split('-').map(Number);
    const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const dayBlocks = getRawDayBlocks(wd, settings, studyProgress, dk).filter((b) => !b.isFreeRest);
    const doneMap = studyProgress?.completedBlocksByDate?.[dk] || {};
    for (const b of dayBlocks) {
      if (doneMap[b.id]) {
        completedMinutes += Number(b.durationMinutes || 40);
        completedBlocksCount += 1;
      }
    }
  }

  const targetHours = Number(settings?.study?.weeklyTargetHours || 12);
  const completedHours = Number((completedMinutes / 60).toFixed(1));
  const percent = targetHours > 0 ? Math.min(100, Math.round((completedMinutes / (targetHours * 60)) * 100)) : 0;

  return {
    weekStart,
    completedMinutes,
    completedHours,
    targetHours,
    percent,
    completedBlocksCount,
    backlogRemaining: Number(studyProgress?.backlogRemaining ?? 9),
  };
}

export function toggleStudyBlockCompletion(studyProgress, dateKey, block) {
  const prevDay = studyProgress?.completedBlocksByDate?.[dateKey] || {};
  const wasDone = Boolean(prevDay[block.id]);
  const nextDone = !wasDone;

  const isBacklogBlock = block.tag === 'مراكم';
  let nextBacklog = Number(studyProgress?.backlogRemaining ?? 9);
  if (isBacklogBlock) {
    nextBacklog = nextDone ? Math.max(0, nextBacklog - 1) : nextBacklog + 1;
  }

  return {
    studyProgress: {
      ...studyProgress,
      backlogRemaining: nextBacklog,
      completedBlocksByDate: {
        ...(studyProgress?.completedBlocksByDate || {}),
        [dateKey]: {
          ...prevDay,
          [block.id]: nextDone,
        },
      },
    },
    completedNow: nextDone,
    backlogDecremented: isBacklogBlock && nextDone,
    backlogRemaining: nextBacklog,
  };
}
