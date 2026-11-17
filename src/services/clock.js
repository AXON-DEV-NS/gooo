const WEEKDAY_MAP = {
  Sun: { index: 0, ar: 'الأحد' },
  Mon: { index: 1, ar: 'الاثنين' },
  Tue: { index: 2, ar: 'الثلاثاء' },
  Wed: { index: 3, ar: 'الأربعاء' },
  Thu: { index: 4, ar: 'الخميس' },
  Fri: { index: 5, ar: 'الجمعة' },
  Sat: { index: 6, ar: 'السبت' },
};

const GREGORIAN_MONTHS_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

const HIJRI_MONTHS_AR = [
  'محرم', 'صفر', 'ربيع الأول', 'ربيع الآخر',
  'جمادى الأولى', 'جمادى الآخرة', 'رجب', 'شعبان',
  'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة',
];

const ARABIC_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];

const ZONED_FMT_CACHE = new Map();
const HIJRI_FMT_CACHE = new Map();

function getCachedZonedFormatter(timeZone) {
  let fmt = ZONED_FMT_CACHE.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    ZONED_FMT_CACHE.set(timeZone, fmt);
  }
  return fmt;
}

function getCachedHijriFormatter(timeZone) {
  let fmt = HIJRI_FMT_CACHE.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    });
    HIJRI_FMT_CACHE.set(timeZone, fmt);
  }
  return fmt;
}

export function toArabicDigits(value) {
  return String(value).replace(/\d/g, (d) => ARABIC_DIGITS[Number(d)]);
}

export function pad2(num) {
  return String(Math.floor(Math.abs(Number(num) || 0))).padStart(2, '0');
}

export function getZonedParts(date = new Date(), timeZone = 'Africa/Cairo') {
  const safeDate = date instanceof Date ? date : new Date(date);
  let parts;
  try {
    if (typeof Intl === 'undefined' || typeof Intl.DateTimeFormat !== 'function') {
      throw new Error('Intl unavailable');
    }
    const fmt = getCachedZonedFormatter(timeZone);
    if (!fmt || typeof fmt.formatToParts !== 'function') {
      throw new Error('formatToParts unavailable');
    }
    parts = fmt.formatToParts(safeDate);
  } catch {
    // بديل آمن إذا لم يدعم متصفح قديم المنطقة الزمنية المطلوبة
    const fallbackOffsetHours = timeZone === 'Africa/Cairo' ? 2 : 0;
    const shifted = new Date(safeDate.getTime() + fallbackOffsetHours * 3600000);
    const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const wdKey = weekdayNames[shifted.getUTCDay()];
    return {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: shifted.getUTCDate(),
      hour: shifted.getUTCHours(),
      minute: shifted.getUTCMinutes(),
      second: shifted.getUTCSeconds(),
      weekdayIndex: shifted.getUTCDay(),
      weekdayNameAr: WEEKDAY_MAP[wdKey].ar,
      dateKey: `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`,
    };
  }

  const map = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = part.value;
    }
  }

  const rawHour = Number(map.hour);
  const hour = rawHour === 24 ? 0 : rawHour;
  const year = Number(map.year);
  const month = Number(map.month);
  const day = Number(map.day);
  const wdInfo = WEEKDAY_MAP[map.weekday] || WEEKDAY_MAP.Sun;

  return {
    year,
    month,
    day,
    hour,
    minute: Number(map.minute),
    second: Number(map.second),
    weekdayIndex: wdInfo.index,
    weekdayNameAr: wdInfo.ar,
    dateKey: `${year}-${pad2(month)}-${pad2(day)}`,
  };
}

/**
 * تحويل حسابي للتاريخ الميلادي إلى الهجري (خوارزمية كويتية/جدولية احتياطية للمتصفحات القديمة).
 */
export function gregorianToHijriTabular(year, month, day) {
  let m = month;
  let y = year;
  if (m < 3) {
    y -= 1;
    m += 12;
  }
  const a = Math.floor(y / 100);
  let b = 2 - a + Math.floor(a / 4);
  if (y < 1583) b = 0;
  if (y === 1582) {
    if (m > 10) b = -10;
    if (m === 10) {
      b = 0;
      if (day > 4) b = -10;
    }
  }
  const jd = Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + b - 1524;

  const iyear = 10631.0 / 30.0;
  const epochastro = 1948084;
  const shift1 = 8.01 / 60.0;
  let z = jd - epochastro;
  const cyc = Math.floor(z / 10631.0);
  z -= 10631 * cyc;
  const j = Math.floor((z - shift1) / iyear);
  const hijriYear = 30 * cyc + j;
  z -= Math.floor(j * iyear + shift1);
  let hijriMonth = Math.floor((z + 28.5001) / 29.5);
  if (hijriMonth === 13) hijriMonth = 12;
  const hijriDay = Math.floor(z - Math.floor(29.5001 * hijriMonth - 29));

  return {
    year: hijriYear,
    month: hijriMonth,
    day: hijriDay,
  };
}

