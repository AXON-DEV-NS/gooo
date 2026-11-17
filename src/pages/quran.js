import { el } from '../components/dom.js';
import { icon } from '../components/icons.js';
import { renderSubpageHeader } from '../components/nav-bar.js';
import { QURAN_SURAHS, getSurahByNumber } from '../data/quran-surahs.js';
import { pad2, toArabicDigits } from '../services/clock.js';
import { formatBytesAr } from '../services/quran-storage.js';

function formatAudioSeconds(sec) {
  const s = Math.max(0, Math.floor(Number(sec) || 0));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${toArabicDigits(pad2(m))}:${toArabicDigits(pad2(rem))}`;
}

export function renderQuranPage(snapshot, store) {
  const { appState, runtime } = snapshot;
  const qSettings = appState.settings.quran || {};
  const qState = runtime.quranState;
  const downloads = runtime.quranDownloads;
  const currentSurah = getSurahByNumber(qState.surahNumber || qSettings.selectedSurah || 1);
  const localSet = new Set(downloads.localBundled || []);

  const progressPct =
    qState.durationSec > 0
      ? Math.min(100, Math.round((qState.currentTimeSec / qState.durationSec) * 100))
      : 0;

  const sourceLabel =
    qState.sourceType === 'local'
      ? 'ملف محلي'
      : qState.sourceType === 'indexeddb'
        ? 'محفوظ بدون إنترنت ✓'
        : 'بث مباشر (MP3Quran / Archive)';

  // ١. المشغل الصوتي الكبير المريح للريموت
  const playerCard = el(
    'section',
    { className: 'card card--hero' },
    el(
      'div',
      { className: 'card-head' },
      el(
        'div',
        null,
        el('h2', { className: 'card-title' }, icon('book', 22), `سورة ${currentSurah.name} (${toArabicDigits(currentSurah.number)})`),
        el(
          'div',
          { className: 'card-subtitle' },
          `الشيخ محمود خليل الحصري (المصحف المجوّد) · ${currentSurah.type} · ${toArabicDigits(currentSurah.ayahs)} آية`
        )
      ),
      el(
        'div',
        { style: 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;' },
        qState.isInterrupted
          ? el('span', { className: 'badge badge--warning' }, 'متوقف مؤقتاً للأذان/التنبيه — سيستأنف تلقائياً')
          : null,
        el('span', { className: 'badge badge--primary' }, sourceLabel)
      )
    ),
    el(
      'div',
      { style: 'display:flex;align-items:center;gap:12px;' },
      el('span', { className: 'tabular-nums card-subtitle' }, formatAudioSeconds(qState.currentTimeSec)),
      el(
        'div',
        { className: 'progress-track', style: 'flex:1;' },
        el('div', { className: 'progress-fill', style: `width: ${progressPct}%` })
      ),
      el('span', { className: 'tabular-nums card-subtitle' }, formatAudioSeconds(qState.durationSec))
    ),
    qState.error ? el('div', { className: 'badge badge--danger', style: 'white-space:normal;' }, qState.error) : null,
    el(
      'div',
      { style: 'display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:6px;' },
      el(
        'button',
        { type: 'button', className: 'btn focusable', onClick: () => store.quranActions.prevSurah() },
        'السورة السابقة'
      ),
      el(
        'button',
        {
          type: 'button',
          className: 'btn btn--primary focusable',
          onClick: () =>
            qState.isPlaying || qState.currentTimeSec > 0
              ? store.quranActions.togglePlayPause()
              : store.quranActions.playSurah(currentSurah.number),
        },
        icon(qState.isPlaying ? 'pause' : 'play', 18),
        qState.isLoading ? 'جاري التحميل...' : qState.isPlaying ? 'إيقاف مؤقت' : 'تشغيل التلاوة'
      ),
      el(
        'button',
        { type: 'button', className: 'btn focusable', onClick: () => store.quranActions.nextSurah() },
        'السورة التالية'
      ),
      el(
        'button',
        { type: 'button', className: 'btn btn--danger focusable', onClick: () => store.quranActions.stop() },
        'إيقاف كامل'
      ),
      el(
        'button',
        {
          type: 'button',
          className: 'btn btn--sm focusable',
          onClick: () => store.quranActions.setVolume((qSettings.volume ?? 0.75) - 0.15),
        },
        'خفض الصوت'
      ),
      el('span', { className: 'badge tabular-nums', style: 'align-self:center;' }, `${toArabicDigits(Math.round((qSettings.volume ?? 0.75) * 100))}٪`),
      el(
        'button',
        {
          type: 'button',
          className: 'btn btn--sm focusable',
          onClick: () => store.quranActions.setVolume((qSettings.volume ?? 0.75) + 0.15),
        },
        'رفع الصوت'
      )
    ),
    // أوضاع التشغيل والتكرار ومؤقت النوم
    el(
      'div',
      { style: 'display:flex;gap:14px;flex-wrap:wrap;justify-content:space-between;padding-top:8px;border-top:1px solid var(--border-subtle);' },
      el(
        'div',
        { style: 'display:flex;gap:6px;flex-wrap:wrap;align-items:center;' },
        el('span', { className: 'card-subtitle' }, 'الوضع:'),
        ...[
          { id: 'single', label: 'سورة واحدة' },
          { id: 'playlist', label: 'قائمة السور المخصصة' },
          { id: 'khatmah', label: 'الختمة المتتابعة' },
        ].map((m) =>
          el(
            'button',
            {
              type: 'button',
              'aria-pressed': qSettings.mode === m.id ? 'true' : 'false',
              dataset: { focusId: `quran-mode-${m.id}` },
              className: `btn btn--sm focusable ${qSettings.mode === m.id ? 'btn--primary' : ''}`,
              onClick: () =>
                store.updateAppState((p) => ({
                  ...p,
                  settings: { ...p.settings, quran: { ...p.settings.quran, mode: m.id } },
                })),
            },
            m.label
          )
        )
      ),
      qSettings.mode === 'single'
        ? el(
            'div',
            { style: 'display:flex;gap:6px;flex-wrap:wrap;align-items:center;' },
            el('span', { className: 'card-subtitle' }, 'التكرار:'),
            ...[
              { id: 'once', label: 'مرة' },
              { id: '3', label: '٣ مرات' },
              { id: '5', label: '٥ مرات' },
              { id: 'loop', label: 'تكرار مستمر' },
            ].map((r) =>
              el(
                'button',
                {
                  type: 'button',
                  'aria-pressed': qSettings.repeatMode === r.id ? 'true' : 'false',
                  dataset: { focusId: `quran-repeat-${r.id}` },
                  className: `btn btn--sm focusable ${qSettings.repeatMode === r.id ? 'btn--gold' : ''}`,
                  onClick: () =>
                    store.updateAppState((p) => ({
                      ...p,
                      settings: { ...p.settings, quran: { ...p.settings.quran, repeatMode: r.id } },
                    })),
                },
                r.label
              )
            )
          )
        : null,
      el(
        'div',
        { style: 'display:flex;gap:6px;flex-wrap:wrap;align-items:center;' },
        el('span', { className: 'card-subtitle' }, 'مؤقت إغلاق الصوت:'),
        ...[
          { m: -1, label: 'بلا مؤقت' },
          { m: 15, label: '١٥ د' },
          { m: 30, label: '٣٠ د' },
          { m: 45, label: '٤٥ د' },
          { m: 60, label: 'ساعة' },
          { m: 0, label: 'حتى الفجر' },
        ].map((t) => {
          const isSet =
            t.m === -1
              ? !qState.sleepTimerEndsAtMs
              : qSettings.sleepTimerMinutes === t.m && Boolean(qState.sleepTimerEndsAtMs);
          return el(
            'button',
            {
              type: 'button',
              'aria-pressed': isSet ? 'true' : 'false',
              dataset: { focusId: `quran-timer-${t.m}` },
              className: `btn btn--sm focusable ${isSet ? 'btn--primary' : ''}`,
              onClick: () => store.quranActions.setSleepTimer(t.m),
            },
            t.label
          );
        })
      )
    )
  );

  // ٢. إدارة التحميل والعمل بدون إنترنت
  const bp = downloads.batchProgress;
  const offlineCount = new Set([
    ...Object.keys(downloads.map || {}).map(Number),
    ...(downloads.localBundled || []),
  ]).size;

  const downloadCard = el(
    'section',
    { className: 'card' },
    el(
      'div',
      { className: 'card-head' },
      el('h2', { className: 'card-title' }, 'التحميل للعمل بدون إنترنت (IndexedDB)'),
      el(
        'span',
        { className: 'badge badge--success tabular-nums' },
        `متاح محلياً: ${toArabicDigits(offlineCount)} / ١١٤ سورة (${formatBytesAr(downloads.totalBytes)})`
      )
    ),
    bp
      ? el(
          'div',
          { style: 'display:flex;flex-direction:column;gap:8px;' },
          el(
            'div',
            { className: 'progress-track' },
            el('div', {
              className: 'progress-fill',
              style: `width: ${bp.total > 0 ? Math.round((bp.completed / bp.total) * 100) : 0}%`,
            })
          ),
          el(
            'div',
            { style: 'display:flex;justify-content:space-between;align-items:center;' },
            el(
              'span',
              { className: 'card-subtitle tabular-nums' },
              `جاري تنزيل سورة ${getSurahByNumber(bp.currentSurah).name} (${toArabicDigits(bp.completed)} من ${toArabicDigits(bp.total)})`
            ),
            el(
              'button',
              { type: 'button', className: 'btn btn--danger btn--sm focusable', onClick: () => store.quranActions.cancelDownload() },
              'إلغاء التنزيل'
            )
          )
        )
      : el(
          'div',
          { style: 'display:flex;gap:10px;flex-wrap:wrap;' },
          el(
            'button',
            {
              type: 'button',
              className: 'btn btn--primary btn--sm focusable',
              onClick: () => store.quranActions.downloadSurahs(qSettings.playlist || [67, 32, 18, 2]),
            },
            'تنزيل السور المختارة (القائمة)'
          ),
          el(
            'button',
            {
              type: 'button',
              className: 'btn btn--sm focusable',
              onClick: () => store.quranActions.downloadAllSurahs(),
            },
            'تنزيل المصحف المجوّد كاملاً (١١٤ سورة)'
          ),
          downloads.count > 0
            ? el(
                'button',
                {
                  type: 'button',
                  className: 'btn btn--danger btn--sm focusable',
                  onClick: () =>
                    store.setModal({
                      title: 'مسح السور المحملة',
                      body: 'هل تريد حذف جميع ملفات التلاوة المخزنة في المتصفح لتحرير المساحة؟',
                      confirmLabel: 'مسح الكل',
                      confirmDanger: true,
                      onConfirm: () => store.quranActions.clearAllDownloads(),
                    }),
                },
                'مسح الملفات المحملة'
              )
            : null
        )
  );

  // ٣. قائمة السور الـ ١١٤ مع فلترة سريعة بالريموت
  const activeFilter = runtime.quranFilter || 'all';
  const playlistSet = new Set((qSettings.playlist || []).map(Number));

  const filteredSurahs = QURAN_SURAHS.filter((s) => {
    const isOffline = Boolean(downloads.map?.[s.number]) || localSet.has(s.number);
    if (activeFilter === 'offline') return isOffline;
    if (activeFilter === 'sleep_playlist') return playlistSet.has(s.number);
    if (activeFilter === 'part1') return s.number <= 30;
    if (activeFilter === 'part2') return s.number >= 31 && s.number <= 60;
    if (activeFilter === 'part3') return s.number >= 61 && s.number <= 90;
    if (activeFilter === 'part4') return s.number >= 91;
    return true;
  });

  const listCard = el(
    'section',
    { className: 'card' },
    el(
      'div',
      { className: 'card-head' },
      el('h2', { className: 'card-title' }, 'قائمة السور'),
      el(
        'div',
        { style: 'display:flex;gap:6px;flex-wrap:wrap;' },
        ...[
          { id: 'all', label: 'الكل (١١٤)' },
          { id: 'offline', label: 'بدون إنترنت ✓' },
          { id: 'sleep_playlist', label: `قائمة السور (${toArabicDigits(playlistSet.size)})` },
          { id: 'part1', label: '١–٣٠' },
          { id: 'part2', label: '٣١–٦٠' },
          { id: 'part3', label: '٦١–٩٠' },
          { id: 'part4', label: '٩١–١١٤' },
        ].map((f) =>
          el(
            'button',
            {
              type: 'button',
              'aria-pressed': activeFilter === f.id ? 'true' : 'false',
              dataset: { focusId: `quran-filter-${f.id}` },
              className: `btn btn--sm focusable ${activeFilter === f.id ? 'btn--primary' : ''}`,
              onClick: () => store.quranActions.setFilter(f.id),
            },
            f.label
          )
        )
      )
    ),
    filteredSurahs.length === 0
      ? el('p', { className: 'card-subtitle' }, 'لا توجد سور مطابقة لهذا الفلتر حالياً.')
      : el(
          'div',
          { className: 'grid-3' },
          ...filteredSurahs.map((s) => {
            const isDownloaded = Boolean(downloads.map?.[s.number]) || localSet.has(s.number);
            const inPlaylist = playlistSet.has(s.number);
            const isActiveSurah = qState.surahNumber === s.number && qState.isPlaying;
            return el(
              'div',
              {
                className: `list-item ${isActiveSurah ? 'list-item--active' : ''}`,
                dataset: { rowKey: `surah-card-${s.number}` },
                style: 'flex-direction:column;align-items:stretch;gap:8px;',
              },
              el(
                'div',
                { style: 'display:flex;justify-content:space-between;align-items:center;gap:8px;' },
                el(
                  'div',
                  null,
                  el('strong', null, `${toArabicDigits(s.number)}. سورة ${s.name}`),
                  el('div', { className: 'card-subtitle' }, `${s.type} · ${toArabicDigits(s.ayahs)} آية`)
                ),
                isDownloaded
                  ? el('span', { className: 'badge badge--success' }, 'بدون إنترنت ✓')
                  : null
              ),
              el(
                'div',
                { style: 'display:flex;gap:6px;flex-wrap:wrap;' },
                el(
                  'button',
                  {
                    type: 'button',
                    'aria-pressed': isActiveSurah ? 'true' : 'false',
                    dataset: { focusId: `quran-surah-play-${s.number}` },
                    className: 'btn btn--primary btn--sm focusable',
                    onClick: () => store.quranActions.playSurah(s.number),
                  },
                  isActiveSurah ? 'يعمل الآن' : 'تشغيل'
                ),
                el(
                  'button',
                  {
                    type: 'button',
                    'aria-pressed': inPlaylist ? 'true' : 'false',
                    dataset: { focusId: `quran-surah-playlist-${s.number}` },
                    className: `btn btn--sm focusable ${inPlaylist ? 'btn--gold' : ''}`,
                    onClick: () => store.quranActions.togglePlaylistSurah(s.number),
                  },
                  inPlaylist ? 'في القائمة ✓' : '+ للقائمة'
                ),
                Boolean(downloads.map?.[s.number])
                  ? el(
                      'button',
                      {
                        type: 'button',
                        dataset: { focusId: `quran-surah-delete-${s.number}` },
                        className: 'btn btn--danger btn--sm focusable',
                        onClick: () => store.quranActions.deleteSurah(s.number),
                      },
                      'حذف'
                    )
                  : !localSet.has(s.number)
                    ? el(
                        'button',
                        {
                          type: 'button',
                          dataset: { focusId: `quran-surah-download-${s.number}` },
                          className: 'btn btn--sm focusable',
                          onClick: () => store.quranActions.downloadSurahs([s.number]),
                        },
                        'تنزيل'
                      )
                    : null
              )
            );
          })
        )
  );

  return el(
    'div',
    { className: 'page-stack' },
    renderSubpageHeader('القرآن الكريم — الشيخ محمود خليل الحصري', 'المصحف المجوّد الأصلي (بث مباشر + تحميل للعمل دون إنترنت)', store),
    playerCard,
    downloadCard,
    listCard
  );
}
