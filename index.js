import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const name = 'memory-hub';
export const inject = [];

const VERSION = 2;
const MAX_BODY = 5 * 1024 * 1024;

function safeName(value, fallback = '') {
  const s = String(value || fallback).trim().toLowerCase();
  return /^[a-z0-9_-]{1,32}$/.test(s) ? s : '';
}

function emptyStore() {
  return { version: VERSION, characters: {}, updatedAt: Date.now() };
}

export function apply(ctx, config = {}) {
  const host = String(config.host || '127.0.0.1');
  const port = Number(config.port || 3177);
  const snapshotLimit = Math.max(5, Math.min(500, Number(config.snapshotLimit || 100)));
  const file = config.file
    ? String(config.file)
    : path.join(os.homedir(), '.dsh', 'memory-hub.json');
  const channels = config.channels && typeof config.channels === 'object' ? config.channels : {};
  const payRaw = config.payment && typeof config.payment === 'object' ? config.payment : {};
  const payment = {
    enabled: payRaw.enabled === true,
    provider: String(payRaw.provider || 'alipay'),
    checkoutUrl: String(payRaw.checkoutUrl || ''),
    currency: String(payRaw.currency || 'CNY'),
    presets: Array.isArray(payRaw.presets) ? payRaw.presets.map((n) => Number(n)).filter((n) => n > 0) : [],
    successMessage: String(payRaw.successMessage || ''),
  };
  const paymentsFile = file.replace(/\.json$/i, '') + '-payments.json';
  const paymentLimit = Math.max(10, Math.min(1000, Number(payRaw.historyLimit || 200)));
  const outboxFile = file.replace(/\.json$/i, '') + '-outbox.json';
  const outboxLimit = Math.max(10, Math.min(1000, Number(config.outboxLimit || 200)));

  const loadOutbox = () => {
    try {
      const parsed = JSON.parse(fs.readFileSync(outboxFile, 'utf8'));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const saveOutbox = (items) => {
    fs.mkdirSync(path.dirname(outboxFile), { recursive: true });
    fs.writeFileSync(outboxFile, JSON.stringify(items.slice(-outboxLimit), null, 2), 'utf8');
  };

  const render = (value, vars) => {
    if (typeof value === 'string') {
      return value.replace(/\{\{\s*(text|character|channel)\s*\}\}/g, (_, key) => String(vars[key] ?? ''));
    }
    if (Array.isArray(value)) return value.map((v) => render(v, vars));
    if (value && typeof value === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(value)) out[k] = render(v, vars);
      return out;
    }
    return value;
  };

  const deliver = async (channelName, payload) => {
    const cfg = channels[channelName];
    if (!cfg || !cfg.url) return { ok: false, error: `unknown channel: ${channelName}` };
    const vars = { text: payload.text, character: payload.character || '', channel: channelName };
    const body = render(cfg.body !== undefined ? cfg.body : { text: '{{text}}', character: '{{character}}' }, vars);
    try {
      const r = await fetch(String(cfg.url), {
        method: String(cfg.method || 'POST').toUpperCase(),
        headers: { 'content-type': 'application/json', ...(cfg.headers || {}) },
        body: typeof body === 'string' ? body : JSON.stringify(body),
        signal: AbortSignal.timeout(Number(cfg.timeoutMs || 10000)),
      });
      const text = await r.text();
      return { ok: r.ok, status: r.status, response: text.slice(0, 500) };
    } catch (err) {
      return { ok: false, error: String(err?.message ?? err) };
    }
  };

  const load = () => {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (parsed && parsed.version === VERSION && parsed.characters) return parsed;
    } catch { /* new */ }
    return emptyStore();
  };

  const save = (store) => {
    store.updatedAt = Date.now();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
    fs.renameSync(tmp, file);
  };

  const inboxFile = file.replace(/\.json$/i, '') + '-inbox.json';
  const inboxLimit = Math.max(10, Math.min(1000, Number(config.inboxLimit || 200)));

  const loadInbox = () => {
    try {
      const parsed = JSON.parse(fs.readFileSync(inboxFile, 'utf8'));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const saveInbox = (items) => {
    fs.mkdirSync(path.dirname(inboxFile), { recursive: true });
    fs.writeFileSync(inboxFile, JSON.stringify(items.slice(-inboxLimit), null, 2), 'utf8');
  };

  const pushInbox = (characterName, text, from = 'unknown', role = 'assistant') => {
    const items = loadInbox();
    const item = {
      at: Date.now(),
      character: safeName(characterName, 'default') || 'default',
      from: String(from || 'unknown').slice(0, 32),
      role: role === 'user' ? 'user' : 'assistant',
      text: String(text || '').slice(0, 4000),
    };
    items.push(item);
    saveInbox(items);
    return item;
  };

  const loadPayments = () => {
    try {
      const parsed = JSON.parse(fs.readFileSync(paymentsFile, 'utf8'));
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  };

  const savePayments = (items) => {
    fs.mkdirSync(path.dirname(paymentsFile), { recursive: true });
    fs.writeFileSync(paymentsFile, JSON.stringify(items.slice(-paymentLimit), null, 2), 'utf8');
  };

  const pushPaymentIntent = (data) => {
    const amount = Number(data.amount);
    if (!Number.isFinite(amount) || amount <= 0) return null;
    if (!payment.enabled || !payment.checkoutUrl) return null;
    const item = {
      at: Date.now(),
      amount,
      currency: payment.currency,
      provider: payment.provider,
      target: String(data.target || ''),
      custom: !payment.presets.includes(amount),
    };
    const items = loadPayments();
    items.push(item);
    savePayments(items);
    return item;
  };

  const character = (store, name) => {
    const key = safeName(name);
    if (!key) return null;
    if (!store.characters[key]) store.characters[key] = { sources: {}, snapshots: [] };
    const c = store.characters[key];
    c.sources = c.sources || {};
    c.snapshots = c.snapshots || [];
    return c;
  };

  const snapshot = (c) => {
    c.snapshots.push({ at: Date.now(), sources: JSON.parse(JSON.stringify(c.sources)) });
    if (c.snapshots.length > snapshotLimit) c.snapshots = c.snapshots.slice(-snapshotLimit);
  };

  const flushSource = (characterName, fromName = 'offline', toName = 'default') => {
    const store = load();
    const c = character(store, characterName);
    if (!c) return 0;
    const fromKey = safeName(fromName, 'offline') || 'offline';
    const toKey = safeName(toName, 'default') || 'default';
    const pending = Array.isArray(c.sources[fromKey]?.history) ? c.sources[fromKey].history : [];
    if (!pending.length) return 0;
    if (!c.sources[toKey]) c.sources[toKey] = { history: [], updatedAt: 0 };
    const target = c.sources[toKey];
    const seen = new Set(target.history.map((m) => `${m.role}|${m.text}`));
    let added = 0;
    for (const m of pending) {
      const key = `${m.role}|${m.text}`;
      if (seen.has(key)) continue;
      target.history.push(m);
      seen.add(key);
      added += 1;
    }
    snapshot(c);
    target.history = target.history.slice(-1000);
    target.updatedAt = Date.now();
    c.sources[fromKey].history = [];
    c.sources[fromKey].updatedAt = Date.now();
    save(store);
    return added;
  };

  const json = (res, code, body) => {
    res.writeHead(code, {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
      'cache-control': 'no-store',
    });
    res.end(JSON.stringify(body));
  };

  const append = (characterName, sourceName, history) => {
    const store = load();
    const c = character(store, characterName);
    const srcName = safeName(sourceName, 'default') || 'default';
    if (!c) return { ok: false, error: 'invalid character' };
    if (!c.sources[srcName]) c.sources[srcName] = { history: [], updatedAt: 0 };
    const src = c.sources[srcName];
    const seen = new Set(src.history.map((m) => `${m.role}|${m.text}`));
    let changed = false;
    for (const m of Array.isArray(history) ? history : []) {
      if (!m || !m.text) continue;
      const role = m.role === 'user' ? 'user' : 'assistant';
      const text = String(m.text).slice(0, 4000);
      const key = `${role}|${text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      src.history.push({ role, text, at: Number(m.at) || Date.now() });
      changed = true;
    }
    if (changed) {
      snapshot(c);
      src.history = src.history.slice(-1000);
      src.updatedAt = Date.now();
      save(store);
    }
    return { ok: true, added: changed };
  };

  const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': 'content-type',
        'access-control-allow-methods': 'GET,POST,OPTIONS',
      });
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (req.method === 'GET' && url.pathname === '/health') {
      json(res, 200, { ok: true, name, version: 1, file, port });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/payment') {
      json(res, 200, { ok: true, payment });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/payment/intents') {
      json(res, 200, { ok: true, items: loadPayments().slice(-50) });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/memory') {
      const store = load();
      const key = safeName(url.searchParams.get('character'));
      json(res, 200, { ok: true, store: key ? { version: VERSION, character: key, data: store.characters[key] || null } : store });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/inbox') {
      const key = safeName(url.searchParams.get('character'));
      const since = Number(url.searchParams.get('since') || 0);
      const items = loadInbox().filter((m) => (!key || m.character === key) && Number(m.at) > since);
      json(res, 200, { ok: true, items: items.slice(-50) });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/outbox') {
      json(res, 200, { ok: true, items: loadOutbox().slice(-50) });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/memory/backups') {
      const store = load();
      const key = safeName(url.searchParams.get('character'));
      const list = Object.entries(store.characters)
        .filter(([k]) => !key || k === key)
        .map(([k, c]) => ({ character: k, snapshots: c.snapshots.map((s) => ({ at: s.at, sources: Object.keys(s.sources) })) }));
      json(res, 200, { ok: true, backups: list });
      return;
    }

    if (req.method !== 'POST') {
      json(res, 404, { ok: false, error: 'not found' });
      return;
    }

    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY) req.destroy();
    });
    req.on('end', async () => {
      let data = {};
      try { data = JSON.parse(body || '{}'); } catch {
        json(res, 400, { ok: false, error: 'invalid json' });
        return;
      }

      if (url.pathname === '/cross') {
        const text = String(data.text || '').trim().slice(0, 4000);
        if (!text) { json(res, 400, { ok: false, error: 'text is required' }); return; }
        const item = pushInbox(data.character || 'default', text, data.from || 'unknown', data.role || 'assistant');
        let delivery = null;
        if (data.to) delivery = await deliver(String(data.to), { text, character: item.character });
        json(res, 200, { ok: true, item, delivery });
        return;
      }

      if (url.pathname === '/inbox') {
        const text = String(data.text || '').trim().slice(0, 4000);
        if (!text) { json(res, 400, { ok: false, error: 'text is required' }); return; }
        const item = pushInbox(data.character || 'default', text, data.from || 'unknown', data.role || 'assistant');
        let delivery = null;
        if (data.deliverTo) {
          delivery = await deliver(String(data.deliverTo), { text, character: item.character });
        }
        json(res, 200, { ok: true, item, delivery });
        return;
      }

      if (url.pathname === '/payment/intent') {
        if (!payment.enabled || !payment.checkoutUrl) {
          json(res, 400, { ok: false, error: 'payment is not configured' });
          return;
        }
        const item = pushPaymentIntent(data);
        if (!item) { json(res, 400, { ok: false, error: 'invalid amount' }); return; }
        const url = new URL(payment.checkoutUrl);
        url.searchParams.set('amount', String(item.amount));
        json(res, 200, {
          ok: true,
          amount: item.amount,
          currency: item.currency,
          provider: item.provider,
          custom: item.custom,
          url: url.toString(),
        });
        return;
      }

      if (url.pathname === '/outbox') {
        const channel = String(data.channel || data.to || '').trim();
        const text = String(data.text || '').trim().slice(0, 4000);
        if (!channel || !text) { json(res, 400, { ok: false, error: 'channel and text are required' }); return; }
        const result = await deliver(channel, { text, character: String(data.character || '') });
        const items = loadOutbox();
        items.push({ at: Date.now(), channel, character: String(data.character || ''), text, ok: result.ok, status: result.status || 0, error: result.error || '' });
        saveOutbox(items);
        json(res, result.ok ? 200 : 502, { ok: result.ok, ...result });
        return;
      }

      if (url.pathname === '/memory') {
        const who = data.character || data.who || 'default';
        const source = data.source || 'default';
        const result = append(who, source, data.history);
        if (!result.ok) { json(res, 400, result); return; }
        json(res, 200, { ok: true, character: safeName(who), source: safeName(source, 'default'), added: result.added });
        return;
      }

      if (url.pathname === '/memory/delete') {
        const store = load();
        const c = character(store, data.character || data.who);
        if (!c) { json(res, 400, { ok: false, error: 'invalid character' }); return; }
        const src = c.sources[safeName(data.source, 'default') || 'default'];
        if (src) {
          snapshot(c);
          src.history = (src.history || []).filter((m) => {
            if (data.at && Number(data.at) === Number(m.at)) return false;
            if (data.text && String(m.text) === String(data.text)) return false;
            return true;
          });
          src.updatedAt = Date.now();
          save(store);
        }
        json(res, 200, { ok: true });
        return;
      }

      if (url.pathname === '/memory/flush') {
        const added = flushSource(
          data.character || data.who || 'default',
          data.from || 'offline',
          data.to || 'default',
        );
        json(res, 200, { ok: true, added });
        return;
      }

      if (url.pathname === '/memory/restore') {
        const store = load();
        const c = character(store, data.character || data.who);
        if (!c) { json(res, 400, { ok: false, error: 'invalid character' }); return; }
        const snap = [...c.snapshots].reverse().find((s) => !data.snapshotAt || Number(s.at) === Number(data.snapshotAt));
        if (!snap) { json(res, 404, { ok: false, error: 'no snapshot' }); return; }
        snapshot(c);
        const source = safeName(data.source);
        if (source && snap.sources[source]) c.sources[source] = JSON.parse(JSON.stringify(snap.sources[source]));
        else if (!source) c.sources = JSON.parse(JSON.stringify(snap.sources));
        save(store);
        json(res, 200, { ok: true, restoredAt: snap.at });
        return;
      }

      json(res, 404, { ok: false, error: 'not found' });
    });
  });

  const flushRules = Array.isArray(config.flush) ? config.flush : [];
  for (const rule of flushRules) {
    try {
      const added = flushSource(rule.character || 'default', rule.from || 'offline', rule.to || 'default');
      if (added && ctx.logger?.info) ctx.logger.info(`memory-hub 已并回离线记忆：${added} 条`);
    } catch { /* ignore */ }
  }

  server.on('error', (err) => {
    if (ctx.logger?.warn) ctx.logger.warn(`memory-hub 启动失败：${err.message}`);
  });
  server.listen(port, host);
  if (ctx.logger?.info) ctx.logger.info(`memory-hub 监听 http://${host}:${port}`);

  if (ctx.effect) {
    ctx.effect(() => () => {
      try { server.close(); } catch { /* ignore */ }
    }, 'memory-hub.server');
  }
}
