import {
  EGYPT_GREGORIAN_EVENTS,
  ISLAMIC_HIJRI_EVENTS,
  computeShamElNessimDateKey,
} from '../data/egypt-events.js';
import { addDaysToDateKey, getHijriDate, getZonedParts, zonedDateTimeToTimestampMs } from './clock.js';

export function resolveEventsForRange(nowMs, settings, customEvents = [], daysAhead = 14) {
  const tz = settings.location.timezone || 'Africa/Cairo';
  const offset = settings.calendar?.hijriOffsetDays || 0;
  const baseParts = getZonedParts(new Date(nowMs), tz);
  const customById = new Map();
  const extraCustom = [];

  for (const ev of customEvents || []) {
    if (ev.id && (ev.id.startsWith('hijri-') || ev.id.startsWith('eg-') || ev.id.startsWith('eid-'))) {
      customById.set(ev.id, ev);
    } else {
      extraCustom.push(ev);
    }
  }

  const results = [];

  for (let delta = 0; delta <= daysAhead; delta += 1) {
    const dateKey = addDaysToDateKey(baseParts.dateKey, delta);
    const [gYear, gMonth, gDay] = dateKey.split('-').map(Number);
    const midDayMs = zonedDateTimeToTimestampMs(dateKey, '12:00', tz);
    const hijri = getHijriDate(new Date(midDayMs), tz, offset);

    for (const hEv of ISLAMIC_HIJRI_EVENTS) {
      const override = customById.get(hEv.id);
      if (override) {
        if (override.dateKey === dateKey) {
          results.push({
            ...hEv,
            title: override.title || hEv.title,
            dateKey,
            daysUntil: delta,
            isEstimated: override.isEstimated,
            isCustomOverride: true,
          });
        }
        continue;
      }

      if (hijri.month === hEv.hijriMonth && hijri.day === hEv.hijriDay) {
        results.push({
          ...hEv,
          dateKey,
          daysUntil: delta,
          hijriLabel: hijri.formattedAr,
        });
      }
    }

    for (const gEv of EGYPT_GREGORIAN_EVENTS) {
      const override = customById.get(gEv.id);
      if (override) {
        if (override.dateKey === dateKey) {
          results.push({
            ...gEv,
            title: override.title || gEv.title,
            dateKey,
            daysUntil: delta,
            isEstimated: override.isEstimated,
            isCustomOverride: true,
          });
        }
        continue;
      }

      if (gMonth === gEv.month && gDay === gEv.day) {
        results.push({
          ...gEv,
          dateKey,
          daysUntil: delta,
        });
      }
    }

    // شم النسيم
    const shamKey = computeShamElNessimDateKey(gYear);
    if (shamKey === dateKey) {
      results.push({
        id: `eg-sham-${gYear}`,
        title: 'شم النسيم',
        category: 'رسمية مصرية',
        isEstimated: false,
        isOfficialHoliday: true,
        dateKey,
        daysUntil: delta,
      });
    }

    for (const cEv of extraCustom) {
      if (cEv.dateKey === dateKey) {
        results.push({
          ...cEv,
          daysUntil: delta,
        });
      }
    }
  }

  return results;
}

export function getDayOccasionContext(nowMs, settings, customEvents = []) {
  const tz = settings.location.timezone || 'Africa/Cairo';
  const offset = settings.calendar?.hijriOffsetDays || 0;
  const hijri = getHijriDate(new Date(nowMs), tz, offset);
  const todayEvents = resolveEventsForRange(nowMs, settings, customEvents, 0);

  const eidEvent = todayEvents.find((ev) => ev.isEid);
  const officialHoliday = todayEvents.find((ev) => ev.isOfficialHoliday && !ev.isEid);

  return {
    hijri,
    isRamadan: hijri.month === 9,
    isEid: Boolean(eidEvent),
    eidEvent: eidEvent || null,
    isOfficialHoliday: Boolean(officialHoliday),
    officialHoliday: officialHoliday || null,
    todayEvents,
  };
}
