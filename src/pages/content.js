import { el } from '../components/dom.js';
import { icon } from '../components/icons.js';
import { renderSubpageHeader } from '../components/nav-bar.js';
import { getDailyContentForDateKey } from '../data/religious-content.js';
import { resolveEventsForRange } from '../services/calendar.js';
import { getZonedParts, toArabicDigits } from '../services/clock.js';

export function renderContentPage(snapshot, store) {
  const { appState, runtime } = snapshot;
  const tz = appState.settings.location.timezone || 'Africa/Cairo';
  const todayKey = getZonedParts(new Date(runtime.nowMs), tz).dateKey;
  const content = getDailyContentForDateKey(todayKey);
  const upcomingEvents = resolveEventsForRange(runtime.nowMs, appState.settings, appState.customEvents, 45);

  const verseCard = el(
    'section',
    { className: 'card card--hero' },
    el(
      'div',
      { className: 'card-head' },
      el('h2', { className: 'card-title' }, icon('book', 20), 'آية اليوم والتفسير الموجز'),
      el('span', { className: 'badge badge--primary' }, `سورة ${content.verse.surah}: ${content.verse.ayah}`)
    ),
    el('p', { className: 'ayah-text' }, `﴿${content.verse.text}﴾`),
    el('p', { style: 'line-height:1.65;' }, content.verse.tafsir),
    el('span', { className: 'meta-source' }, `${content.verse.source} · ${content.verse.tafsirSource}`)
  );

  const hadithCard = el(
    'section',
    { className: 'card' },
    el(
      'div',
      { className: 'card-head' },
      el('h2', { className: 'card-title' }, 'حديث اليوم الموثق'),
      el('span', { className: 'badge badge--success' }, `الدرجة: ${content.hadith.grade}`)
    ),
    el('p', { className: 'ayah-text', style: 'font-size: var(--text-xl);' }, `«${content.hadith.text}»`),
    el('span', { className: 'card-subtitle' }, `الراوي: ${content.hadith.narrator}`),
    el('span', { className: 'meta-source' }, `التخريج والمصدر: ${content.hadith.source}`)
  );

  const vocabCard = appState.settings.display.showEducationalWords
    ? el(
        'section',
        { className: 'card' },
        el(
          'div',
          { className: 'card-head' },
          el('h2', { className: 'card-title' }, 'ثلاث مفردات إنجليزية وتعليمية لليوم'),
          el('span', { className: 'badge' }, `اليوم ${toArabicDigits(content.dayOfYear)} من السنة (تدوير محلي)`)
        ),
        el(
          'div',
          { className: 'grid-3' },
          ...content.words.map((item) =>
            el(
              'div',
              { className: 'list-item', style: 'flex-direction:column;align-items:flex-start;gap:6px;' },
              el('strong', { dir: 'ltr', style: 'font-size: var(--text-lg);color:var(--color-primary);' }, item.word),
              el('span', { style: 'font-weight:600;' }, item.meaning),
              el('span', { dir: 'ltr', className: 'card-subtitle', style: 'text-align:left;width:100%;' }, item.example),
              item.exampleAr ? el('span', { className: 'meta-source' }, item.exampleAr) : null
            )
          )
        )
      )
    : null;

  const eventTitleInput = el('input', { type: 'text', className: 'input focusable', placeholder: 'اسم المناسبة...', maxlength: 100 });
  const eventDateInput = el('input', { type: 'date', className: 'input focusable', value: todayKey });

  const eventsCard = el(
    'section',
    { className: 'card' },
    el(
      'div',
      { className: 'card-head' },
      el('h2', { className: 'card-title' }, 'المناسبات الإسلامية والمصرية القادمة'),
      el('span', { className: 'badge badge--gold' }, 'التواريخ الهجرية تقديرية')
    ),
    upcomingEvents.length === 0
      ? el('p', { className: 'card-subtitle' }, 'لا توجد مناسبات مسجلة خلال الـ ٤٥ يوماً القادمة.')
      : el(
          'div',
          { className: 'list-stack' },
          ...upcomingEvents.map((ev) =>
            el(
              'div',
              { className: 'list-item' },
              el(
                'div',
                null,
                el('strong', null, ev.title),
                el(
                  'div',
                  { className: 'card-subtitle tabular-nums' },
                  `${toArabicDigits(ev.dateKey)} (${ev.daysUntil === 0 ? 'اليوم' : `بعد ${toArabicDigits(ev.daysUntil)} يوم`}) · ${ev.category}${ev.note ? ` · ${ev.note}` : ''}`
                )
              ),
              el(
                'div',
                { style: 'display:flex;gap:8px;align-items:center;' },
                ev.isEstimated ? el('span', { className: 'badge badge--gold' }, 'موعد تقديري') : null,
                ev.isCustomOverride || ev.category === 'مناسبة شخصية'
                  ? el(
                      'button',
                      {
                        type: 'button',
                        className: 'btn btn--danger btn--sm focusable',
                        onClick: () =>
                          store.updateAppState((prev) => ({
                            ...prev,
                            customEvents: prev.customEvents.filter((c) => c.id !== ev.id),
                          })),
                      },
                      'حذف'
                    )
                  : null
              )
            )
          )
        ),
    el(
      'form',
      {
        className: 'grid-3',
        style: 'align-items:end;margin-top:8px;padding-top:12px;border-top:1px solid var(--border-subtle);',
        onSubmit: (e) => {
          e.preventDefault();
          const title = eventTitleInput.value.trim();
          const dateKey = eventDateInput.value;
          if (!title || !dateKey) return;
          store.updateAppState((prev) => ({
            ...prev,
            customEvents: [
              ...prev.customEvents,
              {
                id: `custom-${Date.now().toString(36)}`,
                title,
                dateKey,
                category: 'مناسبة شخصية',
                isEstimated: false,
              },
            ],
          }));
          eventTitleInput.value = '';
          store.pushToast('تمت إضافة المناسبة.', 'info');
        },
      },
      el('div', { className: 'field-group' }, el('label', { className: 'field-label' }, 'إضافة مناسبة أو تصحيح موعد'), eventTitleInput),
      el('div', { className: 'field-group' }, el('label', { className: 'field-label' }, 'التاريخ'), eventDateInput),
      el('button', { type: 'submit', className: 'btn btn--primary focusable' }, 'حفظ المناسبة')
    )
  );

  return el(
    'div',
    { className: 'page-stack' },
    renderSubpageHeader('المحتوى اليومي والمناسبات', 'نصوص موثقة بمصادرها مع إمكانية تعديل تواريخ المناسبات', store),
    verseCard,
    hadithCard,
    vocabCard,
    eventsCard
  );
}
