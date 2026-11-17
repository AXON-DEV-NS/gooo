import { describe, expect, it } from 'vitest';
import {
  addDaysToDateKey,
  computeRemainingMs,
  formatClock12Ar,
  formatDurationHMS,
  getHijriDate,
  getZonedParts,
  gregorianToHijriTabular,
  isTimeInQuietWindow,
  toArabicDigits,
  zonedDateTimeToTimestampMs,
} from '../services/clock.js';

describe('clock service (Africa/Cairo & Hijri)', () => {
  it('converts digits to Arabic-Indic and formats 12-hour clock', () => {
    expect(toArabicDigits('2026-11-16')).toBe('٢٠٢٦-١١-١٦');
    expect(formatClock12Ar(19, 30)).toBe('٧:٣٠ م');
    expect(formatClock12Ar(0, 5)).toBe('١٢:٠٥ ص');
    expect(formatClock12Ar(12, 0)).toBe('١٢:٠٠ م');
  });

  it('extracts Africa/Cairo parts accurately across midnight', () => {
    // 2026-11-16T22:15:00Z = 2026-11-17 00:15 Africa/Cairo (UTC+2)
    const parts = getZonedParts(new Date('2026-11-16T22:15:00Z'), 'Africa/Cairo');
    expect(parts.dateKey).toBe('2026-11-17');
    expect(parts.hour).toBe(0);
    expect(parts.minute).toBe(15);
    expect(parts.weekdayNameAr).toBe('الثلاثاء');
  });

  it('round-trips zonedDateTimeToTimestampMs even during Cairo DST summer time', () => {
    // يوليو في مصر التوقيت صيفي UTC+3
    const summerMs = zonedDateTimeToTimestampMs('2026-07-15', '18:30', 'Africa/Cairo');
    const parts = getZonedParts(new Date(summerMs), 'Africa/Cairo');
    expect(parts.dateKey).toBe('2026-07-15');
    expect(parts.hour).toBe(18);
    expect(parts.minute).toBe(30);

    // نوفمبر في مصر التوقيت شتوي UTC+2
    const winterMs = zonedDateTimeToTimestampMs('2026-11-16', '18:30', 'Africa/Cairo');
    const winterParts = getZonedParts(new Date(winterMs), 'Africa/Cairo');
    expect(winterParts.dateKey).toBe('2026-11-16');
    expect(winterParts.hour).toBe(18);
    expect(winterParts.minute).toBe(30);
  });

  it('computes real remaining ms without negative drift', () => {
    expect(computeRemainingMs(10000, 3500)).toBe(6500);
    expect(computeRemainingMs(1000, 3500)).toBe(0);
    expect(formatDurationHMS(755000, false)).toBe('00:12:35');
    expect(formatDurationHMS(755000, true)).toBe('٠٠:١٢:٣٥');
  });

  it('computes tabular Hijri fallback and supports manual day offset', () => {
    const tab = gregorianToHijriTabular(2026, 11, 16);
    expect(tab.year).toBeGreaterThanOrEqual(1447);
    expect(tab.month).toBeGreaterThanOrEqual(1);
    expect(tab.month).toBeLessThanOrEqual(12);

    const h0 = getHijriDate(new Date('2026-11-16T12:00:00Z'), 'Africa/Cairo', 0);
    const h1 = getHijriDate(new Date('2026-11-16T12:00:00Z'), 'Africa/Cairo', 1);
    expect(h1.formattedAr).not.toBe(h0.formattedAr);
  });

  it('handles overnight quiet window and date arithmetic', () => {
    expect(isTimeInQuietWindow('23:15', '22:30', '04:00')).toBe(true);
    expect(isTimeInQuietWindow('03:45', '22:30', '04:00')).toBe(true);
    expect(isTimeInQuietWindow('04:00', '22:30', '04:00')).toBe(false);
    expect(isTimeInQuietWindow('14:00', '22:30', '04:00')).toBe(false);
    expect(addDaysToDateKey('2026-11-30', 1)).toBe('2026-12-01');
  });
});
