interface EmailTemplateData {
  customerName: string;
  videoTitle: string;
  thumbnail: string;
  landingUrl: string;
  personalNote?: string;
  language?: EmailLanguage;
}

const BENEFIT_ICONS = {
  warranty:
    'https://www.laptopguru.pl/cdn/shop/files/gg2.png?v=1767364526&width=400',
  delivery:
    'https://www.laptopguru.pl/cdn/shop/files/dd1.png?v=1767364860&width=400',
  returns:
    'https://www.laptopguru.pl/cdn/shop/files/vv1.png?v=1767365084&width=400',
};

const translations = {
  pl: {
    badge: 'OSOBISTA RECENZJA WIDEO',
    greeting: 'Witamy',
    intro:
      'Nasz ekspert przygotował recenzję wideo specjalnie dla Ciebie — obejrzyj i podejmij najlepszą decyzję!',
    cta: '▶ Obejrzyj recenzję',
    benefit1Title: 'Gwarancja 12 miesięcy',
    benefit2Title: 'Darmowa dostawa pojutrze',
    benefit3Title: 'Zwrot w ciągu 30 dni',
    copyright: 'Eksperckie recenzje laptopów',
  },
  uk: {
    badge: 'ПЕРСОНАЛЬНИЙ ВІДЕО-ОГЛЯД',
    greeting: 'Вітаємо',
    intro:
      'Наш експерт підготував відео-огляд спеціально для вас — перегляньте та зробіть найкращий вибір!',
    cta: '▶ Дивитися огляд',
    benefit1Title: 'Гарантія 12 місяців',
    benefit2Title: 'Безкоштовна доставка післязавтра',
    benefit3Title: 'Повернення протягом 30 днів',
    copyright: 'Експертні огляди ноутбуків',
  },
  ru: {
    badge: 'ПЕРСОНАЛЬНЫЙ ВИДЕООБЗОР',
    greeting: 'Здравствуйте',
    intro:
      'Наш эксперт подготовил видеообзор специально для вас — посмотрите и примите лучшее решение!',
    cta: '▶ Смотреть обзор',
    benefit1Title: 'Гарантия 12 месяцев',
    benefit2Title: 'Бесплатная доставка послезавтра',
    benefit3Title: 'Возврат в течение 30 дней',
    copyright: 'Экспертные обзоры ноутбуков',
  },
  en: {
    badge: 'PERSONAL VIDEO REVIEW',
    greeting: 'Hello',
    intro:
      'Our expert has prepared a video review especially for you — watch it and make the best decision!',
    cta: '▶ Watch review',
    benefit1Title: '12-month warranty',
    benefit2Title: 'Free delivery day after tomorrow',
    benefit3Title: 'Return within 30 days',
    copyright: 'Expert laptop reviews',
  },
  lt: {
    badge: 'ASMENINĖ VAIZDO APŽVALGA',
    greeting: 'Sveiki',
    intro:
      'Mūsų ekspertas paruošė vaizdo apžvalgą specialiai jums — pažiūrėkite ir priimkite geriausią sprendimą!',
    cta: '▶ Žiūrėti apžvalgą',
    benefit1Title: '12 mėnesių garantija',
    benefit2Title: 'Nemokamas pristatymas poryt',
    benefit3Title: 'Grąžinimas per 30 dienų',
    copyright: 'Ekspertų nešiojamųjų kompiuterių apžvalgos',
  },
  et: {
    badge: 'ISIKLIK VIDEOÜLEVAADE',
    greeting: 'Tere',
    intro:
      'Meie ekspert on koostanud videoülevaate spetsiaalselt teile — vaadake ja tehke parim valik!',
    cta: '▶ Vaata ülevaadet',
    benefit1Title: '12 kuu garantii',
    benefit2Title: 'Tasuta kohaletoimetamine ülehomme',
    benefit3Title: 'Tagastamine 30 päeva jooksul',
    copyright: 'Ekspertide sülearvutite ülevaated',
  },
  lv: {
    badge: 'PERSONĪGS VIDEO APSKATS',
    greeting: 'Sveiki',
    intro:
      'Mūsu eksperts ir sagatavojis video apskatu speciāli jums — noskatieties un pieņemiet labāko lēmumu!',
    cta: '▶ Skatīt apskatu',
    benefit1Title: '12 mēnešu garantija',
    benefit2Title: 'Bezmaksas piegāde parīt',
    benefit3Title: 'Atgriešana 30 dienu laikā',
    copyright: 'Ekspertu klēpjdatoru apskati',
  },
};