export function getHijriDate(date = new Date(), timeZone = 'Africa/Cairo', offsetDays = 0) {
  const baseDate = date instanceof Date ? date : new Date(date);
  const safeOffset = Math.max(-3, Math.min(3, Math.trunc(Number(offsetDays) || 0)));
  const shiftedDate = new Date(baseDate.getTime() + safeOffset * 86400000);

  let hijriYear = 0;
  let hijriMonth = 0;
  let hijriDay = 0;
  let source = 'تقويم أم القرى';

  try {
    if (typeof Intl === 'undefined' || typeof Intl.DateTimeFormat !== 'function') {
      throw new Error('Intl unavailable');
    }
    const fmt = getCachedHijriFormatter(timeZone);
    if (!fmt || typeof fmt.formatToParts !== 'function') {
      throw new Error('formatToParts unavailable');
    }
    const parts = fmt.formatToParts(shiftedDate);
    const map = {};
    for (const p of parts) {
      if (p.type !== 'literal') map[p.type] = p.value;
    }
    const y = Number(String(map.year || '').replace(/\D/g, ''));
    const m = Number(String(map.month || '').replace(/\D/g, ''));
    const d = Number(String(map.day || '').replace(/\D/g, ''));
    if (y >= 1300 && y <= 1700 && m >= 1 && m <= 12 && d >= 1 && d <= 30) {
      hijriYear = y;
      hijriMonth = m;
      hijriDay = d;
    }
  } catch {
    // يسقط تلقائياً للخوارزمية المحلية أدناه
  }

  if (!hijriYear) {
    const zoned = getZonedParts(shiftedDate, timeZone);
    const tab = gregorianToHijriTabular(zoned.year, zoned.month, zoned.day);
    hijriYear = tab.year;
    hijriMonth = tab.month;
    hijriDay = tab.day;
    source = 'حساب هجري محلي (احتياطي)';
  }

  const monthName = HIJRI_MONTHS_AR[hijriMonth - 1] || '';
  return {
    year: hijriYear,
    month: hijriMonth,
    day: hijriDay,
    monthName,
    source: safeOffset !== 0 ? `${source} (بتعديل ${safeOffset > 0 ? '+' : ''}${toArabicDigits(safeOffset)} يوم)` : source,
    formattedAr: `${toArabicDigits(hijriDay)} ${monthName} ${toArabicDigits(hijriYear)} هـ`,
  };
}

export function formatGregorianDateAr(zonedParts) {
  const monthName = GREGORIAN_MONTHS_AR[(zonedParts.month || 1) - 1] || '';
  return `${zonedParts.weekdayNameAr} ${toArabicDigits(zonedParts.day)} ${monthName} ${toArabicDigits(zonedParts.year)}`;
}

export function formatClock12Ar(hour24, minute) {
  const period = hour24 >= 12 ? 'م' : 'ص';
  const h12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${toArabicDigits(h12)}:${toArabicDigits(pad2(minute))} ${period}`;
}

export function safeFormatLocalTimeAr(dateInput, timeZone = 'Africa/Cairo') {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) return '—';
  try {
    if (typeof d.toLocaleTimeString === 'function') {
      return d.toLocaleTimeString('ar-EG');
    }
  } catch {
    // يسقط للتنسيق الآمن أدناه
  }
  const p = getZonedParts(d, timeZone);
  return formatClock12Ar(p.hour, p.minute);
}

export function safeFormatLocalDateTimeAr(dateInput, timeZone = 'Africa/Cairo') {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) return '—';
  try {
    if (typeof d.toLocaleString === 'function') {
      return d.toLocaleString('ar-EG');
    }
  } catch {
    // يسقط للتنسيق الآمن أدناه
  }
  const p = getZonedParts(d, timeZone);
  return `${formatGregorianDateAr(p)} · ${formatClock12Ar(p.hour, p.minute)}`;
}

export function formatTime24FromMinutes(totalMinutes) {
  const clamped = ((Math.floor(totalMinutes) % 1440) + 1440) % 1440;
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${pad2(h)}:${pad2(m)}`;
}

