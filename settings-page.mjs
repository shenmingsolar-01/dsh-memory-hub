export function renderSettingsPage() {
  return `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>memory-hub 设置</title>
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;padding:24px;background:#07131d;color:#dff4ff;font:14px/1.6 "Microsoft YaHei UI",system-ui,sans-serif}
main{max-width:820px;margin:0 auto}
h1{font-size:20px;margin:0 0 4px}
.sub{color:#7fa8bd;font-size:12px;margin-bottom:20px}
section{background:#0b1f2c;border:1px solid #1c3a4a;border-radius:12px;padding:16px;margin-bottom:14px}
h2{font-size:14px;margin:0 0 10px;color:#9fe3ff}
label{display:block;font-size:12px;color:#8fb8cc;margin:8px 0 4px}
input,textarea,select{width:100%;padding:8px 10px;border:1px solid #245064;border-radius:8px;background:#061620;color:#eaf9ff;font:inherit}
textarea{min-height:110px;resize:vertical}
.row{display:flex;gap:10px;flex-wrap:wrap}
.row>*{flex:1;min-width:180px}
button{padding:8px 14px;border:1px solid #2a6a86;border-radius:8px;background:#0d3b52;color:#dff6ff;font:inherit;cursor:pointer}
button.primary{background:#1c6f8f;border-color:#2f9bc4}
button:hover{filter:brightness(1.12)}
pre{white-space:pre-wrap;background:#06141c;border:1px solid #163545;border-radius:8px;padding:10px;min-height:40px;font-size:12px;color:#9fd8ea}
.hint{font-size:11px;color:#6f96aa}
.status{font-size:12px;color:#8fe9c0;min-height:18px}
</style></head><body><main>
<h1>memory-hub 设置</h1>
<div class="sub">只写本机设置文件；按键保存后按 key 覆盖，不追加旧内容。</div>

<section>
<h2>默认写入位置</h2>
<div class="row">
<div><label>默认角色 character</label><input id="character" placeholder="role-xxxxxx"></div>
<div><label>默认来源 source</label><input id="source" placeholder="client-xxxxxx"></div>
</div>
<div class="row" style="margin-top:10px"><button class="primary" onclick="saveDefaults()">保存默认角色/来源</button></div>
<div class="status" id="s1"></div>
</section>

<section>
<h2>模型适配</h2>
<div class="row"><button onclick="probe()">自动探测本机模型</button></div>
<pre id="models">未探测</pre>
<div class="row">
<div><label>名称</label><input id="mname" placeholder="model-xxxxxx"></div>
<div><label>地址</label><input id="murl" placeholder="https://model-xxxxxx.invalid/v1"></div>
</div>
<div class="row" style="margin-top:10px"><button class="primary" onclick="addModel()">添加 / 覆盖模型</button></div>
<div class="status" id="s2"></div>
</section>

<section>
<h2>支付</h2>
<div class="row">
<div><label>支付地址 checkoutUrl</label><input id="purl" placeholder="https://pay-xxxxxx.invalid/checkout"></div>
<div><label>档位 presets，逗号分隔</label><input id="ppresets" placeholder="10,20,50,100"></div>
</div>
<div class="row" style="margin-top:10px"><button class="primary" onclick="savePayment()">保存支付配置</button></div>
<div class="status" id="s3"></div>
</section>

<section>
<h2>自由文本指令</h2>
<div class="hint">每行一个「键=值」，不限语种。同键再次保存会覆盖旧值，不会混入旧内容。</div>
<textarea id="text" placeholder="默认角色=role-demo
默认来源=client-demo
支付地址=https://pay-demo.invalid/checkout
支付档位=10,20,50
模型=本地|http://127.0.0.1:11434
备注=只在本机使用"></textarea>
<div class="row" style="margin-top:10px"><button class="primary" onclick="applyText()">识别并写入</button></div>
<div class="status" id="s4"></div>
</section>
</main>
<script>
const $=(id)=>document.getElementById(id);
async function api(path, body){
  const r=await fetch(path,{method:body?'POST':'GET',headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
  return r.json().catch(()=>({ok:false,error:'bad json'}));
}
async function saveDefaults(){
  const r=await api('/settings/defaults',{character:$('character').value,source:$('source').value});
  $('s1').textContent=r.ok?'已保存':'失败：'+(r.error||'');
}
async function probe(){
  $('models').textContent='探测中…';
  const r=await api('/models');
  $('models').textContent=JSON.stringify(r.detected||[],null,2);
}
async function addModel(){
  const r=await api('/models/register',{name:$('mname').value,baseUrl:$('murl').value});
  $('s2').textContent=r.ok?'已添加/覆盖':'失败：'+(r.error||'');
}
async function savePayment(){
  const r=await api('/settings/payment',{checkoutUrl:$('purl').value,presets:$('ppresets').value});
  $('s3').textContent=r.ok?'已保存':'失败：'+(r.error||'');
}
async function applyText(){
  const r=await api('/settings/text',{text:$('text').value});
  $('s4').textContent=r.ok?'已写入：'+(r.applied||[]).join('、'):'失败：'+(r.error||'');
}
(async()=>{const r=await api('/settings.json'); if(r.ok){$('character').value=r.settings.defaultCharacter||'';$('source').value=r.settings.defaultSource||'';$('purl').value=r.settings.payment?.checkoutUrl||'';$('ppresets').value=(r.settings.payment?.presets||[]).join(',');}})();
(function(){const rid=()=>Math.random().toString(36).slice(2,8);$("character").placeholder="role-"+rid();$("source").placeholder="client-"+rid();$("mname").placeholder="model-"+rid();$("murl").placeholder="https://model-"+rid()+".invalid/v1";$("purl").placeholder="https://pay-"+rid()+".invalid/checkout";})();</script></body></html>`;
}

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
