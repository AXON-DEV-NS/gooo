import { el } from '../components/dom.js';
import { icon } from '../components/icons.js';
import { getSurahByNumber } from '../data/quran-surahs.js';
import { getDailyContentForDateKey } from '../data/religious-content.js';
import { resolveEventsForRange } from '../services/calendar.js';
import {
  formatClock12Ar,
  formatDurationHMS,
  formatGregorianDateAr,
  getHijriDate,
  getZonedParts,
  pad2,
  toArabicDigits,
} from '../services/clock.js';
import {
  computeHabitCompletion,
  getCurrentOrNextTask,
  getHabitItemsConfig,
  getHabitRecordForDate,
  toggleHabitForDate,
} from '../services/domain.js';
import { resolveBlockStageFromElapsed } from '../services/smart-scheduler.js';

export function renderHomePage(snapshot, store) {
  const { appState, runtime } = snapshot;
  const tz = appState.settings.location.timezone || 'Africa/Cairo';
  const nowDate = new Date(runtime.nowMs);
  const parts = getZonedParts(nowDate, tz);
  const todayKey = parts.dateKey;
  const currentHHMM = `${pad2(parts.hour)}:${pad2(parts.minute)}`;
  const hijri = getHijriDate(nowDate, tz, appState.settings.calendar?.hijriOffsetDays || 0);

  const prayerState = runtime.prayerState;
  const nextPrayer = prayerState?.nextPrayer;
  const activeIqama = prayerState?.activeIqama;
  const studyPlan = runtime.studyPlan;
  const weeklyStats = runtime.weeklyStats;
  const activeTask = getCurrentOrNextTask(appState.tasks, currentHHMM);
  const focus = runtime.focus;
  const qState = runtime.quranState;

  // ========== العمود الأيمن: الساعة والتاريخين + البلوك الدراسي / المهمة الحالية ==========
  const nowCard = el(
    'section',
    { className: 'card' },
    el(
      'div',
      { className: 'card-head' },
      el('h2', { className: 'card-title' }, 'الآن'),
      el(
        'span',
        { className: `badge ${runtime.online ? 'badge--success' : 'badge--warning'}` },
        runtime.online ? 'متصل ومزامن' : 'عمل محلي'
      )
    ),
    el(
      'div',
      { className: 'hero-clock tabular-nums', dataset: { liveClock: 'hero' } },
      formatClock12Ar(parts.hour, parts.minute)
    ),
    el('div', { style: 'font-weight:600;' }, formatGregorianDateAr(parts)),
    el('div', { className: 'card-subtitle' }, hijri.formattedAr),
    activeTask
      ? el('div', { className: 'meta-source' }, `مهمة قريبة: ${activeTask.title} (${toArabicDigits(activeTask.startTime)})`)
      : null
  );

  const canSwapToday = (studyPlan?.blocks || []).filter((b) => b.kind === 'study_block').length >= 2;
  const visibleBlocks = (studyPlan?.blocks || []).slice(0, 3);
  const elapsedMs = Math.max(0, (focus.totalDurationMs || 0) - (focus.remainingMs || 0));
  const stageInfo =
    focus.mode === 'study_block' && focus.status !== 'idle'
      ? resolveBlockStageFromElapsed(
          focus.blockKind,
          elapsedMs,
          Math.round((focus.totalDurationMs || 2400000) / 60000)
        )
      : null;

  const studyCard = el(
    'section',
    { className: 'card card-grow' },
    el(
      'div',
      { className: 'card-head' },
      el('h2', { className: 'card-title' }, icon('tasks', 18), `مذاكرة ${studyPlan?.dayName || 'اليوم'}`),
      el(
        'div',
        { style: 'display:flex;gap:6px;align-items:center;flex-wrap:wrap;' },
        el('span', { className: 'badge badge--gold tabular-nums' }, `المراكم: ${toArabicDigits(weeklyStats?.backlogRemaining ?? 9)}`),
        canSwapToday
          ? el(
              'button',
              { type: 'button', className: 'btn btn--sm focusable', onClick: () => store.studyActions.swapTodayBlocks() },
              'تبديل ترتيب البلوكين'
            )
          : null
      )
    ),
    focus.status !== 'idle' && focus.mode === 'study_block'
      ? el(
          'div',
          { className: `list-item ${focus.status === 'paused_for_prayer' ? 'card--warning' : 'list-item--active'}`, style: 'flex-direction:column;align-items:stretch;gap:6px;' },
          el(
            'div',
            { style: 'display:flex;justify-content:space-between;align-items:center;' },
            el('strong', null, `${focus.subject} (${focus.tag || ''})`),
            el('span', { className: 'badge badge--primary tabular-nums', dataset: { liveFocus: 'home' } }, formatDurationHMS(focus.remainingMs, true))
          ),
          focus.status === 'paused_for_prayer' && focus.pausedForPrayer
            ? el('span', { className: 'card-subtitle', style: 'color:var(--color-warning);font-weight:700;' }, focus.pausedForPrayer.message)
            : stageInfo
              ? el('span', { className: 'card-subtitle', style: 'color:var(--color-primary);font-weight:600;' }, `${stageInfo.stage.label}: ${stageInfo.stage.instruction}`)
              : null,
          focus.guideText ? el('span', { className: 'meta-source' }, focus.guideText) : null,
          el(
            'div',
            { style: 'display:flex;gap:6px;' },
            focus.status === 'running'
              ? el('button', { type: 'button', className: 'btn btn--gold btn--sm focusable', onClick: () => store.focusActions.pause() }, 'إيقاف مؤقت')
              : el('button', { type: 'button', className: 'btn btn--primary btn--sm focusable', onClick: () => store.focusActions.start() }, 'استئناف'),
            el('button', { type: 'button', className: 'btn btn--sm focusable', onClick: () => store.focusActions.reset() }, 'إنهاء/ضبط')
          )
        )
      : null,
    studyPlan?.holidayStatus === 'eid'
      ? el('div', { className: 'badge badge--success', style: 'white-space:normal;' }, studyPlan.holidayMessage)
      : studyPlan?.ramadanSuggestionAvailable
        ? el(
            'div',
            { className: 'list-item list-item--active', style: 'flex-wrap:wrap;' },
            el('span', { className: 'card-subtitle', style: 'color:var(--text-primary);font-weight:600;' }, 'رمضان مبارك — تفعيل وضع رمضان لترحيل بلوكات العصر؟'),
            el(
              'div',
              { style: 'display:flex;gap:6px;' },
              el('button', { type: 'button', className: 'btn btn--primary btn--sm focusable', onClick: () => store.studyActions.activateRamadanMode('after_taraweeh') }, 'بعد التراويح'),
              el('button', { type: 'button', className: 'btn btn--sm focusable', onClick: () => store.studyActions.activateRamadanMode('before_fajr') }, 'قبل الفجر'),
              el('button', { type: 'button', className: 'btn btn--sm focusable', onClick: () => store.studyActions.dismissRamadanPrompt() }, 'لاحقاً')
            )
          )
        : null,
    studyPlan?.holidayStatus !== 'eid'
      ? el(
          'div',
          { className: 'list-stack' },
          ...visibleBlocks.map((b) =>
            el(
              'div',
              { className: `list-item ${b.completed ? 'list-item--done' : ''}`, style: 'padding:6px 10px;' },
              el(
                'div',
                { style: 'min-width:0;' },
                el('div', { style: 'font-weight:700;font-size:var(--text-sm);' }, `${b.subject} `, el('span', { className: 'badge', style: 'padding:2px 8px;' }, b.tag)),
                el('div', { className: 'card-subtitle tabular-nums' }, `${toArabicDigits(b.startTime)}–${toArabicDigits(b.endTime)}${b.wasShifted ? ` (مُعدّل عن ${toArabicDigits(b.originalStartTime)})` : ''}`)
              ),
              b.isFreeRest
                ? el('span', { className: 'badge badge--success' }, 'راحة')
                : el(
                    'div',
                    { style: 'display:flex;gap:6px;flex-shrink:0;' },
                    el('button', { type: 'button', dataset: { focusId: `home-block-start-${b.id}` }, className: 'btn btn--sm focusable', onClick: () => store.studyActions.startBlock(b) }, 'ابدأ'),
                    el('button', { type: 'button', 'aria-pressed': b.completed ? 'true' : 'false', dataset: { focusId: `home-block-done-${b.id}` }, className: `btn btn--sm focusable ${b.completed ? 'btn--primary' : ''}`, onClick: () => store.studyActions.toggleBlockDone(b) }, b.completed ? '✓ تم' : '✓')
                  )
            )
          )
        )
      : null,
    el(
      'div',
      { style: 'display:flex;justify-content:space-between;align-items:center;margin-top:auto;' },
      el('span', { className: 'meta-source tabular-nums' }, `الأسبوع: ${toArabicDigits(weeklyStats?.completedHours ?? 0)} / ${toArabicDigits(weeklyStats?.targetHours ?? 12)} س`),
      el('button', { type: 'button', className: 'btn btn--sm focusable', onClick: () => store.navigate('study') }, 'صفحة المذاكرة')
    )
  );

  // ========== العمود الأوسط: الصلاة القادمة + جدول صلوات اليوم ==========
  const nextPrayerCard = el(
    'section',
    { className: 'card card--hero' },
    el(
      'div',
      { className: 'card-head' },
      el('h2', { className: 'card-title' }, icon('moon', 20), 'الصلاة القادمة'),
      prayerState?.preAdhanActive
        ? el('span', { className: 'badge badge--warning' }, 'اقترب الأذان')
        : nextPrayer?.isTomorrow
          ? el('span', { className: 'badge badge--gold' }, 'فجر الغد')
          : el('span', { className: 'badge badge--primary' }, toArabicDigits(nextPrayer?.hhmm || '--:--'))
    ),
    el(
      'div',
      { style: 'display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap;' },
      el('div', { className: 'font-display', style: 'font-size: var(--text-2xl);color:var(--color-primary);' }, nextPrayer?.label || '—'),
      el('div', { className: 'countdown-value tabular-nums', dataset: { liveCountdown: 'prayer' } }, `بقي ${formatDurationHMS(nextPrayer?.remainingMs || 0, true)}`)
    ),
    activeIqama
      ? el('div', { className: 'badge badge--gold tabular-nums', dataset: { liveIqama: 'home' } }, `إقامة ${activeIqama.label} (إعداد شخصي): بقي ${formatDurationHMS(activeIqama.remainingMs, true)}`)
      : appState.settings.qiyam?.enabled && runtime.qiyamTimes
        ? el('div', { className: 'meta-source tabular-nums' }, `تذكير قيام الليل: ${toArabicDigits(runtime.qiyamTimes.reminderHHMM)} (بداية الثلث الأخير ${toArabicDigits(runtime.qiyamTimes.lastThirdHHMM)})`)
        : null
  );

  const prayerGridCard = el(
    'section',
    { className: 'card card-grow' },
    el(
      'div',
      { className: 'card-head' },
      el('h2', { className: 'card-title' }, 'مواقيت اليوم'),
      el('button', { type: 'button', className: 'btn btn--sm focusable', onClick: () => store.navigate('prayer') }, 'التفاصيل')
    ),
    el(
      'div',
      { className: 'prayer-row-list' },
      ...(prayerState?.todayList || []).map((p) => {
        const isNext = !nextPrayer?.isTomorrow && nextPrayer?.id === p.id;
        return el(
          'div',
          { className: `prayer-chip ${isNext ? 'is-next' : ''}` },
          el('span', { className: 'prayer-chip-name' }, p.label),
          el('span', { className: 'prayer-chip-time tabular-nums' }, toArabicDigits(p.hhmm))
        );
      })
    ),
    el('span', { className: 'meta-source', style: 'margin-top:auto;' }, `المصدر: ${prayerState?.todayData?.source || ''}`)
  );

  // ========== العمود الأيسر: إنجاز اليوم + البطاقة الذكية (تنبيه / مشغل القرآن المصغر / آية اليوم) ==========
  const habitDay = getHabitRecordForDate(appState.habitsByDate, todayKey);
  const habitStats = computeHabitCompletion(habitDay, appState.settings);
  const habitItems = getHabitItemsConfig(appState.settings);

  const habitsCard = el(
    'section',
    { className: 'card' },
    el(
      'div',
      { className: 'card-head' },
      el('h2', { className: 'card-title' }, icon('habits', 18), 'إنجاز اليوم'),
      el('span', { className: 'badge badge--primary tabular-nums' }, `${toArabicDigits(habitStats.percent)}٪`)
    ),
    el(
      'div',
      { className: 'progress-track', role: 'progressbar', 'aria-valuenow': habitStats.percent, 'aria-valuemin': 0, 'aria-valuemax': 100 },
      el('div', { className: 'progress-fill', style: `width: ${habitStats.percent}%` })
    ),
    el(
      'div',
      { style: 'display:flex;flex-wrap:wrap;gap:5px;' },
      ...habitItems.slice(0, 7).map((item) => {
        const done = Boolean(habitDay[item.id]);
        return el(
          'button',
          {
            type: 'button',
            'aria-pressed': done ? 'true' : 'false',
            dataset: { focusId: `home-habit-${item.id}` },
            className: `btn btn--sm focusable ${done ? 'btn--primary' : ''}`,
            onClick: () =>
              store.updateAppState((prev) => ({
                ...prev,
                habitsByDate: toggleHabitForDate(prev.habitsByDate, todayKey, item.id),
              })),
          },
          done ? `✓ ${item.label.replace('صلاة ', '')}` : item.label.replace('صلاة ', '')
        );
      })
    )
  );

  const primaryAlert = runtime.alertsState?.primaryAlert;
  const dailyContent = getDailyContentForDateKey(todayKey);
  const upcomingEvents = resolveEventsForRange(runtime.nowMs, appState.settings, appState.customEvents, 7);
  const nearestEvent = upcomingEvents[0] || null;

  let smartCard;
  if (primaryAlert) {
    smartCard = el(
      'section',
      { className: 'card card-grow card--warning' },
      el('div', { className: 'card-head' }, el('h2', { className: 'card-title' }, icon('bell', 18), 'تنبيه مهم')),
      el('strong', null, primaryAlert.title),
      el('p', { className: 'card-subtitle', style: 'color:var(--text-primary);line-height:1.5;' }, primaryAlert.body),
      el(
        'div',
        { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:auto;' },
        el('button', { type: 'button', className: 'btn btn--primary btn--sm focusable', onClick: () => store.dismissAlert(primaryAlert.id, 'completed') }, 'تم الاطلاع'),
        el('button', { type: 'button', className: 'btn btn--sm focusable', onClick: () => store.dismissAlert(primaryAlert.id, 'dismissed') }, 'تجاهل اليوم')
      )
    );
  } else if (qState && (qState.isPlaying || qState.isInterrupted)) {
    const surah = getSurahByNumber(qState.surahNumber);
    smartCard = el(
      'section',
      { className: 'card card-grow card--hero' },
      el(
        'div',
        { className: 'card-head' },
        el('h2', { className: 'card-title' }, icon('book', 18), 'مشغل القرآن المصغر'),
        el('span', { className: 'badge badge--primary' }, qState.isInterrupted ? 'توقف للأذان' : 'يُتلى الآن')
      ),
      el('strong', { style: 'font-size:var(--text-lg);' }, `سورة ${surah.name}`),
      el('span', { className: 'card-subtitle' }, 'الشيخ محمود خليل الحصري — المصحف المجوّد'),
      el(
        'div',
        { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:auto;' },
        el('button', { type: 'button', className: 'btn btn--primary btn--sm focusable', onClick: () => store.quranActions.togglePlayPause() }, qState.isPlaying ? 'إيقاف مؤقت' : 'استئناف'),
        el('button', { type: 'button', className: 'btn btn--sm focusable', onClick: () => store.quranActions.nextSurah() }, 'التالية'),
        el('button', { type: 'button', className: 'btn btn--sm focusable', onClick: () => store.navigate('quran') }, 'المصحف')
      )
    );
  } else {
    smartCard = el(
      'section',
      { className: 'card card-grow' },
      el(
        'div',
        { className: 'card-head' },
        el('h2', { className: 'card-title' }, icon('book', 18), 'آية اليوم'),
        el('button', { type: 'button', className: 'btn btn--sm focusable', onClick: () => store.navigate('content') }, 'المحتوى')
      ),
      el('p', { className: 'ayah-text' }, `﴿${dailyContent.verse.text}﴾`),
      el('span', { className: 'meta-source' }, `سورة ${dailyContent.verse.surah}: ${dailyContent.verse.ayah}`),
      nearestEvent
        ? el('div', { className: 'card-subtitle' }, `مناسبة قريبة: ${nearestEvent.title} (${nearestEvent.daysUntil === 0 ? 'اليوم' : `بعد ${toArabicDigits(nearestEvent.daysUntil)} يوم`})`)
        : null,
      el(
        'div',
        { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:auto;' },
        el('button', { type: 'button', className: 'btn btn--primary btn--sm focusable', onClick: () => store.navigate('quran') }, 'تشغيل الحصري المجوّد'),
        el('button', { type: 'button', className: 'btn btn--sm focusable', onClick: () => store.navigate('diagnostics') }, 'فحص التلفاز')
      )
    );
  }

  return el(
    'div',
    { className: 'home-grid' },
    el('div', { className: 'home-col' }, nowCard, studyCard),
    el('div', { className: 'home-col' }, nextPrayerCard, prayerGridCard),
    el('div', { className: 'home-col' }, habitsCard, smartCard)
  );
}
