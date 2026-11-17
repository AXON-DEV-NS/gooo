import { el } from '../components/dom.js';
import { icon } from '../components/icons.js';
import { renderSubpageHeader } from '../components/nav-bar.js';
import { addDaysToDateKey, getZonedParts, toArabicDigits } from '../services/clock.js';
import {
  computeHabitCompletion,
  getHabitItemsConfig,
  getHabitRecordForDate,
  toggleHabitForDate,
} from '../services/domain.js';

export function renderHabitsPage(snapshot, store) {
  const { appState, runtime } = snapshot;
  const tz = appState.settings.location.timezone || 'Africa/Cairo';
  const todayKey = getZonedParts(new Date(runtime.nowMs), tz).dateKey;
  const selectedDateKey = runtime.selectedHabitsDateKey || todayKey;

  const items = getHabitItemsConfig(appState.settings);
  const selectedRecord = getHabitRecordForDate(appState.habitsByDate, selectedDateKey);
  const stats = computeHabitCompletion(selectedRecord, appState.settings);

  // آخر ٧ أيام للاختيار السريع والتصحيح
  const recentDays = [];
  for (let i = 0; i < 7; i += 1) {
    recentDays.push(addDaysToDateKey(todayKey, -i));
  }

  const daySelectorCard = el(
    'section',
    { className: 'card' },
    el(
      'div',
      { className: 'card-head' },
      el('h2', { className: 'card-title' }, icon('habits', 20), `سجل يوم: ${toArabicDigits(selectedDateKey)}`),
      el('span', { className: 'badge badge--primary tabular-nums' }, `${toArabicDigits(stats.percent)}٪ مكتمل`)
    ),
    el(
      'div',
      { className: 'progress-track' },
      el('div', { className: 'progress-fill', style: `width: ${stats.percent}%` })
    ),
    el(
      'div',
      { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;' },
      ...recentDays.map((dk, idx) => {
        const rec = getHabitRecordForDate(appState.habitsByDate, dk);
        const dayStat = computeHabitCompletion(rec, appState.settings);
        const label = idx === 0 ? 'اليوم' : idx === 1 ? 'أمس' : toArabicDigits(dk.slice(5));
        return el(
          'button',
          {
            type: 'button',
            'aria-pressed': dk === selectedDateKey ? 'true' : 'false',
            dataset: { focusId: `habits-day-${idx}` },
            className: `btn btn--sm focusable ${dk === selectedDateKey ? 'btn--primary' : ''}`,
            onClick: () => store.setSelectedHabitsDateKey(dk),
          },
          `${label} (${toArabicDigits(dayStat.percent)}٪)`
        );
      })
    ),
    el(
      'p',
      { className: 'card-subtitle' },
      'يُحفظ سجل كل يوم بمعرف تاريخه ولا يُحذف إنجاز الأمس عند بدء يوم جديد، ويمكنك تصحيح أي يوم سابق بالضغط عليه أعلاه.'
    )
  );

  const checklistCard = el(
    'section',
    { className: 'card' },
    el('h2', { className: 'card-title' }, 'البنود اليومية'),
    el(
      'div',
      { className: 'grid-3' },
      ...items.map((item) => {
        const done = Boolean(selectedRecord[item.id]);
        return el(
          'button',
          {
            type: 'button',
            'aria-pressed': done ? 'true' : 'false',
            dataset: { focusId: `habits-item-${item.id}`, rowKey: `habit-${item.id}` },
            className: `list-item focusable ${done ? 'list-item--done' : ''}`,
            style: 'cursor:pointer;text-align:right;width:100%;',
            onClick: () =>
              store.updateAppState((prev) => ({
                ...prev,
                habitsByDate: toggleHabitForDate(prev.habitsByDate, selectedDateKey, item.id),
              })),
          },
          el(
            'div',
            null,
            el('div', { style: 'font-weight:700;' }, item.label),
            el('div', { className: 'card-subtitle' }, item.group)
          ),
          el('span', { className: `badge ${done ? 'badge--success' : ''}` }, done ? '✓ تم' : 'لم يُنجز')
        );
      })
    )
  );

  return el(
    'div',
    { className: 'page-stack' },
    renderSubpageHeader(
      'العادات والإنجاز',
      'متابعة الصلوات والورد والمذاكرة والعناية اليومية',
      store,
      el(
        'button',
        {
          type: 'button',
          className: 'btn btn--primary focusable',
          onClick: () => store.navigate('content'),
        },
        icon('book', 18),
        'المحتوى اليومي والمناسبات'
      )
    ),
    daySelectorCard,
    checklistCard
  );
}
