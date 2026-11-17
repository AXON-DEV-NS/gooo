import { renderSubpageHeader } from '../components/nav-bar.js';
import { el } from '../components/dom.js';
import { icon } from '../components/icons.js';
import {
  CALCULATION_METHODS,
  LOCATION_PRESETS,
  OBLIGATORY_PRAYER_IDS,
  PRAYER_LABELS,
} from '../data/defaults.js';
import { formatDurationHMS, safeFormatLocalDateTimeAr, toArabicDigits } from '../services/clock.js';

export function renderPrayerPage(snapshot, store) {
  const { appState, runtime } = snapshot;
  const prayerState = runtime.prayerState;
  const settings = appState.settings;

  const refreshBtn = el(
    'button',
    {
      type: 'button',
      className: 'btn btn--primary focusable',
      disabled: runtime.syncingPrayer,
      onClick: () => store.syncExternalData(true),
    },
    runtime.syncingPrayer ? 'جاري التحديث...' : 'تحديث المواقيت الآن'
  );

  // بطاقات الصلوات الست
  const cardsGrid = el(
    'div',
    { className: 'grid-prayers' },
    ...(prayerState?.todayList || []).map((p) => {
      const isNext = !prayerState.nextPrayer?.isTomorrow && prayerState.nextPrayer?.id === p.id;
      const isCurrent = prayerState.currentPrayerId === p.id;
      let statusLabel = '';
      if (isNext) statusLabel = 'القادمة';
      else if (isCurrent) statusLabel = 'الحالية';

      return el(
        'div',
        { className: `card ${isNext ? 'card--hero' : isCurrent ? 'card--gold' : ''}` },
        el(
          'div',
          { className: 'card-head' },
          el('h3', { className: 'card-title' }, p.label),
          statusLabel ? el('span', { className: `badge ${isNext ? 'badge--primary' : 'badge--gold'}` }, statusLabel) : null
        ),
        el('div', { style: 'font-size: var(--text-xl);font-weight:700;', className: 'tabular-nums' }, toArabicDigits(p.hhmm)),
        p.isObligatory && settings.prayer.iqamaEnabled
          ? el(
              'div',
              { className: 'card-subtitle' },
              settings.prayer.iqamaEnabledByPrayer?.[p.id] !== false
                ? `إقامة شخصية: ${toArabicDigits(settings.prayer.iqamaMinutes?.[p.id] || 0)} د`
                : 'الإقامة متوقفة'
            )
          : null
      );
    })
  );

  // بطاقة المصدر وآخر تحديث + العداد المباشر
  const nextInfo = el(
    'section',
    { className: 'card card--hero' },
    el(
      'div',
      { className: 'card-head' },
      el(
        'div',
        null,
        el('h2', { className: 'card-title' }, `الصلاة القادمة: ${prayerState?.nextPrayer?.label || '—'}`),
        el(
          'p',
          { className: 'card-subtitle' },
          `المصدر: ${prayerState?.todayData?.source || 'غير محدد'}${prayerState?.todayData?.fetchedAt ? ` — آخر تحديث: ${safeFormatLocalDateTimeAr(prayerState.todayData.fetchedAt, settings.location.timezone)}` : ''}`
        )
      ),
      el(
        'div',
        { className: 'countdown-value tabular-nums', dataset: { liveCountdown: 'prayer' } },
        `بقي ${formatDurationHMS(prayerState?.nextPrayer?.remainingMs || 0, true)}`
      )
    ),
    runtime.prayerSyncError ? el('span', { className: 'badge badge--warning' }, runtime.prayerSyncError) : null
  );

  // إعدادات الإقامة لكل صلاة (إعدادات شخصية)
  const iqamaCard = el(
    'section',
    { className: 'card' },
    el(
      'div',
      { className: 'card-head' },
      el('h2', { className: 'card-title' }, 'مدد الإقامة (إعدادات شخصية)'),
      el(
        'button',
        {
          type: 'button',
          'aria-pressed': settings.prayer.iqamaEnabled ? 'true' : 'false',
          dataset: { focusId: 'prayer-iqama-global-toggle' },
          className: `btn btn--sm focusable ${settings.prayer.iqamaEnabled ? 'btn--primary' : ''}`,
          onClick: () =>
            store.updateAppState((prev) => ({
              ...prev,
              settings: {
                ...prev.settings,
                prayer: { ...prev.settings.prayer, iqamaEnabled: !prev.settings.prayer.iqamaEnabled },
              },
            })),
        },
        settings.prayer.iqamaEnabled ? 'الإقامة مفعّلة' : 'الإقامة متوقفة'
      )
    ),
    el(
      'p',
      { className: 'card-subtitle' },
      'تنبيه: هذه المدد إعدادات شخصية للتذكير بعد الأذان ولا تمثل توقيتاً رسمياً لمسجد بعينه.'
    ),
    el(
      'div',
      { className: 'list-stack' },
      ...OBLIGATORY_PRAYER_IDS.map((pid) => {
        const enabled = settings.prayer.iqamaEnabledByPrayer?.[pid] !== false;
        const mins = Number(settings.prayer.iqamaMinutes?.[pid] || 15);
        return el(
          'div',
          { className: 'list-item' },
          el('strong', null, PRAYER_LABELS[pid]),
          el(
            'div',
            { style: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;' },
            el(
              'button',
              {
                type: 'button',
                dataset: { focusId: `prayer-iqama-minus-${pid}` },
                className: 'btn btn--sm focusable',
                onClick: () =>
                  store.updateAppState((prev) => ({
                    ...prev,
                    settings: {
                      ...prev.settings,
                      prayer: {
                        ...prev.settings.prayer,
                        iqamaMinutes: {
                          ...prev.settings.prayer.iqamaMinutes,
                          [pid]: Math.max(1, mins - 1),
                        },
                      },
                    },
                  })),
              },
              '−'
            ),
            el('span', { className: 'tabular-nums', style: 'min-width:64px;text-align:center;font-weight:700;' }, `${toArabicDigits(mins)} دقيقة`),
            el(
              'button',
              {
                type: 'button',
                dataset: { focusId: `prayer-iqama-plus-${pid}` },
                className: 'btn btn--sm focusable',
                onClick: () =>
                  store.updateAppState((prev) => ({
                    ...prev,
                    settings: {
                      ...prev.settings,
                      prayer: {
                        ...prev.settings.prayer,
                        iqamaMinutes: {
                          ...prev.settings.prayer.iqamaMinutes,
                          [pid]: Math.min(45, mins + 1),
                        },
                      },
                    },
                  })),
              },
              '+'
            ),
            el(
              'button',
              {
                type: 'button',
                'aria-pressed': enabled ? 'true' : 'false',
                dataset: { focusId: `prayer-iqama-toggle-${pid}` },
                className: `btn btn--sm focusable ${enabled ? 'btn--primary' : ''}`,
                onClick: () =>
                  store.updateAppState((prev) => ({
                    ...prev,
                    settings: {
                      ...prev.settings,
                      prayer: {
                        ...prev.settings.prayer,
                        iqamaEnabledByPrayer: {
                          ...prev.settings.prayer.iqamaEnabledByPrayer,
                          [pid]: !enabled,
                        },
                      },
                    },
                  })),
              },
              enabled ? 'مفعّل' : 'معطل'
            )
          )
        );
      })
    )
  );

  // إعدادات الموقع وطريقة الحساب والصوت
  const locationSelect = el(
    'select',
    {
      className: 'select focusable',
      onChange: (e) => {
        const chosen = LOCATION_PRESETS.find((p) => p.id === e.target.value);
        if (!chosen) return;
        store.updateAppState((prev) => ({
          ...prev,
          settings: {
            ...prev.settings,
            location: {
              city: chosen.city,
              governorate: chosen.governorate,
              country: chosen.country,
              lat: chosen.lat,
              lng: chosen.lng,
              timezone: chosen.timezone,
            },
          },
        }));
        store.syncExternalData(true);
      },
    },
    ...LOCATION_PRESETS.map((p) =>
      el('option', { value: p.id, selected: p.city === settings.location.city }, p.label)
    )
  );

  const methodSelect = el(
    'select',
    {
      className: 'select focusable',
      onChange: (e) => {
        const nextMethod = Number(e.target.value);
        store.updateAppState((prev) => ({
          ...prev,
          settings: {
            ...prev.settings,
            prayer: { ...prev.settings.prayer, method: nextMethod },
          },
        }));
        store.syncExternalData(true);
      },
    },
    ...CALCULATION_METHODS.map((m) =>
      el('option', { value: String(m.id), selected: m.id === settings.prayer.method }, m.name)
    )
  );

  const audioAndMethodCard = el(
    'section',
    { className: 'card' },
    el('h2', { className: 'card-title' }, 'الحساب والموقع وصوت الأذان'),
    el(
      'div',
      { className: 'field-group' },
      el('label', { className: 'field-label' }, 'المدينة / المركز'),
      locationSelect
    ),
    el(
      'div',
      { className: 'field-group' },
      el('label', { className: 'field-label' }, 'طريقة الحساب'),
      methodSelect
    ),
    el(
      'div',
      { className: 'field-group' },
      el('label', { className: 'field-label' }, `المنطقة الزمنية: ${settings.location.timezone}`),
      el(
        'div',
        { style: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;' },
        el('span', { className: 'card-subtitle' }, 'تنبيه ما قبل الأذان:'),
        el(
          'button',
          {
            type: 'button',
            className: 'btn btn--sm focusable',
            onClick: () =>
              store.updateAppState((prev) => ({
                ...prev,
                settings: {
                  ...prev.settings,
                  prayer: {
                    ...prev.settings.prayer,
                    preAdhanMinutes: Math.max(0, prev.settings.prayer.preAdhanMinutes - 5),
                  },
                },
              })),
          },
          '−٥ د'
        ),
        el('strong', { className: 'tabular-nums' }, `${toArabicDigits(settings.prayer.preAdhanMinutes)} دقيقة`),
        el(
          'button',
          {
            type: 'button',
            className: 'btn btn--sm focusable',
            onClick: () =>
              store.updateAppState((prev) => ({
                ...prev,
                settings: {
                  ...prev.settings,
                  prayer: {
                    ...prev.settings.prayer,
                    preAdhanMinutes: Math.min(30, prev.settings.prayer.preAdhanMinutes + 5),
                  },
                },
              })),
          },
          '+٥ د'
        )
      )
    ),
    el(
      'div',
      { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;' },
      el(
        'button',
        {
          type: 'button',
          className: 'btn btn--primary focusable',
          onClick: () => store.audio.playCue('adhan'),
        },
        icon('volume', 18),
        'اختبار نغمة الأذان'
      ),
      el(
        'button',
        {
          type: 'button',
          className: 'btn focusable',
          onClick: () => store.audio.toggleMute(),
        },
        runtime.audioStatus.muted ? 'إلغاء الكتم' : 'كتم الصوت'
      ),
      el(
        'button',
        {
          type: 'button',
          className: 'btn btn--danger focusable',
          onClick: () => store.audio.stop(),
        },
        'إيقاف الصوت'
      )
    ),
    el(
      'p',
      { className: 'meta-source' },
      'الملفات الصوتية محلية بصيغة WAV مُولَّدة خصيصاً للمشروع ولا تعتمد على الإنترنت.'
    )
  );

  return el(
    'div',
    { className: 'page-stack' },
    renderSubpageHeader('مواقيت الصلاة والأذان', `${settings.location.city}، ${settings.location.governorate}`, store, refreshBtn),
    nextInfo,
    cardsGrid,
    el('div', { className: 'grid-2' }, iqamaCard, audioAndMethodCard)
  );
}
