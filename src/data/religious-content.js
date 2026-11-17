import { getDayOfYear } from '../services/clock.js';
import dailyContentJson from './daily-content.json';

export const DAILY_VERSES = Object.freeze(dailyContentJson.verses);
export const DAILY_HADITHS = Object.freeze(dailyContentJson.hadiths);
export const DAILY_VOCAB_SETS = Object.freeze(dailyContentJson.vocabSets);

export function getDailyContentForDayNumber(dayIndex) {
  const safeIndex = Math.abs(Math.floor(Number(dayIndex) || 0));
  return {
    verse: DAILY_VERSES[safeIndex % DAILY_VERSES.length],
    hadith: DAILY_HADITHS[safeIndex % DAILY_HADITHS.length],
    words: DAILY_VOCAB_SETS[safeIndex % DAILY_VOCAB_SETS.length],
  };
}

export function getDailyContentForDateKey(dateKey) {
  const doy = getDayOfYear(dateKey);
  return {
    dayOfYear: doy,
    ...getDailyContentForDayNumber(doy - 1),
  };
}
