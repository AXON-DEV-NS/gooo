import {
  getHijriDate,
  getZonedParts,
  isTimeInQuietWindow,
  pad2,
  parseHHMMToMinutes,
  toArabicDigits,
} from './clock.js';
import { QIYAM_HADITH } from './qiyam.js';

/**
 * تقييم التنبيهات المستحقة في اللحظة الحالية مع احترام:
 * - عدم تكرار الصوت/التنبيه الجديد عند إعادة تحميل الصفحة (عبر alertLedger)
 * - ساعات الهدوء والنوم
 * - الحدود القصوى لتكرار تنبيهات الماء والحركة
 */
export function evaluateActiveAlerts({
  nowMs,
  prayerState,
  settings,
  tasks = [],
  alertLedger = {},
  studyPlan = null,
  qiyamTimes = null,
}) {
  const tz = settings.location.timezone || 'Africa/Cairo';
  const parts = getZonedParts(new Date(nowMs), tz);
  const currentHHMM = `${pad2(parts.hour)}:${pad2(parts.minute)}`;
  const todayKey = parts.dateKey;

  const inQuietHours =
    Boolean(settings.alerts.quietHoursEnabled) &&
    isTimeInQuietWindow(currentHHMM, settings.alerts.quietStart, settings.alerts.quietEnd);

  const candidates = [];

  // ١. تنبيه ما قبل الأذان
  if (prayerState?.preAdhanActive && prayerState.nextPrayer) {
    const p = prayerState.nextPrayer;
    candidates.push({
      id: `pre-adhan-${todayKey}-${p.id}`,
      type: 'pre_adhan',
      title: `اقتربت صلاة ${p.label}`,
      body: `يتبقى أقل من ${toArabicDigits(settings.prayer.preAdhanMinutes)} دقائق على أذان ${p.label} (${toArabicDigits(p.hhmm)}).`,
      priority: 95,
      soundCue: 'pre_adhan',
      isPrayerCritical: true,
      startMs: p.targetMs - settings.prayer.preAdhanMinutes * 60000,
      endMs: p.targetMs,
    });
  }

  // ٢. تنبيه وقت الأذان (نافذة أول دقيقتين من دخول الوقت)
  if (prayerState?.todayList) {
    for (const p of prayerState.todayList) {
      if (!p.isObligatory) continue;
      if (nowMs >= p.targetMs && nowMs < p.targetMs + 120000) {
        candidates.push({
          id: `adhan-${todayKey}-${p.id}`,
          type: 'adhan',
          title: `حان الآن موعد أذان ${p.label}`,
          body: `توقيت ${settings.location.city}: ${toArabicDigits(p.hhmm)}.`,
          priority: 100,
          soundCue: settings.prayer.adhanAudioEnabled ? 'adhan' : null,
          isPrayerCritical: true,
          startMs: p.targetMs,
          endMs: p.targetMs + 120000,
        });
      }
    }
  }

  // ٣. تنبيه انتهاء عداد الإقامة (إعداد شخصي)
  if (prayerState?.activeIqama) {
    const iq = prayerState.activeIqama;
    if (iq.remainingMs <= 60000) {
      candidates.push({
        id: `iqama-${todayKey}-${iq.prayerId}`,
        type: 'iqama',
        title: `اقتربت إقامة صلاة ${iq.label}`,
        body: 'عداد الإقامة الشخصي على وشك الانتهاء.',
        priority: 90,
        soundCue: 'iqama',
        isPrayerCritical: true,
        startMs: iq.endsAtMs - 60000,
        endMs: iq.endsAtMs + 60000,
      });
    }
  }

  // ٣.٥ توقف مؤقت تلقائي للمذاكرة لصلاة متقاطعة
  if (studyPlan?.activePrayerPause) {
    const pp = studyPlan.activePrayerPause;
    candidates.push({
      id: `study-prayer-pause-${todayKey}-${pp.prayerId}`,
      type: 'study_pause',
      title: `توقف مؤقت لصلاة ${pp.label}`,
      body: pp.message,
      priority: 96,
      soundCue: 'soft',
      isPrayerCritical: true,
      startMs: nowMs,
      endMs: pp.resumeAtMs || nowMs + 25 * 60000,
    });
  }

  // ٤. قواعد النوم والانضباط اليومي (١٠:٠٠ م إبعاد الموبايل + ١٠:٣٠ م النوم أولاً)
  if (settings.alerts.sleepReminderEnabled) {
    const curMins = parts.hour * 60 + parts.minute;
    const phoneAwayMins = parseHHMMToMinutes(settings.alerts.phoneAwayTime || '22:00');
    const sleepMins = parseHHMMToMinutes(settings.alerts.sleepTime || '22:30');

    if (phoneAwayMins !== null && curMins >= phoneAwayMins && curMins < phoneAwayMins + 25) {
      candidates.push({
        id: `phone-away-${todayKey}`,
        type: 'sleep',
        title: 'وقت إبعاد الموبايل خارج الغرفة والاستعداد للنوم',
        body: `الساعة ${toArabicDigits(settings.alerts.phoneAwayTime || '22:00')} — ضع الهاتف خارج الغرفة للحفاظ على جودة النوم.`,
        priority: 76,
        soundCue: inQuietHours ? null : 'soft',
        isPrayerCritical: false,
        startMs: nowMs,
        endMs: nowMs + 25 * 60000,
      });
    }

    if (sleepMins !== null && curMins >= sleepMins && curMins < sleepMins + 30) {
      candidates.push({
        id: `sleep-${todayKey}`,
        type: 'sleep',
        title: 'النوم أولاً (٨–١٠ ساعات) — تصبح على خير',
        body: 'دخل وقت الهدوء الليلي. راحة جسمك أساس تركيز الغد.',
        priority: 78,
        soundCue: null,
        isPrayerCritical: false,
        startMs: nowMs,
        endMs: nowMs + 30 * 60000,
      });
    }
  }

  // ٤.٥ تذكير قيام الليل الاختياري (عند بداية الثلث الأخير أو قبل الفجر بمدة محددة)
  if (settings.qiyam?.enabled && qiyamTimes) {
    if (nowMs >= qiyamTimes.reminderTargetMs && nowMs < qiyamTimes.fajrMs - 5 * 60000) {
      candidates.push({
        id: `qiyam-${qiyamTimes.nightDateKey}`,
        type: 'qiyam',
        title: 'تذكير قيام الليل — وقت الدعاء والسكينة',
        body: `بدأ الوقت المحدد لقيام الليل (${toArabicDigits(qiyamTimes.reminderHHMM)}). «${QIYAM_HADITH.text}» (${QIYAM_HADITH.source}).`,
        priority: 88,
        soundCue: 'soft',
        isPrayerCritical: true,
        startMs: qiyamTimes.reminderTargetMs,
        endMs: qiyamTimes.fajrMs - 5 * 60000,
      });
    }
  }

  // التنبيهات غير الحرجة تُكتم تلقائياً أثناء ساعات الهدوء
  if (!inQuietHours) {
    // ٥. تنبيه بداية مهمة قريبة (خلال ١٠ دقائق من وقت بدايتها)
    const curMins = parts.hour * 60 + parts.minute;
    for (const task of tasks) {
      if (task.status === 'completed') continue;
      const startMins = parseHHMMToMinutes(task.startTime);
      if (startMins !== null && curMins >= startMins && curMins <= startMins + 10) {
        candidates.push({
          id: `task-start-${todayKey}-${task.id}`,
          type: 'task',
          title: `موعد المهمة: ${task.title}`,
          body: `الفترة من ${toArabicDigits(task.startTime)} إلى ${toArabicDigits(task.endTime)}.`,
          priority: 70,
          soundCue: 'soft',
          isPrayerCritical: false,
          startMs: nowMs,
          endMs: nowMs + 20 * 60000,
        });
      }
    }

    // ٦. تذكير صيام الاثنين والخميس (ليلة الاثنين = الأحد مساءً، ليلة الخميس = الأربعاء مساءً)
    if (settings.alerts.monThuEnabled && parts.hour >= settings.alerts.monThuHour) {
      if (parts.weekdayIndex === 0 || parts.weekdayIndex === 3) {
        const nextDayLabel = parts.weekdayIndex === 0 ? 'الاثنين' : 'الخميس';
        candidates.push({
          id: `fasting-sunnah-${todayKey}`,
          type: 'fasting',
          title: `تذكير صيام يوم ${nextDayLabel}`,
          body: `غداً يوم ${nextDayLabel} — استعد للنية والسحور. «إنما الأعمال بالنيات» (متفق عليه: البخاري ١، مسلم ١٩٠٧).`,
          priority: 55,
          soundCue: null,
          isPrayerCritical: false,
          startMs: nowMs,
          endMs: nowMs + 4 * 3600000,
        });
      }
    }

    // ٧. تذكير الأيام البيض (١٣، ١٤، ١٥ من الشهر الهجري — يذكّر مساء ١٢، ١٣، ١٤)
    if (settings.alerts.whiteDaysEnabled && parts.hour >= settings.alerts.whiteDaysHour) {
      const hijri = getHijriDate(new Date(nowMs), tz, settings.calendar?.hijriOffsetDays || 0);
      if (hijri.day === 12 || hijri.day === 13 || hijri.day === 14) {
        candidates.push({
          id: `white-days-${todayKey}`,
          type: 'fasting',
          title: 'تذكير صيام الأيام البيض',
          body: `غداً ${toArabicDigits(hijri.day + 1)} ${hijri.monthName}. «أوصاني خليلي ﷺ بثلاث لا أدعهن حتى أموت: صوم ثلاثة أيام من كل شهر...» (متفق عليه: البخاري ١١٧٨، مسلم ٧٢١).`,
          priority: 58,
          soundCue: null,
          isPrayerCritical: false,
          startMs: nowMs,
          endMs: nowMs + 4 * 3600000,
        });
      }
    }

    // ٨. تذكير شرب الماء في ساعات النشاط فقط (٠٨:٠٠ إلى ما قبل النوم) بحد أقصى يومي
    if (settings.alerts.waterReminderEnabled && parts.hour >= 8) {
      const interval = Math.max(30, Number(settings.alerts.waterIntervalMinutes || 90));
      const maxDaily = Math.max(1, Number(settings.alerts.waterMaxDaily || 6));
      const activeMins = (parts.hour - 8) * 60 + parts.minute;
      const slot = Math.floor(activeMins / interval) + 1;
      const slotOffset = activeMins % interval;
      if (slot >= 1 && slot <= maxDaily && slotOffset <= 15) {
        candidates.push({
          id: `water-${todayKey}-slot-${slot}`,
          type: 'care',
          title: 'تذكير شرب الماء',
          body: 'اشرب كوب ماء للحفاظ على النشاط والتركيز أثناء اليوم.',
          priority: 40,
          soundCue: null,
          isPrayerCritical: false,
          startMs: nowMs,
          endMs: nowMs + 20 * 60000,
        });
      }
    }

    // ٩. تذكير الحركة الخفيفة في ساعات النشاط
    if (settings.alerts.movementReminderEnabled && parts.hour >= 9) {
      const interval = Math.max(30, Number(settings.alerts.movementIntervalMinutes || 120));
      const activeMins = (parts.hour - 9) * 60 + parts.minute;
      const slot = Math.floor(activeMins / interval) + 1;
      const slotOffset = activeMins % interval;
      if (slot >= 1 && slot <= 5 && slotOffset <= 15) {
        candidates.push({
          id: `movement-${todayKey}-slot-${slot}`,
          type: 'care',
          title: 'تذكير الحركة وتغيير الجلسة',
          body: 'قف وتحرك دقيقتين لإراحة الظهر والعينين.',
          priority: 35,
          soundCue: null,
          isPrayerCritical: false,
          startMs: nowMs,
          endMs: nowMs + 20 * 60000,
        });
      }
    }
  }

  // فلترة السجل: إذا تم تجاهل التنبيه أو إكماله لا يظهر. وإذا كان جديداً كلياً نعلمه كـ newlyTriggered لتشغيل صوته مرة واحدة فقط
  const activeAlerts = [];
  const newlyTriggered = [];

  for (const alert of candidates) {
    const ledgerEntry = alertLedger[alert.id];
    if (ledgerEntry && (ledgerEntry.status === 'dismissed' || ledgerEntry.status === 'completed')) {
      continue;
    }
    const isNew = !ledgerEntry;
    activeAlerts.push({
      ...alert,
      dateKey: todayKey,
      status: ledgerEntry?.status || 'shown',
      isNew,
    });
    if (isNew) {
      newlyTriggered.push({
        ...alert,
        dateKey: todayKey,
      });
    }
  }

  activeAlerts.sort((a, b) => b.priority - a.priority);
  newlyTriggered.sort((a, b) => b.priority - a.priority);

  return {
    todayKey,
    inQuietHours,
    activeAlerts,
    newlyTriggered,
    primaryAlert: activeAlerts[0] || null,
  };
}
