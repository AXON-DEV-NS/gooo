import {
  formatClock12Ar,
  formatGregorianDateAr,
  getHijriDate,
  getZonedParts,
  toArabicDigits,
} from '../services/clock.js';
import { el } from './dom.js';
import { icon } from './icons.js';

export function renderHeader(snapshot, store) {
  const { appState, runtime } = snapshot;
  const tz = appState.settings.location.timezone || 'Africa/Cairo';
  const nowDate = new Date(runtime.nowMs);
  const parts = getZonedParts(nowDate, tz);
  const hijri = getHijriDate(nowDate, tz, appState.settings.calendar?.hijriOffsetDays || 0);

  // الطقس أو البديل المحلي المفيد بعد انقضاء أكثر من ٦ ساعات بدون إنترنت
  const weatherSnap = runtime.weatherSnapshot;
  const weekly = runtime.weeklyStats;
  let weatherBadge = null;

  if (appState.settings.display.showWeather) {
    if (weatherSnap?.available && weatherSnap.data && !weatherSnap.expiredBeyondSixHours) {
      const tempTxt = `${toArabicDigits(weatherSnap.data.temperature)}°`;
      weatherBadge = el(
        'span',
        {
          className: `badge ${weatherSnap.isStale ? 'badge--warning' : 'badge--primary'}`,
          title: weatherSnap.data.fetchedAt ? `آخر تحديث: ${new Date(weatherSnap.data.fetchedAt).toLocaleTimeString('ar-EG')}` : '',
        },
        `الطقس: ${tempTxt} · ${weatherSnap.data.descriptionAr}${weatherSnap.isStale ? ' (محفوظ)' : ''}`
      );
    } else if (weekly) {
      weatherBadge = el(
        'span',
        {
          className: 'badge badge--primary',
          title: 'بديل محلي بعد غياب تحديث الطقس لأكثر من ٦ ساعات',
        },
        `إنجاز الأسبوع: ${toArabicDigits(weekly.completedHours)}/${toArabicDigits(weekly.targetHours)} س · المراكم: ${toArabicDigits(weekly.backlogRemaining)}`
      );
    }
  }

  const netLabel = runtime.online
    ? 'متصل ومزامن'
    : 'وضع العمل المحلي (بدون إنترنت) — الحساب الفلكي نشط';

  const netBadge = el(
    'span',
    {
      className: `badge ${runtime.online ? 'badge--success' : 'badge--warning'}`,
    },
    icon(runtime.online ? 'wifi' : 'wifiOff', 16),
    netLabel
  );

  const audioBtn = !runtime.audioStatus.sessionUnlocked
    ? el(
        'button',
        {
          type: 'button',
          className: 'btn btn--primary btn--sm focusable',
          onClick: () => store.audio.unlockAndTest(),
        },
        icon('volume', 16),
        'تفعيل الصوت'
      )
    : el(
        'button',
        {
          type: 'button',
          className: `btn btn--sm focusable ${runtime.audioStatus.muted ? 'btn--warning' : ''}`,
          onClick: () => store.audio.toggleMute(),
        },
        icon(runtime.audioStatus.muted ? 'mute' : 'volume', 16),
        runtime.audioStatus.muted ? 'الصوت مكتوم' : 'كتم'
      );

  const stopAudioBtn = runtime.audioStatus.isPlaying
    ? el(
        'button',
        {
          type: 'button',
          className: 'btn btn--danger btn--sm focusable',
          onClick: () => store.audio.stop(),
        },
        'إيقاف الصوت'
      )
    : null;

  const audioErrorBadge = runtime.audioStatus.lastError
    ? el('span', { className: 'badge badge--danger' }, 'تنبيه: تعذر الصوت')
    : null;

  return el(
    'header',
    { className: 'app-header' },
    el(
      'div',
      { className: 'brand-lockup' },
      el('div', { className: 'brand-mark' }, icon('brand', 22)),
      el(
        'div',
        null,
        el('div', { className: 'brand-name' }, 'جووو'),
        el('div', { className: 'card-subtitle' }, `${appState.settings.location.city}، ${appState.settings.location.governorate}`)
      )
    ),
    el(
      'div',
      { className: 'header-dates' },
      el('strong', { style: 'font-size: var(--text-sm);' }, formatGregorianDateAr(parts)),
      el('span', { className: 'card-subtitle' }, hijri.formattedAr)
    ),
    el(
      'div',
      { className: 'header-clock-box' },
      el(
        'span',
        {
          className: 'header-clock-time tabular-nums',
          dataset: { liveClock: 'header' },
        },
        formatClock12Ar(parts.hour, parts.minute)
      )
    ),
    el(
      'div',
      { className: 'header-status-group' },
      weatherBadge,
      netBadge,
      audioErrorBadge,
      stopAudioBtn,
      audioBtn
    )
  );
}
