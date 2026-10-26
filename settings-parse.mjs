export function parseInstruction(text) {
  const out = { applied: [], defaults: {}, payment: {}, models: [], notes: '' };
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const m = line.match(/^([^=:：]+)\s*[=:：]\s*(.*)$/);
    if (!m) continue;
    const key = m[1].trim().toLowerCase();
    const value = m[2].trim();
    if (!value) continue;
    if (/默认角色|character|角色/.test(key)) {
      out.defaults.defaultCharacter = value;
      out.applied.push('默认角色');
    } else if (/默认来源|source|来源/.test(key)) {
      out.defaults.defaultSource = value;
      out.applied.push('默认来源');
    } else if (/支付地址|checkout|支付链接/.test(key)) {
      out.payment.checkoutUrl = value;
      out.applied.push('支付地址');
    } else if (/档位|presets|金额/.test(key)) {
      out.payment.presets = value.split(/[,，\s]+/).map((n) => Number(n)).filter((n) => n > 0);
      out.applied.push('支付档位');
    } else if (/模型|model/.test(key)) {
      const parts = value.split('|').map((s) => s.trim());
      const url = parts.find((s) => /^https?:\/\//.test(s)) || value;
      const name = parts[0] && parts[0] !== url ? parts[0] : url;
      out.models.push({ name, baseUrl: url });
      out.applied.push('模型');
    } else if (/备注|note/.test(key)) {
      out.notes = value;
      out.applied.push('备注');
    }
  }
  return out;
}
