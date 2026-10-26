// Region-aware payment metadata. This does not move money or call any provider;
// it only tells the client which local methods and currency to show.
export const REGIONS = {
  CN: { currency: 'CNY', locale: 'zh-CN', methods: [['alipay', '支付宝'], ['wechat', '微信支付'], ['card', '银行卡']] },
  HK: { currency: 'HKD', locale: 'zh-HK', methods: [['alipayhk', 'AlipayHK'], ['wechat', 'WeChat Pay'], ['card', '银行卡']] },
  TW: { currency: 'TWD', locale: 'zh-TW', methods: [['card', '信用卡'], ['linepay', 'LINE Pay']] },
  US: { currency: 'USD', locale: 'en-US', methods: [['card', 'Card'], ['applepay', 'Apple Pay'], ['googlepay', 'Google Pay'], ['paypal', 'PayPal']] },
  CA: { currency: 'CAD', locale: 'en-CA', methods: [['card', 'Card'], ['interac', 'Interac'], ['paypal', 'PayPal']] },
  GB: { currency: 'GBP', locale: 'en-GB', methods: [['card', 'Card'], ['applepay', 'Apple Pay'], ['paypal', 'PayPal']] },
  EU: { currency: 'EUR', locale: 'de-DE', methods: [['card', 'Card'], ['sepa', 'SEPA'], ['applepay', 'Apple Pay']] },
  JP: { currency: 'JPY', locale: 'ja-JP', methods: [['card', 'クレジットカード'], ['paypay', 'PayPay']] },
  KR: { currency: 'KRW', locale: 'ko-KR', methods: [['card', '카드'], ['kakaopay', '카카오페이']] },
  SG: { currency: 'SGD', locale: 'en-SG', methods: [['card', 'Card'], ['paynow', 'PayNow']] },
  AU: { currency: 'AUD', locale: 'en-AU', methods: [['card', 'Card'], ['applepay', 'Apple Pay']] },
  IN: { currency: 'INR', locale: 'en-IN', methods: [['upi', 'UPI'], ['card', 'Card']] },
  AE: { currency: 'AED', locale: 'en-AE', methods: [['card', 'Card']] },
  BR: { currency: 'BRL', locale: 'pt-BR', methods: [['pix', 'Pix'], ['card', 'Cartão']] },
  DEFAULT: { currency: 'USD', locale: 'en-US', methods: [['card', 'Card']] },
};

const TZ_COUNTRY = {
  'Asia/Shanghai': 'CN', 'Asia/Chongqing': 'CN', 'Asia/Harbin': 'CN',
  'Asia/Hong_Kong': 'HK', 'Asia/Macau': 'HK', 'Asia/Taipei': 'TW',
  'Asia/Tokyo': 'JP', 'Asia/Seoul': 'KR', 'Asia/Singapore': 'SG',
  'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Asia/Dubai': 'AE',
  'Europe/London': 'GB', 'Europe/Berlin': 'EU', 'Europe/Paris': 'EU',
  'Europe/Amsterdam': 'EU', 'Europe/Madrid': 'EU', 'Europe/Rome': 'EU',
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US',
  'America/Los_Angeles': 'US', 'America/Toronto': 'CA', 'America/Vancouver': 'CA',
  'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'America/Sao_Paulo': 'BR',
};

export function detectCountry() {
  try {
    const locale = new Intl.DateTimeFormat().resolvedOptions().locale || '';
    const region = new Intl.Locale(locale).region;
    if (region && REGIONS[region]) return region;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    if (TZ_COUNTRY[tz]) return TZ_COUNTRY[tz];
    const prefix = tz.split('/')[0];
    if (prefix === 'Europe') return 'EU';
    if (prefix === 'Australia') return 'AU';
    if (prefix === 'America') return 'US';
  } catch { /* fall through */ }
  return '';
}

export function resolveRegion(payRaw = {}) {
  const forced = String(payRaw.region || '').trim().toUpperCase();
  const country = forced || detectCountry() || 'DEFAULT';
  const base = REGIONS[country] || REGIONS.DEFAULT;
  const override = payRaw.regions && payRaw.regions[country] ? payRaw.regions[country] : {};
  const methods = Array.isArray(override.methods) && override.methods.length
    ? override.methods.map((m) => (Array.isArray(m) ? { id: String(m[0]), label: String(m[1]) } : { id: String(m), label: String(m) }))
    : base.methods.map(([id, label]) => ({ id, label }));
  return {
    country,
    locale: String(override.locale || base.locale),
    currency: String(override.currency || base.currency),
    methods,
    detected: !forced,
    source: forced ? 'config' : 'system',
  };
}
