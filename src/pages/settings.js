import { el } from '../components/dom.js';
import { renderSubpageHeader } from '../components/nav-bar.js';
import { renderScreensaverPresetStage } from '../components/screensaver-overlay.js';
import { IDLE_DURATION_OPTIONS, SCREENSAVER_PRESETS, getPresetById } from '../data/screensaver-presets.js';
import { STUDY_SUBJECTS } from '../data/study-schedule.js';
import { getHijriDate, toArabicDigits } from '../services/clock.js';
import { QIYAM_HADITH } from '../services/qiyam.js';
import { formatScreensaverData, getDiscoveredBackgrounds } from '../services/screensaver.js';
import { exportBackupJson, mergeRestoredBackup, parseAndValidateBackup } from '../storage/backup.js';

export function renderSettingsPage(snapshot, store) {
  const { appState, runtime } = snapshot;
  const settings = appState.settings;
  const hijri = getHijriDate(new Date(runtime.nowMs), settings.location.timezone, settings.calendar.hijriOffsetDays);

  function toggleCard(title, rows) {
    return el(
      'section',
      { className: 'card' },
      el('h2', { className: 'card-title' }, title),
      el('div', { className: 'list-stack' }, ...rows)
    );
  }

  function makeToggleRow(label, subtitle, active, onToggle) {
    return el(
      'div',
      { className: 'list-item' },
      el('div', null, el('strong', null, label), subtitle ? el('div', { className: 'card-subtitle' }, subtitle) : null),
      el(
        'button',
        {
          type: 'button',
          'aria-pressed': active ? 'true' : 'false',
          dataset: {
            focusId: `settings-toggle-${label.trim().slice(0, 32).replace(/\s+/g, '_')}`,
          },
          className: `btn btn--sm focusable ${active ? 'btn--primary' : ''}`,
          onClick: onToggle,
        },
        active ? 'مفعّل' : 'متوقف'
      )
    );
  }

  // ١. المظهر والخطوط والتقويم الهجري
  const displayCard = toggleCard('١. المظهر والخطوط والتقويم الهجري', [
    el(
      'div',
      { className: 'list-item' },
      el('div', null, el('strong', null, 'وضع العرض'), el('div', { className: 'card-subtitle' }, 'الوضع الفاتح هو الافتراضي لتلفاز المنزل')),
      el(
        'div',
        { style: 'display:flex;gap:8px;' },
        el(
          'button',
          {
            type: 'button',
            dataset: { focusId: 'settings-theme-light' },
            className: `btn btn--sm focusable ${settings.display.theme === 'light' ? 'btn--primary' : ''}`,
            onClick: () =>
              store.updateAppState((p) => ({ ...p, settings: { ...p.settings, display: { ...p.settings.display, theme: 'light' } } })),
          },
          'فاتح (الافتراضي)'
        ),
        el(
          'button',
          {
            type: 'button',
            dataset: { focusId: 'settings-theme-night' },
            className: `btn btn--sm focusable ${settings.display.theme === 'night' ? 'btn--primary' : ''}`,
            onClick: () =>
              store.updateAppState((p) => ({ ...p, settings: { ...p.settings, display: { ...p.settings.display, theme: 'night' } } })),
          },
          'ليلي اختياري'
        )
      )
    ),
    el(
      'div',
      { className: 'list-item' },
      el('div', null, el('strong', null, 'حجم الخط للمسافة البعيدة')),
      el(
        'div',
        { style: 'display:flex;gap:8px;' },
        el(
          'button',
          {
            type: 'button',
            dataset: { focusId: 'settings-font-normal' },
            className: `btn btn--sm focusable ${settings.display.fontScale === 'normal' ? 'btn--primary' : ''}`,
            onClick: () =>
              store.updateAppState((p) => ({ ...p, settings: { ...p.settings, display: { ...p.settings.display, fontScale: 'normal' } } })),
          },
          'قياسي'
        ),
        el(
          'button',
          {
            type: 'button',
            dataset: { focusId: 'settings-font-large' },
            className: `btn btn--sm focusable ${settings.display.fontScale === 'large' ? 'btn--primary' : ''}`,
            onClick: () =>
              store.updateAppState((p) => ({ ...p, settings: { ...p.settings, display: { ...p.settings.display, fontScale: 'large' } } })),
          },
          'كبير'
        )
      )
    ),
    el(
      'div',
      { className: 'list-item' },
      el(
        'div',
        null,
        el('strong', null, `تصحيح التاريخ الهجري: ${hijri.formattedAr}`),
        el('div', { className: 'card-subtitle' }, `المصدر: ${hijri.source}`)
      ),
      el(
        'div',
        { style: 'display:flex;align-items:center;gap:8px;' },
        el(
          'button',
          {
            type: 'button',
            dataset: { focusId: 'settings-hijri-minus' },
            className: 'btn btn--sm focusable',
            onClick: () =>
              store.updateAppState((p) => ({
                ...p,
                settings: {
                  ...p.settings,
                  calendar: { hijriOffsetDays: Math.max(-3, (p.settings.calendar.hijriOffsetDays || 0) - 1) },
                },
              })),
          },
          '−١ يوم'
        ),
        el('span', { className: 'tabular-nums' }, toArabicDigits(settings.calendar.hijriOffsetDays || 0)),
        el(
          'button',
          {
            type: 'button',
            dataset: { focusId: 'settings-hijri-plus' },
            className: 'btn btn--sm focusable',
            onClick: () =>
              store.updateAppState((p) => ({
                ...p,
                settings: {
                  ...p.settings,
                  calendar: { hijriOffsetDays: Math.min(3, (p.settings.calendar.hijriOffsetDays || 0) + 1) },
                },
              })),
          },
          '+١ يوم'
        )
      )
    ),
  ]);

  // ٢. الصوت والتنبيهات والهدوء
  const alertsCard = toggleCard('٢. الصوت والتنبيهات وفترة الهدوء', [
    makeToggleRow(
      'تشغيل الأصوات العامة',
      `مستوى الصوت الحالي: ${toArabicDigits(Math.round(settings.audio.volume * 100))}٪`,
      settings.audio.soundEnabled,
      () =>
        store.updateAppState((p) => ({
          ...p,
          settings: { ...p.settings, audio: { ...p.settings.audio, soundEnabled: !p.settings.audio.soundEnabled } },
        }))
    ),
    el(
      'div',
      { className: 'list-item' },
      el('strong', null, 'ضبط مستوى الصوت'),
      el(
        'div',
        { style: 'display:flex;gap:8px;align-items:center;' },
        el(
          'button',
          {
            type: 'button',
            dataset: { focusId: 'settings-volume-down' },
            className: 'btn btn--sm focusable',
            onClick: () =>
              store.updateAppState((p) => ({
                ...p,
                settings: {
                  ...p.settings,
                  audio: { ...p.settings.audio, volume: Math.max(0.1, Number((p.settings.audio.volume - 0.15).toFixed(2))) },
                },
              })),
          },
          'خفض'
        ),
        el('span', { className: 'tabular-nums' }, `${toArabicDigits(Math.round(settings.audio.volume * 100))}٪`),
        el(
          'button',
          {
            type: 'button',
            dataset: { focusId: 'settings-volume-up' },
            className: 'btn btn--sm focusable',
            onClick: () =>
              store.updateAppState((p) => ({
                ...p,
                settings: {
                  ...p.settings,
                  audio: { ...p.settings.audio, volume: Math.min(1, Number((p.settings.audio.volume + 0.15).toFixed(2))) },
                },
              })),
          },
          'رفع'
        )
      )
    ),
    makeToggleRow(
      'فترة الهدوء الليلي',
      `من ${toArabicDigits(settings.alerts.quietStart)} إلى ${toArabicDigits(settings.alerts.quietEnd)} (تُكتم التنبيهات غير الحرجة)`,
      settings.alerts.quietHoursEnabled,
      () =>
        store.updateAppState((p) => ({
          ...p,
          settings: { ...p.settings, alerts: { ...p.settings.alerts, quietHoursEnabled: !p.settings.alerts.quietHoursEnabled } },
        }))
    ),
    makeToggleRow('تذكير صيام الاثنين والخميس', 'تنبيه مسائي ليلة الاثنين وليلة الخميس', settings.alerts.monThuEnabled, () =>
      store.updateAppState((p) => ({
        ...p,
        settings: { ...p.settings, alerts: { ...p.settings.alerts, monThuEnabled: !p.settings.alerts.monThuEnabled } },
      }))
    ),
    makeToggleRow('تذكير الأيام البيض', '١٣، ١٤، ١٥ من كل شهر هجري', settings.alerts.whiteDaysEnabled, () =>
      store.updateAppState((p) => ({
        ...p,
        settings: { ...p.settings, alerts: { ...p.settings.alerts, whiteDaysEnabled: !p.settings.alerts.whiteDaysEnabled } },
      }))
    ),
    makeToggleRow('تذكير النوم المسبق', `قبل ${toArabicDigits(settings.alerts.sleepTime)} بـ ${toArabicDigits(settings.alerts.sleepReminderMinutesBefore)} دقيقة`, settings.alerts.sleepReminderEnabled, () =>
      store.updateAppState((p) => ({
        ...p,
        settings: { ...p.settings, alerts: { ...p.settings.alerts, sleepReminderEnabled: !p.settings.alerts.sleepReminderEnabled } },
      }))
    ),
    makeToggleRow('تذكير شرب الماء أثناء النشاط', `كل ${toArabicDigits(settings.alerts.waterIntervalMinutes)} دقيقة بحد أقصى ${toArabicDigits(settings.alerts.waterMaxDaily)} مرات`, settings.alerts.waterReminderEnabled, () =>
      store.updateAppState((p) => ({
        ...p,
        settings: { ...p.settings, alerts: { ...p.settings.alerts, waterReminderEnabled: !p.settings.alerts.waterReminderEnabled } },
      }))
    ),
    makeToggleRow('تذكير الحركة وتغيير الجلسة', `كل ${toArabicDigits(settings.alerts.movementIntervalMinutes)} دقيقة أثناء النشاط`, settings.alerts.movementReminderEnabled, () =>
      store.updateAppState((p) => ({
        ...p,
        settings: { ...p.settings, alerts: { ...p.settings.alerts, movementReminderEnabled: !p.settings.alerts.movementReminderEnabled } },
      }))
    ),
  ]);

  // ٣.٥ إعدادات جدول المذاكرة الذكي والتوقيت المتكيف
  const studySettings = settings.study || {};
  const backlogCount = appState.studyProgress?.backlogRemaining ?? 9;
  const driftSeconds = Math.round((appState.cache?.timeDrift?.offsetMs || 0) / 1000);

  const studyScheduleCard = toggleCard('٣.٥ جدول المذاكرة الذكي والتوقيت المتكيف', [
    el(
      'div',
      { className: 'list-item' },
      el('div', null, el('strong', null, 'عداد بلوكات المراكم المتبقية'), el('div', { className: 'card-subtitle' }, 'ينقص تلقائياً عند إتمام أي بلوك [مراكم]')),
      el(
        'div',
        { style: 'display:flex;align-items:center;gap:8px;' },
        el(
          'button',
          { type: 'button', dataset: { focusId: 'settings-study-backlog-minus' }, className: 'btn btn--sm focusable', onClick: () => store.studyActions.adjustBacklog(-1) },
          '−١'
        ),
        el('strong', { className: 'tabular-nums' }, `${toArabicDigits(backlogCount)} بلوكات`),
        el(
          'button',
          { type: 'button', dataset: { focusId: 'settings-study-backlog-plus' }, className: 'btn btn--sm focusable', onClick: () => store.studyActions.adjustBacklog(1) },
          '+١'
        )
      )
    ),
    el(
      'div',
      { className: 'list-item' },
      el('div', null, el('strong', null, 'المادة الأضعف (للبلوك المرن يوم الخميس)'), el('div', { className: 'card-subtitle' }, 'تظهر بطاقتها الإرشادية تلقائياً أثناء المذاكرة')),
      el(
        'select',
        {
          dataset: { focusId: 'settings-study-weakest-select' },
          className: 'select focusable',
          style: 'max-width:180px;',
          onChange: (e) =>
            store.updateAppState((p) => ({
              ...p,
              settings: { ...p.settings, study: { ...p.settings.study, weakestSubject: e.target.value } },
            })),
        },
        ...STUDY_SUBJECTS.map((subj) =>
          el('option', { value: subj, selected: (studySettings.weakestSubject || 'عربي') === subj }, subj)
        )
      )
    ),
    makeToggleRow(
      'الترحيل التلقائي لبلوكات المذاكرة وقت الصلاة',
      'يوقف المؤقت قبل الأذان بدقيقتين ويزيح البلوكات بعد الصلاة تلقائياً',
      Boolean(studySettings.autoShiftOnPrayer),
      () =>
        store.updateAppState((p) => ({
          ...p,
          settings: { ...p.settings, study: { ...p.settings.study, autoShiftOnPrayer: !p.settings.study.autoShiftOnPrayer } },
        }))
    ),
    el(
      'div',
      { className: 'list-item' },
      el('div', null, el('strong', null, 'وضع رمضان الدراسي'), el('div', { className: 'card-subtitle' }, 'يرحّل بلوكات العصر إلى ما بعد التراويح أو قبل الفجر')),
      el(
        'div',
        { style: 'display:flex;gap:6px;flex-wrap:wrap;' },
        ...[
          { id: 'auto', label: 'تلقائي في رمضان' },
          { id: 'on', label: 'مفعّل' },
          { id: 'off', label: 'معطل' },
        ].map((opt) =>
          el(
            'button',
            {
              type: 'button',
              dataset: { focusId: `settings-study-ramadan-${opt.id}` },
              className: `btn btn--sm focusable ${(studySettings.ramadanMode || 'auto') === opt.id ? 'btn--primary' : ''}`,
              onClick: () =>
                store.updateAppState((p) => ({
                  ...p,
                  settings: { ...p.settings, study: { ...p.settings.study, ramadanMode: opt.id } },
                })),
            },
            opt.label
          )
        )
      )
    ),
    el(
      'div',
      { className: 'list-item' },
      el('div', null, el('strong', null, 'فترة المذاكرة في وضع رمضان')),
      el(
        'div',
        { style: 'display:flex;gap:6px;' },
        el(
          'button',
          {
            type: 'button',
            dataset: { focusId: 'settings-study-window-taraweeh' },
            className: `btn btn--sm focusable ${(studySettings.ramadanWindow || 'after_taraweeh') === 'after_taraweeh' ? 'btn--primary' : ''}`,
            onClick: () =>
              store.updateAppState((p) => ({
                ...p,
                settings: { ...p.settings, study: { ...p.settings.study, ramadanWindow: 'after_taraweeh' } },
              })),
          },
          'بعد التراويح'
        ),
        el(
          'button',
          {
            type: 'button',
            dataset: { focusId: 'settings-study-window-fajr' },
            className: `btn btn--sm focusable ${studySettings.ramadanWindow === 'before_fajr' ? 'btn--primary' : ''}`,
            onClick: () =>
              store.updateAppState((p) => ({
                ...p,
                settings: { ...p.settings, study: { ...p.settings.study, ramadanWindow: 'before_fajr' } },
              })),
          },
          'قبل الفجر'
        )
      )
    ),
    el(
      'div',
      { className: 'list-item' },
      el(
        'div',
        null,
        el('strong', null, 'مزامنة الوقت ومعامل الانحراف (Time Drift)'),
        el(
          'div',
          { className: 'card-subtitle tabular-nums' },
          `الانحراف المحفوظ: ${toArabicDigits(driftSeconds)} ثانية${appState.cache?.timeDrift?.source ? ` · المصدر: ${appState.cache.timeDrift.source}` : ''}`
        )
      ),
      el(
        'button',
        {
          type: 'button',
          dataset: { focusId: 'settings-sync-drift' },
          className: 'btn btn--sm focusable',
          onClick: () => store.syncExternalData(true),
        },
        'مزامنة الآن'
      )
    ),
  ]);

  // ٣. العادات والمحتوى
  const contentPrefCard = toggleCard('٣. العادات والمحتوى والطقس', [
    makeToggleRow('تضمين بند شرب الماء في العادات', null, settings.habits.enableWater, () =>
      store.updateAppState((p) => ({
        ...p,
        settings: { ...p.settings, habits: { ...p.settings.habits, enableWater: !p.settings.habits.enableWater } },
      }))
    ),
    makeToggleRow('تضمين بند الحركة في العادات', null, settings.habits.enableMovement, () =>
      store.updateAppState((p) => ({
        ...p,
        settings: { ...p.settings, habits: { ...p.settings.habits, enableMovement: !p.settings.habits.enableMovement } },
      }))
    ),
    makeToggleRow('إظهار المفردات التعليمية الثلاث', null, settings.display.showEducationalWords, () =>
      store.updateAppState((p) => ({
        ...p,
        settings: { ...p.settings, display: { ...p.settings.display, showEducationalWords: !p.settings.display.showEducationalWords } },
      }))
    ),
    makeToggleRow('عرض الطقس في الشريط العلوي', null, settings.display.showWeather, () =>
      store.updateAppState((p) => ({
        ...p,
        settings: { ...p.settings, display: { ...p.settings.display, showWeather: !p.settings.display.showWeather } },
      }))
    ),
  ]);

  // ٤. النسخ الاحتياطي واستعادة البيانات + سجل النظام
  const fileInput = el('input', {
    type: 'file',
    accept: '.json,application/json',
    className: 'sr-only',
    onChange: async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      if (file.size > 2_000_000) {
        store.pushToast('حجم الملف المختار كبير جداً (الحد الأقصى ٢ ميجابايت).', 'danger', 6000);
        e.target.value = '';
        return;
      }
      const text = await file.text();
      const validated = parseAndValidateBackup(text);
      if (!validated.ok) {
        store.pushToast(validated.error, 'danger', 7000);
        e.target.value = '';
        return;
      }

      store.setModal({
        title: 'تأكيد استعادة النسخة الاحتياطية',
        body: 'تنبيه: سيؤدي هذا الإجراء إلى استبدال الإعدادات والمهام وسجل العادات الحالية بالبيانات الموجودة في الملف.',
        detailsNode: el(
          'div',
          { className: 'card', style: 'background:var(--bg-subtle);' },
          el('div', null, `تاريخ التصدير: ${new Date(validated.exportedAt).toLocaleString('ar-EG')}`),
          el('div', null, `عدد المهام: ${toArabicDigits(validated.summary.tasksCount)}`),
          el('div', null, `أيام سجل العادات: ${toArabicDigits(validated.summary.habitDaysCount)}`),
          el('div', null, `جلسات التركيز: ${toArabicDigits(validated.summary.focusSessionsCount)}`)
        ),
        confirmLabel: 'استبدال البيانات الآن',
        confirmDanger: true,
        onConfirm: () => {
          store.updateAppState((prev) => mergeRestoredBackup(prev, validated));
          store.pushToast('تمت استعادة النسخة الاحتياطية بنجاح.', 'info');
        },
      });
      e.target.value = '';
    },
  });

  const backupAndSystemCard = el(
    'section',
    { className: 'card' },
    el('h2', { className: 'card-title' }, '٤. النسخ الاحتياطي ومعلومات النظام'),
    fileInput,
    el(
      'div',
      { style: 'display:flex;gap:10px;flex-wrap:wrap;' },
      el(
        'button',
        {
          type: 'button',
          dataset: { focusId: 'settings-backup-export' },
          className: 'btn btn--primary focusable',
          onClick: () => {
            const json = exportBackupJson(appState);
            const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `jawoo-backup-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            store.pushToast('تم تصدير ملف النسخة الاحتياطية بصيغة JSON.', 'info');
          },
        },
        'تصدير نسخة احتياطية (JSON)'
      ),
      el(
        'button',
        {
          type: 'button',
          dataset: { focusId: 'settings-backup-import' },
          className: 'btn focusable',
          onClick: () => fileInput.click(),
        },
        'استيراد نسخة احتياطية'
      ),
      el(
        'button',
        {
          type: 'button',
          dataset: { focusId: 'settings-open-diagnostics' },
          className: 'btn focusable',
          onClick: () => store.navigate('diagnostics'),
        },
        'شاشة فحص التلفاز'
      ),
      el(
        'button',
        {
          type: 'button',
          dataset: { focusId: 'settings-reset-defaults' },
          className: 'btn btn--danger focusable',
          onClick: () =>
            store.setModal({
              title: 'إعادة ضبط المصنع',
              body: 'هل تريد إعادة جميع الإعدادات والمهام إلى القيم الافتراضية؟ يُنصح بتصدير نسخة احتياطية أولاً.',
              confirmLabel: 'إعادة الضبط',
              confirmDanger: true,
              onConfirm: () => store.resetAllToDefaults(),
            }),
        },
        'استعادة الافتراضي'
      )
    ),
    el(
      'div',
      { className: 'card-subtitle', style: 'margin-top:8px;' },
      `إصدار بنية البيانات: ${toArabicDigits(appState.schemaVersion)} · حالة التخزين المحلي: ${runtime.storageAvailable ? 'متاح ويعمل' : 'غير متاح'}`
    ),
    (appState.systemLog || []).length > 0
      ? el(
          'div',
          { style: 'margin-top:8px;' },
          el('strong', { className: 'card-subtitle' }, 'آخر ملاحظات النظام (للمطور):'),
          el(
            'div',
            { className: 'list-stack', style: 'margin-top:4px;' },
            ...appState.systemLog.slice(-4).reverse().map((log) =>
              el('div', { className: 'meta-source' }, `${new Date(log.at).toLocaleTimeString('ar-EG')}: ${log.message}`)
            )
          )
        )
      : null
  );

  // ٣.٦ شاشة التوقف والخلفيات المتحركة
  const ssSettings = settings.screensaver || {};
  const bgCatalog = getDiscoveredBackgrounds();
  const activePresetMeta = getPresetById(ssSettings.preset);
  const ssPreviewData = formatScreensaverData({
    nowMs: runtime.nowMs,
    settings,
    weatherSnapshot: runtime.weatherSnapshot,
    prayerState: runtime.prayerState,
  });

  const bgSelectValue =
    ssSettings.backgroundMode === 'ambient'
      ? '__ambient__'
      : ssSettings.backgroundMode === 'single' && ssSettings.selectedBackground
        ? ssSettings.selectedBackground
        : '__auto_rotate__';

  const screensaverCard = el(
    'section',
    { className: 'card', dataset: { rowKey: 'settings-card-screensaver' } },
    el(
      'div',
      { className: 'card-head' },
      el('h2', { className: 'card-title' }, '٣.٦ شاشة التوقف والخلفيات المتحركة'),
      el(
        'button',
        {
          type: 'button',
          dataset: { focusId: 'settings-ss-preview-btn' },
          className: 'btn btn--primary btn--sm focusable',
          onClick: () => store.screensaverActions.enterPreview(),
        },
        'معاينة شاشة التوقف الآن'
      )
    ),
    el(
      'div',
      { className: 'list-stack' },
      makeToggleRow(
        'تفعيل شاشة التوقف التلقائية',
        'تعمل تلقائياً عند الخمول وتعود بالضغطة الأولى من الريموت',
        ssSettings.enabled !== false,
        () =>
          store.updateAppState((p) => ({
            ...p,
            settings: {
              ...p.settings,
              screensaver: { ...p.settings.screensaver, enabled: p.settings.screensaver?.enabled === false },
            },
          }))
      ),
      makeToggleRow(
        'تعتيم تلقائي وإيقاف الفيديو ليلاً (بعد ١٠:٣٠ م)',
        'لتوفير طاقة التلفاز وراحة العين أثناء وضع النوم الليلي',
        ssSettings.nightDimmingEnabled !== false,
        () =>
          store.updateAppState((p) => ({
            ...p,
            settings: {
              ...p.settings,
              screensaver: {
                ...p.settings.screensaver,
                nightDimmingEnabled: p.settings.screensaver?.nightDimmingEnabled === false,
              },
            },
          }))
      ),
      el(
        'div',
        { className: 'list-item' },
        el('div', null, el('strong', null, 'مدة الانتظار قبل التشغيل')),
        el(
          'div',
          { style: 'display:flex;gap:6px;flex-wrap:wrap;' },
          ...IDLE_DURATION_OPTIONS.map((opt) =>
            el(
              'button',
              {
                type: 'button',
                'aria-pressed': (ssSettings.idleSeconds || 60) === opt.seconds ? 'true' : 'false',
                dataset: { focusId: `settings-ss-idle-${opt.seconds}` },
                className: `btn btn--sm focusable ${(ssSettings.idleSeconds || 60) === opt.seconds ? 'btn--primary' : ''}`,
                onClick: () =>
                  store.updateAppState((p) => ({
                    ...p,
                    settings: {
                      ...p.settings,
                      screensaver: { ...p.settings.screensaver, idleSeconds: opt.seconds },
                    },
                  })),
              },
              opt.label
            )
          )
        )
      ),
      el(
        'div',
        { className: 'list-item' },
        el(
          'div',
          null,
          el('strong', null, 'اختيار الخلفية المتحركة (Animated backgrounds)'),
          el(
            'div',
            { className: 'card-subtitle' },
            bgCatalog.length > 0
              ? `تم اكتشاف ${toArabicDigits(bgCatalog.length)} ملفات تلقائياً داخل المجلد`
              : 'المجلد فارغ حالياً — تعمل الخلفية المبرمجة الهادئة تلقائياً'
          )
        ),
        el(
          'select',
          {
            dataset: { focusId: 'settings-ss-bg-select' },
            className: 'select focusable',
            style: 'max-width:340px;',
            onChange: (e) => {
              const val = e.target.value;
              store.updateAppState((p) => {
                if (val === '__auto_rotate__') {
                  return {
                    ...p,
                    settings: {
                      ...p.settings,
                      screensaver: { ...p.settings.screensaver, backgroundMode: 'auto_rotate' },
                    },
                  };
                }
                if (val === '__ambient__') {
                  return {
                    ...p,
                    settings: {
                      ...p.settings,
                      screensaver: { ...p.settings.screensaver, backgroundMode: 'ambient' },
                    },
                  };
                }
                return {
                  ...p,
                  settings: {
                    ...p.settings,
                    screensaver: {
                      ...p.settings.screensaver,
                      backgroundMode: 'single',
                      selectedBackground: val,
                    },
                  },
                };
              });
            },
          },
          el('option', { value: '__auto_rotate__', selected: bgSelectValue === '__auto_rotate__' }, 'تبديل تلقائي بين جميع الخلفيات كل ٥ دقائق'),
          ...bgCatalog.map((bg) =>
            el('option', { value: bg.filename, selected: bgSelectValue === bg.filename }, `${bg.label} (${bg.ext.replace('.', '').toUpperCase()})`)
          ),
          el('option', { value: '__ambient__', selected: bgSelectValue === '__ambient__' }, 'خلفية هادئة مدمجة بدون فيديو')
        )
      ),
      el(
        'div',
        { className: 'list-item', style: 'flex-direction:column;align-items:stretch;gap:10px;' },
        el(
          'div',
          { style: 'display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;' },
          el('strong', null, 'النمط الفني الموحد (يتغير التكوين والخطوط معاً)'),
          el('span', { className: 'card-subtitle' }, activePresetMeta.description)
        ),
        el(
          'div',
          { style: 'display:flex;gap:8px;flex-wrap:wrap;' },
          ...SCREENSAVER_PRESETS.map((preset) =>
            el(
              'button',
              {
                type: 'button',
                'aria-pressed': (ssSettings.preset || 'royal_ruqah') === preset.id ? 'true' : 'false',
                dataset: { focusId: `settings-ss-preset-${preset.id}` },
                className: `btn btn--sm focusable ${(ssSettings.preset || 'royal_ruqah') === preset.id ? 'btn--primary' : ''}`,
                onClick: () =>
                  store.updateAppState((p) => ({
                    ...p,
                    settings: {
                      ...p.settings,
                      screensaver: { ...p.settings.screensaver, preset: preset.id },
                    },
                  })),
              },
              preset.name
            )
          )
        ),
        el(
          'div',
          { className: 'ss-mini-preview', dataset: { preset: activePresetMeta.id } },
          el('div', { className: 'ss-ambient-fallback' }),
          el('div', { className: 'ss-scrim' }),
          el('div', { className: 'ss-stage' }, renderScreensaverPresetStage(activePresetMeta.id, ssPreviewData))
        )
      )
    )
  );

  // ٣.٧ القرآن الكريم ووضع النوم
  const qSettings = settings.quran || {};
  const quranSleepCard = toggleCard('القرآن الكريم ووضع النوم (الحصري المجوّد)', [
    makeToggleRow(
      'تشغيل القرآن تلقائياً في وضع النوم (١٠:٣٠ م)',
      'يحوّل الشاشة للخلفية المتحركة المعتمة مع تلاوة الشيخ الحصري المجوّد',
      Boolean(qSettings.autoPlayOnSleep),
      () =>
        store.updateAppState((p) => ({
          ...p,
          settings: { ...p.settings, quran: { ...p.settings.quran, autoPlayOnSleep: !p.settings.quran?.autoPlayOnSleep } },
        }))
    ),
    el(
      'div',
      { className: 'list-item' },
      el('div', null, el('strong', null, 'وضع التلاوة عند النوم')),
      el(
        'div',
        { style: 'display:flex;gap:6px;flex-wrap:wrap;' },
        ...[
          { id: 'single', label: 'السورة المختارة' },
          { id: 'playlist', label: 'قائمة سور النوم' },
          { id: 'khatmah', label: 'الختمة المتتابعة' },
        ].map((m) =>
          el(
            'button',
            {
              type: 'button',
              dataset: { focusId: `settings-quran-sleep-mode-${m.id}` },
              className: `btn btn--sm focusable ${(qSettings.sleepMode || 'playlist') === m.id ? 'btn--primary' : ''}`,
              onClick: () =>
                store.updateAppState((p) => ({
                  ...p,
                  settings: { ...p.settings, quran: { ...p.settings.quran, sleepMode: m.id } },
                })),
            },
            m.label
          )
        )
      )
    ),
    el(
      'div',
      { className: 'list-item' },
      el('div', null, el('strong', null, 'مؤقت إغلاق الصوت التلقائي في النوم'), el('div', { className: 'card-subtitle' }, 'يخفض الصوت تدريجياً ثم يوقفه مع إبقاء الخلفية هادئة')),
      el(
        'div',
        { style: 'display:flex;gap:6px;flex-wrap:wrap;' },
        ...[
          { m: 15, label: '١٥ دقيقة' },
          { m: 30, label: '٣٠ دقيقة' },
          { m: 45, label: '٤٥ دقيقة' },
          { m: 60, label: 'ساعة' },
          { m: 0, label: 'مستمر حتى الفجر' },
        ].map((opt) =>
          el(
            'button',
            {
              type: 'button',
              dataset: { focusId: `settings-quran-sleep-timer-${opt.m}` },
              className: `btn btn--sm focusable ${(qSettings.sleepTimerMinutes ?? 30) === opt.m ? 'btn--primary' : ''}`,
              onClick: () =>
                store.updateAppState((p) => ({
                  ...p,
                  settings: { ...p.settings, quran: { ...p.settings.quran, sleepTimerMinutes: opt.m } },
                })),
            },
            opt.label
          )
        )
      )
    ),
    el(
      'div',
      { className: 'list-item' },
      el('strong', null, `مستوى صوت النوم الهادئ: ${toArabicDigits(Math.round((qSettings.sleepVolume ?? 0.35) * 100))}٪`),
      el(
        'div',
        { style: 'display:flex;gap:8px;align-items:center;' },
        el(
          'button',
          {
            type: 'button',
            dataset: { focusId: 'settings-quran-sleep-vol-down' },
            className: 'btn btn--sm focusable',
            onClick: () =>
              store.updateAppState((p) => ({
                ...p,
                settings: {
                  ...p.settings,
                  quran: { ...p.settings.quran, sleepVolume: Math.max(0.1, Number(((p.settings.quran?.sleepVolume ?? 0.35) - 0.1).toFixed(2))) },
                },
              })),
          },
          'خفض'
        ),
        el(
          'button',
          {
            type: 'button',
            dataset: { focusId: 'settings-quran-sleep-vol-up' },
            className: 'btn btn--sm focusable',
            onClick: () =>
              store.updateAppState((p) => ({
                ...p,
                settings: {
                  ...p.settings,
                  quran: { ...p.settings.quran, sleepVolume: Math.min(0.8, Number(((p.settings.quran?.sleepVolume ?? 0.35) + 0.1).toFixed(2))) },
                },
              })),
          },
          'رفع'
        ),
        el(
          'button',
          {
            type: 'button',
            dataset: { focusId: 'settings-quran-manage-btn' },
            className: 'btn btn--primary btn--sm focusable',
            onClick: () => store.navigate('quran'),
          },
          'إدارة السور والتحميل'
        )
      )
    ),
  ]);

  // ٣.٨ قيام الليل الاختياري
  const qiyamSettings = settings.qiyam || {};
  const qiyamTimes = runtime.qiyamTimes;
  const qiyamCard = toggleCard('قيام الليل الاختياري (الثلث الأخير)', [
    makeToggleRow(
      'تفعيل تذكير قيام الليل',
      qiyamTimes
        ? `بداية الثلث الأخير الليلة: ${toArabicDigits(qiyamTimes.lastThirdHHMM)} · موعد التذكير: ${toArabicDigits(qiyamTimes.reminderHHMM)}`
        : 'يحسب الثلث الأخير تلقائياً بين المغرب والفجر',
      Boolean(qiyamSettings.enabled),
      () =>
        store.updateAppState((p) => ({
          ...p,
          settings: { ...p.settings, qiyam: { ...p.settings.qiyam, enabled: !p.settings.qiyam?.enabled } },
        }))
    ),
    el(
      'div',
      { className: 'list-item' },
      el('div', null, el('strong', null, 'توقيت التنبيه')),
      el(
        'div',
        { style: 'display:flex;gap:6px;flex-wrap:wrap;' },
        el(
          'button',
          {
            type: 'button',
            dataset: { focusId: 'settings-qiyam-last-third' },
            className: `btn btn--sm focusable ${(qiyamSettings.mode || 'last_third') === 'last_third' ? 'btn--primary' : ''}`,
            onClick: () =>
              store.updateAppState((p) => ({
                ...p,
                settings: { ...p.settings, qiyam: { ...p.settings.qiyam, mode: 'last_third' } },
              })),
          },
          'بداية الثلث الأخير تلقائياً'
        ),
        ...[30, 45, 60].map((mins) =>
          el(
            'button',
            {
              type: 'button',
              dataset: { focusId: `settings-qiyam-before-fajr-${mins}` },
              className: `btn btn--sm focusable ${qiyamSettings.mode === 'before_fajr' && (qiyamSettings.beforeFajrMinutes || 45) === mins ? 'btn--primary' : ''}`,
              onClick: () =>
                store.updateAppState((p) => ({
                  ...p,
                  settings: {
                    ...p.settings,
                    qiyam: { ...p.settings.qiyam, mode: 'before_fajr', beforeFajrMinutes: mins },
                  },
                })),
            },
            `قبل الفجر بـ ${toArabicDigits(mins)} د`
          )
        )
      )
    ),
    el(
      'div',
      { className: 'card', style: 'background:var(--bg-subtle);' },
      el('span', { className: 'card-subtitle', style: 'color:var(--text-primary);' }, `«${QIYAM_HADITH.text}»`),
      el('span', { className: 'meta-source' }, `${QIYAM_HADITH.source} — ${QIYAM_HADITH.grade}`)
    ),
  ]);

  const pwaStatus = runtime.pwaStatus || {};
  const installCard = el(
    'section',
    {
      className: 'card',
      style: 'border:2px solid var(--accent-primary, #1B4D3E);background:linear-gradient(135deg, rgba(27,77,62,0.06), rgba(217,172,86,0.06));',
    },
    el(
      'div',
      { className: 'card-head', style: 'display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;' },
      el(
        'div',
        null,
        el('h2', { className: 'card-title' }, 'تثبيت التطبيق والصلاحيات'),
        el(
          'div',
          { className: 'card-subtitle' },
          'ثبّت «جووو» على الشاشة الرئيسية للتلفاز بوضع ملء الشاشة مع تفعيل حفظ البيانات الدائم وصلاحية الصوت تلقائياً.'
        )
      ),
      el(
        'div',
        { style: 'display:flex;gap:8px;flex-wrap:wrap;' },
        el(
          'span',
          { className: `badge ${pwaStatus.isStandalone ? 'badge--success' : ''}` },
          pwaStatus.isStandalone ? 'الوضع: مستقل ومثبت ✓' : pwaStatus.canPromptInstall ? 'جاهز للتثبيت المباشر' : 'وضع المتصفح'
        ),
        el(
          'span',
          { className: `badge ${pwaStatus.storagePersisted ? 'badge--success' : ''}` },
          pwaStatus.storagePersisted ? 'التخزين الدائم: مفعّل ✓' : 'التخزين الدائم: غير مؤكد'
        )
      )
    ),
    el(
      'div',
      { style: 'display:flex;gap:10px;flex-wrap:wrap;align-items:center;' },
      el(
        'button',
        {
          type: 'button',
          dataset: { focusId: 'settings-pwa-install-btn' },
          className: 'btn btn--primary focusable',
          onClick: () => store.pwaActions?.installAndGrantPermissions?.(),
        },
        pwaStatus.checkingInstall
          ? 'جاري طلب الصلاحيات والتثبيت...'
          : pwaStatus.isStandalone
          ? 'التطبيق مثبت ويعمل في الوضع المستقل ✓'
          : 'تثبيت تطبيق جووو على الشاشة الرئيسية'
      ),
      el(
        'button',
        {
          type: 'button',
          dataset: { focusId: 'settings-pwa-refresh-btn' },
          className: 'btn btn--sm focusable',
          onClick: () => store.pwaActions?.refreshStatus?.(),
        },
        'تحديث حالة الصلاحيات'
      )
    )
  );

  const activeTab = runtime.settingsTab || 'all';
  const tabsBar = el(
    'div',
    { style: 'display:flex;gap:8px;flex-wrap:wrap;' },
    ...[
      { id: 'all', label: 'عرض الكل' },
      { id: 'location_display', label: 'الموقع والصلاة والمظهر' },
      { id: 'study', label: 'جدول المذاكرة' },
      { id: 'quran_sleep', label: 'القرآن ووضع النوم' },
      { id: 'screensaver', label: 'شاشة التوقف والخلفيات' },
      { id: 'qiyam_alerts', label: 'قيام الليل والتنبيهات' },
      { id: 'backup_system', label: 'النسخ الاحتياطي والفحص' },
    ].map((t) =>
      el(
        'button',
        {
          type: 'button',
          'aria-pressed': activeTab === t.id ? 'true' : 'false',
          dataset: { focusId: `settings-tab-${t.id}` },
          className: `btn btn--sm focusable ${activeTab === t.id ? 'btn--primary' : ''}`,
          onClick: () => store.setSettingsTab(t.id),
        },
        t.label
      )
    )
  );

  const show = (tabKey) => activeTab === 'all' || activeTab === tabKey;

  return el(
    'div',
    { className: 'page-stack' },
    renderSubpageHeader('الإعدادات والنسخ الاحتياطي', 'إعدادات منظمة بالبطاقات لسهولة التحكم بالريموت', store),
    installCard,
    tabsBar,
    show('location_display') ? displayCard : null,
    show('study') ? studyScheduleCard : null,
    show('quran_sleep') ? quranSleepCard : null,
    show('screensaver') ? screensaverCard : null,
    show('qiyam_alerts') ? el('div', { className: 'grid-2' }, qiyamCard, alertsCard) : null,
    show('qiyam_alerts') ? contentPrefCard : null,
    show('backup_system') ? backupAndSystemCard : null
  );
}
