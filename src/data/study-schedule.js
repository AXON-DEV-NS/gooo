export const STUDY_SUBJECTS = Object.freeze(['عربي', 'برمجة', 'تاريخ', 'إنجليزي']);

export const SUBJECT_GUIDES = Object.freeze({
  'عربي': 'النحو بالتدريب (١٠ تمارين بعد كل قاعدة) + تلخيص كل نص في ٥ أسطر.',
  'برمجة': 'اكتب الكود بنفسك، وجرب ١٥–٢٠ دقيقة قبل البحث عن الحل.',
  'تاريخ': 'افهمه كقصة (سبب ثم حدث ثم نتيجة) مع رسم خط زمني.',
  'إنجليزي': 'مفردات داخل جمل على بطاقات + ١٠ دقائق استماع أو قراءة يومياً.',
  'مراجعة المساء': '١٠ دقائق أسئلة اليوم + ١٠ دقائق قبل ٣ أيام + ٥ دقائق قبل أسبوع.',
  'مراجعة أسبوعية': 'اختبار ذاتي على أصعب النقاط + تحديث قائمة المراكم + تحديد دروس السبت.',
  'ليلة حرة': 'ليلة حرة — استرح وابتعد عن الضغط الدراسي.',
});

export const STUDY_BLOCK_STAGES = Object.freeze([
  {
    id: 'recall',
    label: 'استرجاع نشط',
    durationMinutes: 5,
    instruction: 'استرجاع نشط لآخر ما تمت مذاكرته من الذاكرة بدون فتح الكتاب.',
  },
  {
    id: 'deep_focus',
    label: 'مذاكرة مركزة',
    durationMinutes: 30,
    instruction: 'مذاكرة مركزة الآن — تأكد أن الموبايل بعيداً عن متناول يدك.',
  },
  {
    id: 'summary',
    label: 'تلخيص وأسئلة',
    durationMinutes: 5,
    instruction: 'لخّص الدرس في ٥ أسطر واكتب ٣ أسئلة للمراجعة لاحقاً.',
  },
]);

export const EVENING_REVIEW_STAGES = Object.freeze([
  {
    id: 'review_today',
    label: 'أسئلة اليوم',
    durationMinutes: 10,
    instruction: 'أول ١٠ دقائق: حل ومراجعة أسئلة اليوم.',
  },
  {
    id: 'review_3days',
    label: 'أسئلة قبل ٣ أيام',
    durationMinutes: 10,
    instruction: 'ثاني ١٠ دقائق: مراجعة أسئلة قبل ٣ أيام.',
  },
  {
    id: 'review_week',
    label: 'أسئلة قبل أسبوع',
    durationMinutes: 5,
    instruction: 'آخر ٥ دقائق: مراجعة أسئلة قبل أسبوع.',
  },
]);

export const WEEKLY_REVIEW_STAGES = Object.freeze([
  {
    id: 'self_test',
    label: 'اختبار ذاتي',
    durationMinutes: 15,
    instruction: 'اختبار ذاتي على أصعب نقاط الأسبوع.',
  },
  {
    id: 'backlog_plan',
    label: 'تحديث المراكم والسبت',
    durationMinutes: 15,
    instruction: 'تحديث قائمة المراكم وتحديد دروس يوم السبت.',
  },
]);

export const BREAK_STAGE = Object.freeze({
  id: 'break',
  label: 'استراحة فاصلة (١٠ دقائق)',
  durationMinutes: 10,
  instruction: 'تحرك بعيداً عن الشاشة واشرب كوب ماء لإعادة تنشيط الذهن.',
});