export type EmailLanguage = 'pl' | 'uk' | 'ru' | 'en' | 'lt' | 'et' | 'lv';

export function buildEmailHtml(data: EmailTemplateData): string {
  const {
    customerName,
    videoTitle,
    thumbnail,
    landingUrl,
    personalNote,
    language = 'pl',
  } = data;
  const t = translations[language];
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const logoUrl = `${appUrl}/LG_logo2.webp`;

  const noteBlock = personalNote
    ? `<tr><td style="padding: 0 24px 24px;">
        <div style="background: #fff8f0; border-left: 4px solid #fb7830; padding: 16px; border-radius: 0 8px 8px 0;">
          <p style="margin: 0; color: #555; font-size: 15px; line-height: 1.6; font-style: italic;">${escapeHtml(personalNote)}</p>
        </div>
      </td></tr>`
    : '';

  function benefitCell(iconUrl: string, title: string) {
    return `<td style="width: 33.33%; text-align: center; padding: 12px 6px; vertical-align: top;">
      <img src="${iconUrl}" alt=""  height="36" style="display: block; margin: 0 auto 8px; height: 36px; " />
      <p style="margin: 0; font-size: 13px; font-weight: 700; color: #333;">${title}</p>
    </td>`;
  }

  return `<!DOCTYPE html>
<html lang="${language}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5; font-family: 'Helvetica Neue', Arial, sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #f5f5f5;">
<tr><td align="center" style="padding: 32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width: 560px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">

  <!-- Header -->
  <tr><td style="background-color: #fb7830; padding: 32px; text-align: center;">
    <img src="${logoUrl}" alt="Laptop Guru" style="height: 56px; margin: 0 auto 10px; display: block;" />
    <p style="margin: 0; color: rgba(255,255,255,0.85); font-size: 11px; text-transform: uppercase; letter-spacing: 2px; font-weight: 600;">${t.badge}</p>
  </td></tr>

  <!-- Body -->
  <tr><td style="padding: 32px 24px 0;">
    <p style="margin: 0 0 16px; color: #222; font-size: 22px; font-weight: bold; line-height: 1.3;">
      ${t.greeting}, ${escapeHtml(customerName)}!
    </p>
    <p style="margin: 0 0 24px; color: #555; font-size: 16px; line-height: 1.6;">
      ${t.intro}
    </p>
  </td></tr>

  ${noteBlock}

  <!-- Video preview -->
  <tr><td style="padding: 0 24px 8px;">
    <a href="${escapeHtml(landingUrl)}" style="display: block; text-decoration: none; position: relative;">
      <img src="${escapeHtml(thumbnail)}" alt="${escapeHtml(videoTitle)}" style="width: 100%; border-radius: 12px; display: block;" />
    </a>
  </td></tr>
  <tr><td style="padding: 0 24px 24px;">
    <p style="margin: 0; color: #333; font-size: 15px; font-weight: 600; line-height: 1.4;">${escapeHtml(videoTitle)}</p>
  </td></tr>

  <!-- CTA -->
  <tr><td style="padding: 0 24px 32px;" align="center">
    <a href="${escapeHtml(landingUrl)}" style="display: inline-block; background-color: #fb7830; color: #ffffff; font-size: 18px; font-weight: bold; text-decoration: none; padding: 16px 48px; border-radius: 12px; letter-spacing: 0.5px;">
      ${t.cta}
    </a>
  </td></tr>

  <!-- Benefits -->
  <tr><td style="padding: 0 12px 28px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #faf7f5; border-radius: 12px; overflow: hidden;">
      <tr>
        ${benefitCell(BENEFIT_ICONS.warranty, t.benefit1Title)}
        ${benefitCell(BENEFIT_ICONS.delivery, t.benefit2Title)}
        ${benefitCell(BENEFIT_ICONS.returns, t.benefit3Title)}
      </tr>
    </table>
  </td></tr>

  <!-- Footer -->
  <tr><td style="background-color: #1f2937; padding: 24px; text-align: center;">
    <img src="${logoUrl}" alt="Laptop Guru" style="height: 40px; margin: 0 auto 8px; display: block; opacity: 0.7;" />
    <p style="margin: 0; color: rgba(255,255,255,0.4); font-size: 12px;">
      &copy; laptopguru.pl &mdash; ${t.copyright}
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
