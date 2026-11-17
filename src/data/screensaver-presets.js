export const SCREENSAVER_PRESETS = Object.freeze([
  {
    id: 'royal_ruqah',
    name: 'الرقعة الملكي',
    englishName: 'Royal Ruq\'ah',
    description: 'ساعة مركزية فخمة يعلوها اليوم بخط الرقعة وشريط ذهبي يجمع التاريخين والطقس.',
  },
  {
    id: 'editorial_manuscript',
    name: 'المخطوطة التراثية المعاصرة',
    englishName: 'Editorial Manuscript',
    description: 'تكوين ثنائي يفصل بين الساعة والبيانات خط عمودي ذهبي دقيق بهرمية فاخرة.',
  },
  {
    id: 'gallery_corner',
    name: 'رواق اللوحة',
    englishName: 'Gallery Corner',
    description: 'يترك ٨٠٪ من الخلفية المتحركة حرة ويجمع البيانات في بطاقة رقيقة بالزاوية السفلية اليمنى.',
  },
  {
    id: 'diwan_minimalist',
    name: 'الديوان الهادي',
    englishName: 'Diwan Minimalist',
    description: 'تصميم عائم بلا إطارات يعتمد على جمال خط الرقعة ووضوح التباين ومؤشر الصلاة القادمة.',
  },
  {
    id: 'andalusian_frame',
    name: 'الإطار الأندلسي الحديث',
    englishName: 'Framed Sanctuary',
    description: 'إطار مزدوج دقيق داخل هامش الأمان ٤٪ تتصدره الساعة في الأعلى والتاريخ والطقس أسفله.',
  },
]);

export const IDLE_DURATION_OPTIONS = Object.freeze([
  { seconds: 30, label: '٣٠ ثانية' },
  { seconds: 60, label: 'دقيقة واحدة (الافتراضي)' },
  { seconds: 120, label: 'دقيقتان' },
  { seconds: 300, label: '٥ دقائق' },
]);

export const ANTI_BURNIN_OFFSETS = Object.freeze([
  [0, 0],
  [2, 0],
  [2, 2],
  [0, 2],
  [-2, 2],
  [-2, 0],
  [-2, -2],
  [0, -2],
]);

export function getPresetById(presetId) {
  return SCREENSAVER_PRESETS.find((p) => p.id === presetId) || SCREENSAVER_PRESETS[0];
}