export const DEFAULT_WEEKLY_SCHEDULE = Object.freeze({
  0: {
    dayName: 'الأحد',
    note: 'يوم دراسي قياسي',
    blocks: [
      { id: 'sun-b1', slotIndex: 1, cluster: 'afternoon', kind: 'study_block', startTime: '16:30', endTime: '17:10', durationMinutes: 40, subject: 'عربي', tag: 'جديد', hasBreakAfter: true },
      { id: 'sun-b2', slotIndex: 2, cluster: 'afternoon', kind: 'study_block', startTime: '17:20', endTime: '18:00', durationMinutes: 40, subject: 'برمجة', tag: 'مراكم', hasBreakAfter: false },
      { id: 'sun-rev', slotIndex: 3, cluster: 'evening', kind: 'evening_review', startTime: '21:00', endTime: '21:25', durationMinutes: 25, subject: 'مراجعة المساء', tag: 'مراجعة', hasBreakAfter: false },
    ],
  },
  1: {
    dayName: 'الاثنين',
    note: 'يوم دراسي قياسي',
    blocks: [
      { id: 'mon-b1', slotIndex: 1, cluster: 'afternoon', kind: 'study_block', startTime: '16:30', endTime: '17:10', durationMinutes: 40, subject: 'إنجليزي', tag: 'جديد', hasBreakAfter: true },
      { id: 'mon-b2', slotIndex: 2, cluster: 'afternoon', kind: 'study_block', startTime: '17:20', endTime: '18:00', durationMinutes: 40, subject: 'تاريخ', tag: 'مراكم', hasBreakAfter: false },
      { id: 'mon-rev', slotIndex: 3, cluster: 'evening', kind: 'evening_review', startTime: '21:00', endTime: '21:25', durationMinutes: 25, subject: 'مراجعة المساء', tag: 'مراجعة', hasBreakAfter: false },
    ],
  },
  2: {
    dayName: 'الثلاثاء',
    note: 'يوم دراسي قياسي',
    blocks: [
      { id: 'tue-b1', slotIndex: 1, cluster: 'afternoon', kind: 'study_block', startTime: '16:30', endTime: '17:10', durationMinutes: 40, subject: 'برمجة', tag: 'جديد', hasBreakAfter: true },
      { id: 'tue-b2', slotIndex: 2, cluster: 'afternoon', kind: 'study_block', startTime: '17:20', endTime: '18:00', durationMinutes: 40, subject: 'عربي', tag: 'مراكم', hasBreakAfter: false },
      { id: 'tue-rev', slotIndex: 3, cluster: 'evening', kind: 'evening_review', startTime: '21:00', endTime: '21:25', durationMinutes: 25, subject: 'مراجعة المساء', tag: 'مراجعة', hasBreakAfter: false },
    ],
  },
  3: {
    dayName: 'الأربعاء',
    note: 'يوم دراسي قياسي',
    blocks: [
      { id: 'wed-b1', slotIndex: 1, cluster: 'afternoon', kind: 'study_block', startTime: '16:30', endTime: '17:10', durationMinutes: 40, subject: 'تاريخ', tag: 'جديد', hasBreakAfter: true },
      { id: 'wed-b2', slotIndex: 2, cluster: 'afternoon', kind: 'study_block', startTime: '17:20', endTime: '18:00', durationMinutes: 40, subject: 'إنجليزي', tag: 'مراكم', hasBreakAfter: false },
      { id: 'wed-rev', slotIndex: 3, cluster: 'evening', kind: 'evening_review', startTime: '21:00', endTime: '21:25', durationMinutes: 25, subject: 'مراجعة المساء', tag: 'مراجعة', hasBreakAfter: false },
    ],
  },
  4: {
    dayName: 'الخميس',
    note: 'مشروع + مادة مرنة + ليلة حرة',
    blocks: [
      { id: 'thu-b1', slotIndex: 1, cluster: 'afternoon', kind: 'study_block', startTime: '16:30', endTime: '17:10', durationMinutes: 40, subject: 'برمجة', tag: 'مشروع صغير', hasBreakAfter: true },
      { id: 'thu-b2', slotIndex: 2, cluster: 'afternoon', kind: 'study_block', startTime: '17:20', endTime: '18:00', durationMinutes: 40, subject: 'مرن', tag: 'المادة الأضعف', isFlexibleWeakest: true, hasBreakAfter: false },
      { id: 'thu-free', slotIndex: 3, cluster: 'evening', kind: 'free_night', startTime: '21:00', endTime: '21:25', durationMinutes: 25, subject: 'ليلة حرة', tag: 'استرح', isFreeRest: true, hasBreakAfter: false },
    ],
  },
  5: {
    dayName: 'الجمعة',
    note: 'راحة طوال اليوم ما عدا المراجعة الأسبوعية',
    blocks: [
      { id: 'fri-weekly', slotIndex: 1, cluster: 'afternoon', kind: 'weekly_review', startTime: '17:00', endTime: '17:30', durationMinutes: 30, subject: 'مراجعة أسبوعية', tag: '٣٠ دقيقة', hasBreakAfter: false },
    ],
  },
  6: {
    dayName: 'السبت',
    note: 'يوم المراكم الكبير (٤ بلوكات + مراجعة المساء)',
    blocks: [
      { id: 'sat-b1', slotIndex: 1, cluster: 'morning', kind: 'study_block', startTime: '10:00', endTime: '10:40', durationMinutes: 40, subject: 'برمجة', tag: 'مراكم', hasBreakAfter: true },
      { id: 'sat-b2', slotIndex: 2, cluster: 'morning', kind: 'study_block', startTime: '10:50', endTime: '11:30', durationMinutes: 40, subject: 'عربي', tag: 'مراكم', hasBreakAfter: false },
      { id: 'sat-b3', slotIndex: 3, cluster: 'afternoon', kind: 'study_block', startTime: '16:30', endTime: '17:10', durationMinutes: 40, subject: 'تاريخ', tag: 'مراكم', hasBreakAfter: true },
      { id: 'sat-b4', slotIndex: 4, cluster: 'afternoon', kind: 'study_block', startTime: '17:20', endTime: '18:00', durationMinutes: 40, subject: 'إنجليزي', tag: 'مراكم', hasBreakAfter: false },
      { id: 'sat-rev', slotIndex: 5, cluster: 'evening', kind: 'evening_review', startTime: '21:00', endTime: '21:25', durationMinutes: 25, subject: 'مراجعة المساء', tag: 'مراجعة', hasBreakAfter: false },
    ],
  },
});

export function getStagesForBlockKind(kind) {
  if (kind === 'evening_review') return EVENING_REVIEW_STAGES;
  if (kind === 'weekly_review') return WEEKLY_REVIEW_STAGES;
  if (kind === 'break') return [BREAK_STAGE];
  return STUDY_BLOCK_STAGES;
}

export function getGuideForSubject(subject, weakestSubject = 'عربي') {
  const effective = subject === 'مرن' ? weakestSubject : subject;
  return {
    subject: effective,
    text: SUBJECT_GUIDES[effective] || SUBJECT_GUIDES[subject] || 'ركّز على الفهم والتطبيق العملي والكتابة بيدك.',
  };
}
