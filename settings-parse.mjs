const K = {
  character: /默认角色|character|角色|personaje|personnage|rol\b|rôle|rolle|役割|역할|papel|роль|دور/i,
  source: /默认来源|source|来源|origen|fuente|origine|quelle|ソース|출처|origem|источник|مصدر/i,
  apiUrl: /接口地址|api地址|baseurl|endpoint|dirección|adresse|adresse api|アドレス|주소|endereço|адрес|عنوان/i,
  apiName: /接口名称|api名称|nombre|nom\b|api name|名前|이름|nome|имя|اسم/i,
  apiKey: /接口密钥|api密钥|apikeyenv|key env|clave|clé|schlüssel|キー|키|chave|ключ|مفتاح/i,
  apiModel: /接口模型|api模型|api model|modelo de api|modèle api|api-modell|モデル|모델|modelo da api|модель|نموذج/i,
  bind: /绑定接口|绑定这个接口|bind|vincular|lier|binden|バインド|바인딩|привязать|ربط/i,
  checkout: /支付地址|checkout|支付链接|pago|paiement|zahlung|支払い|결제|pagamento|оплата|دفع/i,
  region: /支付地区|地区|region|país|pays|land|国|地域|지역|região|регион|منطقة/i,
  method: /付款方式|支付方式|method|método|moyen|zahlungsart|支払方法|결제수단|forma de pagamento|способ|طريقة/i,
  presets: /档位|presets|金额|importe|montant|betrag|金額|금액|valor|сумма|مبلغ/i,
  model: /模型|model|modelo|modèle|modell|モデル|모델|модель|نموذج/i,
  note: /备注|note|nota|remarque|notiz|メモ|메모|observação|заметка|ملاحظة/i,
};

export function parseInstruction(text) {
  const out = { applied: [], defaults: {}, payment: {}, models: [], apis: [], bind: false, notes: '' };
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let api = null;
  for (const line of lines) {
    const m = line.match(/^([^=:：]+)\s*[=:：]\s*(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    const value = m[2].trim();
    if (!value) continue;
    if (K.character.test(key)) {
      out.defaults.defaultCharacter = value;
      out.applied.push('character');
    } else if (K.source.test(key)) {
      out.defaults.defaultSource = value;
      out.applied.push('source');
    } else if (K.apiUrl.test(key)) {
      api = api || {};
      api.baseUrl = value;
      out.applied.push('api.url');
    } else if (K.apiKey.test(key)) {
      api = api || {};
      api.apiKeyEnv = value;
      out.applied.push('api.keyEnv');
    } else if (K.apiModel.test(key)) {
      api = api || {};
      api.model = value;
      out.applied.push('api.model');
    } else if (K.apiName.test(key)) {
      api = api || {};
      api.name = value;
      out.applied.push('api.name');
    } else if (K.bind.test(key)) {
      out.bind = /^(是|对|yes|true|1|开|sí|oui|ja|はい|예|sim|да|نعم)$/i.test(value);
      out.applied.push('bind');
    } else if (K.region.test(key)) {
      out.payment.region = value;
      out.applied.push('payment.region');
    } else if (K.method.test(key)) {
      out.payment.method = value;
      out.applied.push('payment.method');
    } else if (K.checkout.test(key)) {
      out.payment.checkoutUrl = value;
      out.applied.push('payment.url');
    } else if (K.presets.test(key)) {
      out.payment.presets = value.split(/[,，\s]+/).map((n) => Number(n)).filter((n) => n > 0);
      out.applied.push('payment.presets');
    } else if (K.model.test(key)) {
      const parts = value.split('|').map((s) => s.trim());
      const url = parts.find((s) => /^https?:\/\//.test(s)) || value;
      const name = parts[0] && parts[0] !== url ? parts[0] : url;
      out.models.push({ name, baseUrl: url });
      out.applied.push('model');
    } else if (K.note.test(key)) {
      out.notes = value;
      out.applied.push('note');
    }
  }
  if (api && /^https?:\/\//.test(api.baseUrl || '')) out.apis.push(api);
  return out;
}
