import { el } from '../components/dom.js';
import { icon } from '../components/icons.js';
import { renderSubpageHeader } from '../components/nav-bar.js';
import { formatDurationHMS, getZonedParts, toArabicDigits } from '../services/clock.js';
import { resolveBlockStageFromElapsed } from '../services/smart-scheduler.js';

export function renderFocusPage(snapshot, store) {
  const { appState, runtime } = snapshot;
  const { focus } = runtime;
  const focusSettings = appState.settings.focus;
  const tz = appState.settings.location.timezone || 'Africa/Cairo';
  const todayKey = getZonedParts(new Date(runtime.nowMs), tz).dateKey;
  const studyPlan = runtime.studyPlan;

  const totalDurationMs =
    focus.totalDurationMs > 0
      ? focus.totalDurationMs
      : (focus.phase === 'focus' ? focusSettings.focusMinutes : focusSettings.breakMinutes) * 60000;
  const elapsedMs = Math.max(0, totalDurationMs - focus.remainingMs);
  const progressPct =
    totalDurationMs > 0
      ? Math.min(100, Math.max(0, Math.round((elapsedMs / totalDurationMs) * 100)))
      : 0;

  const stageInfo =
    focus.mode === 'study_block'
      ? resolveBlockStageFromElapsed(
          focus.blockKind,
          elapsedMs,
          Math.max(1, Math.round(totalDurationMs / 60000))
        )
      : null;

  const todaySessions = (appState.focusSessions || []).filter((s) => s.dateKey === todayKey);

  const timerTitle =
    focus.mode === 'study_block' && focus.subject
      ? `${focus.subject}${focus.tag ? ` — [${focus.tag}]` : ''}`
      : focus.phase === 'focus'
        ? 'جلسة تركيز مخصصة'
        : 'استراحة قصيرة';

  const statusText =
    focus.status === 'paused_for_prayer'
      ? 'توقف تلقائي للصلاة'
      : focus.status === 'running'
        ? 'يعمل الآن'
        : focus.status === 'paused'
          ? 'متوقف مؤقتاً'
          : 'جاهز';

  const timerCard = el(
    'section',
    { className: `card ${focus.status === 'paused_for_prayer' ? 'card--warning' : 'card--hero'}` },
    el(
      'div',
      { className: 'card-head' },
      el('h2', { className: 'card-title' }, icon('clock', 20), timerTitle),
      el('span', { className: 'badge badge--primary' }, statusText)
    ),
    el(
      'div',
      {
        className: 'hero-clock tabular-nums',
        style: 'text-align:center;padding:12px 0;',
        dataset: { liveFocus: 'page' },
      },
      formatDurationHMS(focus.remainingMs, true)
    ),
    el(
      'div',
      { className: 'progress-track' },
      el('div', {
        className: 'progress-fill',
        style: `width: ${progressPct}%`,
        dataset: { liveFocusBar: 'page' },
      })
    ),
    focus.status === 'paused_for_prayer' && focus.pausedForPrayer
      ? el(
          'div',
          { className: 'card', style: 'background:var(--color-warning-soft);margin-top:8px;' },
          el('strong', null, focus.pausedForPrayer.message)
        )
      : null,
    stageInfo
      ? el(
          'div',
          { className: 'card', style: 'background:var(--bg-elevated);margin-top:8px;' },
          el(
            'div',
            { className: 'card-head' },
            el('strong', { style: 'color:var(--color-primary);' }, `المرحلة ${toArabicDigits(stageInfo.stageIndex + 1)} من ${toArabicDigits(stageInfo.totalStages)}: ${stageInfo.stage.label}`),
            el('span', { className: 'badge tabular-nums' }, `متبقي للمرحلة ${formatDurationHMS(stageInfo.stageRemainingMs, true)}`)
          ),
          el('p', { style: 'font-weight:600;' }, stageInfo.stage.instruction)
        )
      : null,
    focus.guideText
      ? el(
          'div',
          { className: 'card', style: 'background:var(--color-gold-soft);border-color:var(--color-gold-border);margin-top:6px;' },
          el('strong', { style: 'color:var(--color-gold);' }, `البطاقة الإرشادية لمادة ${focus.subject}:`),
          el('p', null, focus.guideText)
        )
      : null,
    el(
      'div',
      { style: 'display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:8px;' },
      focus.status === 'running'
        ? el(
            'button',
            { type: 'button', className: 'btn btn--gold focusable', onClick: () => store.focusActions.pause() },
            icon('pause', 18),
            'إيقاف مؤقت'
          )
        : el(
            'button',
            { type: 'button', className: 'btn btn--primary focusable', onClick: () => store.focusActions.start() },
            icon('play', 18),
            focus.status === 'paused' || focus.status === 'paused_for_prayer' ? 'استئناف' : 'ابدأ الجلسة'
          ),
      el(
        'button',
        { type: 'button', className: 'btn focusable', onClick: () => store.focusActions.reset() },
        icon('reset', 18),
        'إعادة ضبط'
      ),
      el(
        'button',
        {
          type: 'button',
          className: 'btn focusable',
          onClick: () => store.focusActions.switchPhase(focus.phase === 'focus' ? 'break' : 'focus'),
        },
        focus.phase === 'focus' ? 'وضع الاستراحة' : 'مؤقت تركيز حر'
      )
    )
  );

  // بلوكات اليوم الجاهزة للتشغيل الفوري
  const todayBlocksCard = el(
    'section',
    { className: 'card' },
    el('h2', { className: 'card-title' }, `تشغيل بلوك من جدول ${studyPlan?.dayName || 'اليوم'}`),
    (studyPlan?.blocks || []).filter((b) => !b.isFreeRest).length === 0
      ? el('p', { className: 'card-subtitle' }, studyPlan?.holidayMessage || 'لا توجد بلوكات مطلوبة اليوم.')
      : el(
          'div',
          { className: 'list-stack' },
          ...(studyPlan?.blocks || [])
            .filter((b) => !b.isFreeRest)
            .map((b) =>
              el(
                'div',
                { className: `list-item ${b.completed ? 'list-item--done' : ''}` },
                el(
                  'div',
                  null,
                  el('strong', null, `${b.subject} (${b.tag})`),
                  el('div', { className: 'card-subtitle tabular-nums' }, `${toArabicDigits(b.startTime)} – ${toArabicDigits(b.endTime)} · ${toArabicDigits(b.durationMinutes)} دقيقة`)
                ),
                el(
                  'button',
                  {
                    type: 'button',
                    className: 'btn btn--primary btn--sm focusable',
                    onClick: () => store.studyActions.startBlock(b),
                  },
                  'تشغيل البلوك'
                )
              )
            )
        )
  );

  const presetsCard = el(
    'section',
    { className: 'card' },
    el('h2', { className: 'card-title' }, 'إعداد المدد والصوت'),
    el(
      'div',
      { style: 'display:flex;gap:8px;flex-wrap:wrap;' },
      ...[
        { label: '٤٥ د تركيز / ١٠ د راحة', f: 45, b: 10 },
        { label: '٤٠ د بلوك / ١٠ د راحة', f: 40, b: 10 },
        { label: '٢٥ د تركيز / ٥ د راحة', f: 25, b: 5 },
      ].map((p) =>
        el(
          'button',
          {
            type: 'button',
            className: `btn btn--sm focusable ${focusSettings.focusMinutes === p.f && focusSettings.breakMinutes === p.b ? 'btn--primary' : ''}`,
            onClick: () => {
              store.updateAppState((prev) => ({
                ...prev,
                settings: {
                  ...prev.settings,
                  focus: { ...prev.settings.focus, focusMinutes: p.f, breakMinutes: p.b },
                },
              }));
              store.focusActions.switchPhase('focus');
            },
          },
          p.label
        )
      )
    ),
    el(
      'button',
      {
        type: 'button',
        className: `btn btn--sm focusable ${focusSettings.soundEnabled ? 'btn--primary' : ''}`,
        style: 'align-self:flex-start;margin-top:8px;',
        onClick: () =>
          store.updateAppState((prev) => ({
            ...prev,
            settings: {
              ...prev.settings,
              focus: { ...prev.settings.focus, soundEnabled: !focusSettings.soundEnabled },
            },
          })),
      },
      focusSettings.soundEnabled ? 'تنبيه صوتي عند الانتهاء والمراحل: مفعّل' : 'تنبيه صوتي: صامت'
    ),
    el('h3', { className: 'card-title', style: 'margin-top:12px;' }, `جلسات اليوم (${toArabicDigits(todaySessions.length)})`),
    todaySessions.length === 0
      ? el('p', { className: 'card-subtitle' }, 'لم تكتمل أي جلسة بعد.')
      : el(
          'div',
          { className: 'list-stack' },
          ...todaySessions.slice().reverse().slice(0, 5).map((s) =>
            el(
              'div',
              { className: 'list-item list-item--done' },
              el('span', null, s.phase === 'focus' ? 'جلسة تركيز / بلوك' : 'استراحة'),
              el('span', { className: 'card-subtitle tabular-nums' }, `${toArabicDigits(s.durationMinutes)} دقيقة`)
            )
          )
        )
  );

  return el(
    'div',
    { className: 'page-stack' },
    renderSubpageHeader('مؤقت المذاكرة والتركيز', 'مقسم تلقائياً إلى مراحل مع الإرشاد والتوقف التلقائي للصلاة', store),
    timerCard,
    el('div', { className: 'grid-2' }, todayBlocksCard, presetsCard)
  );
}
