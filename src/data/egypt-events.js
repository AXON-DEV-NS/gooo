/**
 * قاعدة بيانات المناسبات الإسلامية والرسمية المصرية (مستقلة وقابلة للتعديل اليدوي).
 * المناسبات الهجرية مرتبطة بالرؤية الشرعية وتعرض دائماً بوسم «موعد تقديري».
 * بعض الإجازات الرسمية قد تُرحّل بقرارات مجلس الوزراء المصري فتظهر ملحوظة التعديل.
 */

export const ISLAMIC_HIJRI_EVENTS = Object.freeze([
  { id: 'hijri-new-year', title: 'رأس السنة الهجرية', hijriMonth: 1, hijriDay: 1, category: 'إسلامية', isEstimated: true, isOfficialHoliday: true },
  { id: 'ashura', title: 'يوم عاشوراء (يستحب صيامه)', hijriMonth: 1, hijriDay: 10, category: 'إسلامية', isEstimated: true, isOfficialHoliday: false },
  { id: 'mawlid', title: 'ذكرى المولد النبوي الشريف', hijriMonth: 3, hijriDay: 12, category: 'إسلامية', isEstimated: true, isOfficialHoliday: true },
  { id: 'isra-miraj', title: 'ذكرى الإسراء والمعراج', hijriMonth: 7, hijriDay: 27, category: 'إسلامية', isEstimated: true, isOfficialHoliday: false },
  { id: 'ramadan-start', title: 'بداية شهر رمضان المبارك', hijriMonth: 9, hijriDay: 1, category: 'إسلامية', isEstimated: true, isOfficialHoliday: false },
  { id: 'eid-fitr-1', title: 'عيد الفطر المبارك (اليوم الأول)', hijriMonth: 10, hijriDay: 1, category: 'عيد', isEstimated: true, isEid: true, isOfficialHoliday: true },
  { id: 'eid-fitr-2', title: 'عيد الفطر المبارك (اليوم الثاني)', hijriMonth: 10, hijriDay: 2, category: 'عيد', isEstimated: true, isEid: true, isOfficialHoliday: true },
  { id: 'eid-fitr-3', title: 'عيد الفطر المبارك (اليوم الثالث)', hijriMonth: 10, hijriDay: 3, category: 'عيد', isEstimated: true, isEid: true, isOfficialHoliday: true },
  { id: 'arafah', title: 'يوم عرفة (يستحب صيامه لغير الحاج)', hijriMonth: 12, hijriDay: 9, category: 'إسلامية', isEstimated: true, isOfficialHoliday: true },
  { id: 'eid-adha-1', title: 'عيد الأضحى المبارك (اليوم الأول)', hijriMonth: 12, hijriDay: 10, category: 'عيد', isEstimated: true, isEid: true, isOfficialHoliday: true },
  { id: 'eid-adha-2', title: 'عيد الأضحى المبارك (اليوم الثاني)', hijriMonth: 12, hijriDay: 11, category: 'عيد', isEstimated: true, isEid: true, isOfficialHoliday: true },
  { id: 'eid-adha-3', title: 'عيد الأضحى المبارك (اليوم الثالث)', hijriMonth: 12, hijriDay: 12, category: 'عيد', isEstimated: true, isEid: true, isOfficialHoliday: true },
  { id: 'eid-adha-4', title: 'عيد الأضحى المبارك (اليوم الرابع)', hijriMonth: 12, hijriDay: 13, category: 'عيد', isEstimated: true, isEid: true, isOfficialHoliday: true },
]);

export const EGYPT_GREGORIAN_EVENTS = Object.freeze([
  { id: 'eg-coptic-christmas', title: 'عيد الميلاد المجيد', month: 1, day: 7, category: 'رسمية مصرية', isEstimated: false, isOfficialHoliday: true },
  { id: 'eg-jan25', title: 'ذكرى ثورة ٢٥ يناير وعيد الشرطة', month: 1, day: 25, category: 'رسمية مصرية', isEstimated: true, isOfficialHoliday: true, note: 'قد تُرحّل العطلة لنهاية الأسبوع بقرار رسمي' },
  { id: 'eg-sinai', title: 'عيد تحرير سيناء', month: 4, day: 25, category: 'رسمية مصرية', isEstimated: true, isOfficialHoliday: true, note: 'قد تُرحّل العطلة بقرار رسمي' },
  { id: 'eg-labor', title: 'عيد العمال', month: 5, day: 1, category: 'رسمية مصرية', isEstimated: true, isOfficialHoliday: true, note: 'قد تُرحّل العطلة بقرار رسمي' },
  { id: 'eg-june30', title: 'ذكرى ٣٠ يونيو', month: 6, day: 30, category: 'رسمية مصرية', isEstimated: true, isOfficialHoliday: true, note: 'قد تُرحّل العطلة بقرار رسمي' },
  { id: 'eg-july23', title: 'عيد ثورة ٢٣ يوليو', month: 7, day: 23, category: 'رسمية مصرية', isEstimated: true, isOfficialHoliday: true, note: 'قد تُرحّل العطلة بقرار رسمي' },
  { id: 'eg-oct6', title: 'عيد القوات المسلحة (٦ أكتوبر)', month: 10, day: 6, category: 'رسمية مصرية', isEstimated: true, isOfficialHoliday: true, note: 'قد تُرحّل العطلة بقرار رسمي' },
]);

/**
 * حساب موعد شم النسيم (الاثنين التالي لعيد القيامة الشرقي) لأي سنة ميلادية.
 */
export function computeShamElNessimDateKey(year) {
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31); // 3 أو 4 (بالتقويم اليولياني)
  const day = ((d + e + 114) % 31) + 1;
  // التحويل من اليولياني إلى الغريغوري (فارق 13 يوماً في القرن الحالي) + يوم واحد للاقتراب من الاثنين (شم النسيم)
  const julianShiftDays = Math.floor(year / 100) - Math.floor(year / 400) - 2;
  const dt = new Date(Date.UTC(year, month - 1, day + julianShiftDays + 1));
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
