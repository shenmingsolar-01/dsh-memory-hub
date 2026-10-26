export const SUPPORTED = ['zh', 'en', 'es', 'fr', 'de', 'ja', 'ko', 'pt', 'ru', 'ar'];

const DICT = {
  zh: {
    payment_disabled: '支付未配置',
    invalid_amount: '金额无效',
    not_bound: '还没有绑定模型，请先绑定',
    unsupported_protocol: '该协议需要原生客户端，请改用 OpenAI 兼容地址',
    saved: '已保存',
    language: '语言',
  },
  en: {
    payment_disabled: 'Payment is not configured',
    invalid_amount: 'Invalid amount',
    not_bound: 'No model bound yet; bind one first',
    unsupported_protocol: 'This protocol needs its native client; use an OpenAI-compatible endpoint',
    saved: 'Saved',
    language: 'Language',
  },
  es: {
    payment_disabled: 'El pago no está configurado',
    invalid_amount: 'Importe no válido',
    not_bound: 'Aún no hay un modelo vinculado',
    unsupported_protocol: 'Este protocolo necesita su cliente nativo; usa un endpoint compatible con OpenAI',
    saved: 'Guardado',
    language: 'Idioma',
  },
  fr: {
    payment_disabled: "Le paiement n'est pas configuré",
    invalid_amount: 'Montant invalide',
    not_bound: "Aucun modèle n'est encore lié",
    unsupported_protocol: 'Ce protocole nécessite son client natif ; utilisez un point de terminaison compatible OpenAI',
    saved: 'Enregistré',
    language: 'Langue',
  },
  de: {
    payment_disabled: 'Zahlung ist nicht konfiguriert',
    invalid_amount: 'Ungültiger Betrag',
    not_bound: 'Noch kein Modell gebunden',
    unsupported_protocol: 'Dieses Protokoll benötigt seinen nativen Client; nutze einen OpenAI-kompatiblen Endpunkt',
    saved: 'Gespeichert',
    language: 'Sprache',
  },
  ja: {
    payment_disabled: '支払いが設定されていません',
    invalid_amount: '金額が無効です',
    not_bound: 'モデルがまだバインドされていません',
    unsupported_protocol: 'このプロトコルは専用クライアントが必要です。OpenAI 互換の URL を使用してください',
    saved: '保存しました',
    language: '言語',
  },
  ko: {
    payment_disabled: '결제가 설정되지 않았습니다',
    invalid_amount: '금액이 올바르지 않습니다',
    not_bound: '아직 모델이 바인딩되지 않았습니다',
    unsupported_protocol: '이 프로토콜은 전용 클라이언트가 필요합니다. OpenAI 호환 주소를 사용하세요',
    saved: '저장됨',
    language: '언어',
  },
  pt: {
    payment_disabled: 'O pagamento não está configurado',
    invalid_amount: 'Valor inválido',
    not_bound: 'Nenhum modelo vinculado ainda',
    unsupported_protocol: 'Este protocolo precisa do cliente nativo; use um endpoint compatível com OpenAI',
    saved: 'Salvo',
    language: 'Idioma',
  },
  ru: {
    payment_disabled: 'Оплата не настроена',
    invalid_amount: 'Неверная сумма',
    not_bound: 'Модель ещё не привязана',
    unsupported_protocol: 'Этот протокол требует родного клиента; используйте совместимый с OpenAI адрес',
    saved: 'Сохранено',
    language: 'Язык',
  },
  ar: {
    payment_disabled: 'الدفع غير مُعد',
    invalid_amount: 'المبلغ غير صالح',
    not_bound: 'لم يتم ربط أي نموذج بعد',
    unsupported_protocol: 'هذا البروتوكول يحتاج عميله الأصلي؛ استخدم عنوانًا متوافقًا مع OpenAI',
    saved: 'تم الحفظ',
    language: 'اللغة',
  },
};

export function detectLocale(acceptLanguage = '', override = '') {
  const forced = String(override || '').trim().toLowerCase();
  if (forced && forced !== 'auto' && SUPPORTED.includes(forced.split('-')[0])) return forced.split('-')[0];
  const header = String(acceptLanguage || '').toLowerCase();
  for (const part of header.split(',')) {
    const code = part.trim().split(';')[0].split('-')[0];
    if (SUPPORTED.includes(code)) return code;
  }
  try {
    const system = (new Intl.DateTimeFormat().resolvedOptions().locale || '').toLowerCase().split('-')[0];
    if (SUPPORTED.includes(system)) return system;
  } catch { /* ignore */ }
  return 'en';
}

export function t(locale, key) {
  const lang = SUPPORTED.includes(locale) ? locale : 'en';
  return DICT[lang]?.[key] || DICT.en[key] || key;
}
