export function parseInstruction(text) {
  const out = { applied: [], defaults: {}, payment: {}, models: [], apis: [], bind: false, notes: '' };
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  let api = null;
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
    } else if (/接口地址|api地址|baseurl/.test(key)) {
      api = api || {};
      api.baseUrl = value;
      out.applied.push('接口地址');
    } else if (/接口名称|api名称|api name/.test(key)) {
      api = api || {};
      api.name = value;
      out.applied.push('接口名称');
    } else if (/接口密钥|api密钥|apikeyenv|key env/.test(key)) {
      api = api || {};
      api.apiKeyEnv = value;
      out.applied.push('接口密钥环境变量');
    } else if (/接口模型|api模型|api model/.test(key)) {
      api = api || {};
      api.model = value;
      out.applied.push('接口模型');
    } else if (/绑定接口|绑定这个接口|bind/.test(key)) {
      out.bind = /^(是|对|yes|true|1|开)$/i.test(value);
      out.applied.push('绑定接口');
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
  if (api && /^https?:\/\//.test(api.baseUrl || '')) out.apis.push(api);
  return out;
}