export function parseHHMMToMinutes(hhmm) {
  const match = String(hhmm || '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

export function computeRemainingMs(targetMs, nowMs = Date.now()) {
  if (!Number.isFinite(targetMs) || !Number.isFinite(nowMs)) return 0;
  return Math.max(0, targetMs - nowMs);
}

export function formatDurationHMS(ms, useArabicDigits = true) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const raw = `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
  return useArabicDigits ? toArabicDigits(raw) : raw;
}

/**
 * تحويل (YYYY-MM-DD + HH:MM) في المنطقة الزمنية المحددة إلى Unix Timestamp دقيق بالمللي ثانية
 * مع احترام التوقيت الصيفي لتوقيت القاهرة عبر تقريب وتصحيح الفرق.
 */
export function zonedDateTimeToTimestampMs(dateKey, hhmm, timeZone = 'Africa/Cairo') {
  const [y, m, d] = String(dateKey).split('-').map(Number);
  const mins = parseHHMMToMinutes(hhmm);
  if (!y || !m || !d || mins === null) return NaN;
  const targetHour = Math.floor(mins / 60);
  const targetMinute = mins % 60;

  // نقطة بداية UTC مطابقة ثم قياس الإزاحة الفعلية للمنطقة الزمنية (تعمل بدقة مع التوقيت الصيفي)
  const utcGuess = Date.UTC(y, m - 1, d, targetHour, targetMinute, 0, 0);
  const guessedParts = getZonedParts(new Date(utcGuess), timeZone);
  const guessedAsUtc = Date.UTC(
    guessedParts.year,
    guessedParts.month - 1,
    guessedParts.day,
    guessedParts.hour,
    guessedParts.minute,
    0,
    0
  );
  const diffMs = guessedAsUtc - utcGuess;
  const corrected = utcGuess - diffMs;

  // إعادة فحص سريعة عند حدود تغيير التوقيت الصيفي
  const verifyParts = getZonedParts(new Date(corrected), timeZone);
  const verifyAsUtc = Date.UTC(
    verifyParts.year,
    verifyParts.month - 1,
    verifyParts.day,
    verifyParts.hour,
    verifyParts.minute,
    0,
    0
  );
  return corrected - (verifyAsUtc - utcGuess);
}

export function addDaysToDateKey(dateKey, deltaDays) {
  const [y, m, d] = String(dateKey).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

export function isTimeInQuietWindow(currentHHMM, startHHMM, endHHMM) {
  const cur = parseHHMMToMinutes(currentHHMM);
  const start = parseHHMMToMinutes(startHHMM);
  const end = parseHHMMToMinutes(endHHMM);
  if (cur === null || start === null || end === null) return false;
  if (start === end) return false;
  if (start < end) {
    return cur >= start && cur < end;
  }
  // نافذة تعبر منتصف الليل مثل 22:30 إلى 04:00
  return cur >= start || cur < end;
}

export function getDayIndexSinceEpoch(dateKey) {
  const [y, m, d] = String(dateKey).split('-').map(Number);
  if (!y || !m || !d) return 0;
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

/**
 * حساب رقم اليوم داخل السنة (1..366) لتدوير المحتوى اليومي محلياً دون الحاجة للإنترنت.
 */
export function getDayOfYear(dateKey) {
  const [y, m, d] = String(dateKey).split('-').map(Number);
  if (!y || !m || !d) return 1;
  const startOfYear = Date.UTC(y, 0, 0);
  const current = Date.UTC(y, m - 1, d);
  return Math.max(1, Math.floor((current - startOfYear) / 86400000));
}

export function getWeekStartDateKey(dateKey) {
  const [y, m, d] = String(dateKey).split('-').map(Number);
  if (!y || !m || !d) return dateKey;
  const dt = new Date(Date.UTC(y, m - 1, d));
  const wd = dt.getUTCDay(); // 0=الأحد .. 6=السبت
  // بداية الأسبوع الدراسي من السبت (6)
  const deltaToSaturday = wd === 6 ? 0 : -(wd + 1);
  return addDaysToDateKey(dateKey, deltaToSaturday);
}
