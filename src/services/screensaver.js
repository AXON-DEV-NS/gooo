import discoveredBackgrounds from 'virtual:animated-backgrounds';
import { ANTI_BURNIN_OFFSETS } from '../data/screensaver-presets.js';
import {
  formatDurationHMS,
  getHijriDate,
  getZonedParts,
  pad2,
  toArabicDigits,
} from './clock.js';

const GREGORIAN_MONTHS_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

const PRIORITY_INTERRUPT_TYPES = new Set([
  'pre_adhan',
  'adhan',
  'iqama',
  'qiyam',
  'study_pause',
  'sleep',
  'task',
]);

export function getDiscoveredBackgrounds() {
  return Array.isArray(discoveredBackgrounds) ? discoveredBackgrounds : [];
}

export function selectActiveBackground(catalog = [], screensaverSettings = {}, rotationIndex = 0) {
  if (!Array.isArray(catalog) || catalog.length === 0) return null;
  if (screensaverSettings.backgroundMode === 'ambient') return null;

  if (screensaverSettings.backgroundMode === 'single') {
    const found = catalog.find((item) => item.filename === screensaverSettings.selectedBackground);
    return found || catalog[0];
  }

  // وضع التبديل التلقائي بين جميع الخلفيات
  const idx = Math.abs(Math.trunc(rotationIndex)) % catalog.length;
  return catalog[idx];
}

export function resolveWeatherIconKey(code) {
  const c = Number(code);
  if (c === 0 || c === 1) return 'sun';
  if (c === 45 || c === 48) return 'fog';
  if (c >= 95) return 'storm';
  if (c >= 51 && c <= 82) return 'rain';
  return 'cloud';
}

export function formatScreensaverData({
  nowMs,
  settings,
  weatherSnapshot,
  prayerState,
}) {
  const tz = settings?.location?.timezone || 'Africa/Cairo';
  const nowDate = new Date(nowMs);
  const parts = getZonedParts(nowDate, tz);
  const hijri = getHijriDate(nowDate, tz, settings?.calendar?.hijriOffsetDays || 0);

  const h12 = parts.hour % 12 === 0 ? 12 : parts.hour % 12;
  const timeDigits = `${toArabicDigits(h12)}:${toArabicDigits(pad2(parts.minute))}`;
  const periodLabel = parts.hour >= 12 ? 'مساءً' : 'صباحاً';

  const gregMonth = GREGORIAN_MONTHS_AR[(parts.month || 1) - 1] || '';
  const gregorianDateOnly = `${toArabicDigits(parts.day)} ${gregMonth} ${toArabicDigits(parts.year)} م`;
  const hijriFull = `${parts.weekdayNameAr} ${hijri.formattedAr}`;

  let weatherText = `طقس ${settings?.location?.city || 'فاقوس'}: بانتظار التحديث`;
  let weatherIconKey = 'cloud';
  if (weatherSnapshot?.available && weatherSnapshot.data && !weatherSnapshot.expiredBeyondSixHours) {
    const temp = toArabicDigits(weatherSnapshot.data.temperature);
    weatherText = `${temp}° — ${weatherSnapshot.data.descriptionAr}`;
    weatherIconKey = resolveWeatherIconKey(weatherSnapshot.data.weatherCode);
  }

  const np = prayerState?.nextPrayer;
  const nextPrayerLine = np
    ? `الصلاة القادمة: ${np.label} — بقي ${formatDurationHMS(np.remainingMs, true)}`
    : '';

  return {
    weekdayName: parts.weekdayNameAr,
    timeDigits,
    periodLabel,
    fullTimeLabel: `${timeDigits} ${periodLabel}`,
    hijriFull,
    hijriDateOnly: hijri.formattedAr,
    gregorianFull: gregorianDateOnly,
    weatherText,
    weatherIconKey,
    cityLabel: `${settings?.location?.city || 'فاقوس'}`,
    nextPrayerLine,
  };
}

export function shouldInterruptScreensaverForAlert(alertsState, focusState) {
  if (focusState?.status === 'paused_for_prayer' && focusState?.pausedForPrayer) {
    return { interrupt: true, reason: focusState.pausedForPrayer.message };
  }

  const active = alertsState?.activeAlerts || [];
  const critical = active.find((a) => PRIORITY_INTERRUPT_TYPES.has(a.type));
  if (critical) {
    return { interrupt: true, reason: critical.title };
  }

  return { interrupt: false, reason: null };
}

export function isScreensaverNightDimmed(alertsState, settings) {
  return Boolean(settings?.screensaver?.nightDimmingEnabled && alertsState?.inQuietHours);
}

export function getAntiBurnInOffset(stepIndex, enabled = true) {
  if (!enabled) return [0, 0];
  return ANTI_BURNIN_OFFSETS[Math.abs(Math.trunc(stepIndex)) % ANTI_BURNIN_OFFSETS.length];
}
