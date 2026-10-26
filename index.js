import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFile, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseInstruction } from './settings-parse.mjs';
import { scanProviders, probeProvider, PROVIDERS } from './providers.mjs';
import { resolveRegion, REGIONS } from './regions.mjs';
import { detectLocale, t, SUPPORTED } from './i18n.mjs';

export const name = 'memory-hub';
export const inject = [];

const VERSION = 2;
const MAX_BODY = 5 * 1024 * 1024;

function safeName(value, fallback = '') {
  let s = String(value ?? fallback).trim();
  if (!s) s = String(fallback || '').trim();
  if (!s) return '';
  if (['__proto__', 'constructor', 'prototype'].includes(s)) s = `_${s}`;
  if (!/^[\p{L}\p{N}_ .-]{1,64}$/u.test(s)) {
    s = `u_${Buffer.from(s, 'utf8').toString('hex').slice(0, 48)}`;
  }
  return s.slice(0, 64);
}

function emptyStore() {
  return { version: VERSION, characters: {}, updatedAt: Date.now() };
}

export function apply(ctx, config = {}) {
  const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
  const host = String(config.host || '127.0.0.1');
  const configuredPort = config.port === undefined || config.port === null || config.port === 'auto' ? 0 : Number(config.port);
  let port = Number.isFinite(configuredPort) && configuredPort > 0 ? configuredPort : 0;
  const snapshotRaw = Number(config.snapshotLimit ?? 100);
  const snapshotLimit = Number.isFinite(snapshotRaw) && snapshotRaw > 0 ? Math.min(5000, snapshotRaw) : 0;
  const settingsFile = path.join(dshHome, 'memory-hub-settings.json');
  const loadSettingsFile = () => {
    try { return JSON.parse(fs.readFileSync(settingsFile, 'utf8')); } catch { return {}; }
  };
  const saveSettingsFile = (value) => {
    fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
    fs.writeFileSync(settingsFile, JSON.stringify(value, null, 2), 'utf8');
  };
  const savedSettings = loadSettingsFile();
  let binding = savedSettings.binding && savedSettings.binding.baseUrl ? savedSettings.binding : null;
  const historyRaw = Number(config.historyLimit ?? 1000);
  const historyLimit = Number.isFinite(historyRaw) && historyRaw > 0 ? historyRaw : 0;
  const file = config.file
    ? String(config.file)
    : path.join(dshHome, 'memory-hub.json');
  const channels = config.channels && typeof config.channels === 'object' ? config.channels : {};
  const payRaw = config.payment && typeof config.payment === 'object' ? config.payment : {};
  const payment = {
    enabled: payRaw.enabled === true,
    provider: String(payRaw.provider || 'auto'),
    checkoutUrl: String(payRaw.checkoutUrl || ''),
    currency: String(payRaw.currency || ''),
    presets: Array.isArray(payRaw.presets) ? payRaw.presets.map((n) => Number(n)).filter((n) => n > 0) : [],
  };
  let paymentRegion = String(savedSettings.paymentRegion || payRaw.region || '');
  const paymentsFile = file.replace(/\.json$/i, '') + '-payments.json';
  const paymentLimit = Math.max(10, Math.min(1000, Number(payRaw.historyLimit || 200)));
  const privacy = {
    telemetry: false,
    collectsData: false,
    consentRequired: true,
    consent: config.consent === true,
  };
  const outboxFile = file.replace(/\.json$/i, '') + '-outbox.json';
  const outboxRaw = Number(config.outboxLimit ?? 200);
  const outboxLimit = Number.isFinite(outboxRaw) && outboxRaw > 0 ? Math.min(5000, outboxRaw) : 0;

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
    fs.writeFileSync(outboxFile, JSON.stringify(outboxLimit > 0 ? items.slice(-outboxLimit) : items, null, 2), 'utf8');
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
    const vars = { text: payload.text, character: payload.character || '', channel: channelName, locale: payload.locale || '' };
    const type = String(cfg.type || 'generic').toLowerCase();
    let body;
    if (type === 'slack') body = { text: payload.text };
    else if (type === 'discord') body = { content: payload.text };
    else if (type === 'telegram') body = { chat_id: cfg.chatId || cfg.to || '', text: payload.text };
    else if (type === 'feishu' || type === 'lark') body = { msg_type: 'text', content: { text: payload.text } };
    else if (type === 'wecom' || type === 'wechat-work') body = { msgtype: 'text', text: { content: payload.text } };
    else if (type === 'line') body = { to: cfg.to || '', messages: [{ type: 'text', text: payload.text }] };
    else if (type === 'matrix') body = { msgtype: 'm.text', body: payload.text };
    else body = render(cfg.body !== undefined ? cfg.body : { text: '{{text}}', character: '{{character}}' }, vars);
    try {
      const r = await fetch(String(cfg.url), {
        method: String(cfg.method || 'POST').toUpperCase(),
        headers: { 'content-type': 'application/json', ...(cfg.headers || {}) },
        body: typeof body === 'string' ? body : JSON.stringify(body),
        signal: AbortSignal.timeout(Number(cfg.timeoutMs || 10000)),
      });
      const text = await r.text();
      return { ok: r.ok, status: r.status, type, response: text.slice(0, 500) };
    } catch (err) {
      return { ok: false, error: String(err?.message ?? err), type };
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
  const inboxRaw = Number(config.inboxLimit ?? 200);
  const inboxLimit = Number.isFinite(inboxRaw) && inboxRaw > 0 ? Math.min(5000, inboxRaw) : 0;

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
    fs.writeFileSync(inboxFile, JSON.stringify(inboxLimit > 0 ? items.slice(-inboxLimit) : items, null, 2), 'utf8');
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

  let configuredModels = Array.isArray(config.models) ? config.models.filter((m) => m && m.baseUrl).map((m) => ({
    name: String(m.name || m.baseUrl),
    baseUrl: String(m.baseUrl).replace(/\/+$/, ''),
    apiKeyEnv: String(m.apiKeyEnv || ''),
    protocol: String(m.protocol || 'openai'),
  })) : [];
  const modelPorts = Array.isArray(config.discoverPorts) && config.discoverPorts.length
    ? config.discoverPorts.map((n) => Number(n)).filter((n) => n > 0)
    : [11434, 1234, 8000, 8080, 5000];
  const catalogUrl = String(config.catalogUrl || 'https://fastly.jsdelivr.net/gh/shenmingsolar-01/dsh-memory-hub@main/providers-catalog.json');
  const catalogCacheFile = path.join(dshHome, 'memory-hub-providers.json');
  const catalogTtlMs = Number(config.catalogTtlMs || 24 * 3600 * 1000);

  const mergeCatalog = (providers) => {
    for (const p of Array.isArray(providers) ? providers : []) {
      if (!p || !p.id || !p.baseUrl) continue;
      const idx = PROVIDERS.findIndex((x) => x.id === p.id);
      const item = {
        id: String(p.id),
        name: String(p.name || p.id),
        protocol: String(p.protocol || 'openai'),
        baseUrl: String(p.baseUrl),
        apiKeyEnv: String(p.apiKeyEnv || ''),
        models: Array.isArray(p.models) ? p.models.map(String) : [],
        local: p.local === true,
      };
      if (idx >= 0) PROVIDERS[idx] = item;
      else PROVIDERS.push(item);
    }
  };

  const refreshCatalog = async (force = false) => {
    let cache = null;
    try { cache = JSON.parse(fs.readFileSync(catalogCacheFile, 'utf8')); } catch { /* none */ }
    if (cache?.providers) mergeCatalog(cache.providers);
    if (!force && cache && Date.now() - Number(cache.at || 0) < catalogTtlMs) {
      return { ok: true, cached: true, count: PROVIDERS.length };
    }
    if (!catalogUrl) return { ok: false, error: 'no catalogUrl' };
    try {
      const r = await fetch(catalogUrl, { signal: AbortSignal.timeout(5000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      mergeCatalog(j.providers);
      fs.writeFileSync(catalogCacheFile, JSON.stringify({ at: Date.now(), providers: j.providers || [] }, null, 2), 'utf8');
      return { ok: true, cached: false, count: PROVIDERS.length, updatedAt: j.updatedAt || '' };
    } catch (err) {
      return { ok: false, error: String(err?.message ?? err), count: PROVIDERS.length };
    }
  };

  const probeModel = async (baseUrl, apiKeyEnv = '') => {
    const base = String(baseUrl || '').replace(/\/+$/, '');
    if (!base) return { ok: false, error: 'baseUrl required' };
    const key = apiKeyEnv ? process.env[apiKeyEnv] : '';
    const headers = key ? { authorization: `Bearer ${key}` } : {};
    for (const path of ['/v1/models', '/api/tags']) {
      try {
        const r = await fetch(base + path, { headers, signal: AbortSignal.timeout(1200) });
        if (!r.ok) continue;
        const j = await r.json().catch(() => ({}));
        const list = Array.isArray(j.data) ? j.data : Array.isArray(j.models) ? j.models : [];
        const models = list.map((m) => String(m.id || m.name || '')).filter(Boolean).slice(0, 50);
        if (models.length || r.ok) return { ok: true, baseUrl: base, protocol: path.startsWith('/v1') ? 'openai' : 'ollama', models };
      } catch { /* try next */ }
    }
    return { ok: false, error: 'no compatible endpoint' };
  };

  const detectModels = async () => {
    const found = [];
    for (const port of modelPorts) {
      const r = await probeModel(`http://127.0.0.1:${port}`);
      if (r.ok) found.push({ ...r, source: 'auto' });
    }
    return found;
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
    if (snapshotLimit > 0 && c.snapshots.length > snapshotLimit) c.snapshots = c.snapshots.slice(-snapshotLimit);
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
    if (historyLimit > 0) target.history = target.history.slice(-historyLimit);
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
      if (historyLimit > 0) src.history = src.history.slice(-historyLimit);
      src.updatedAt = Date.now();
      save(store);
    }
    return { ok: true, added: changed };
  };

  const readJsonBody = (req) => new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch { resolve({}); } });
  });

  const server = http.createServer(async (req, res) => {
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
    const locale = detectLocale(req.headers['accept-language'], config.language);
    if (req.method === 'GET' && url.pathname === '/splash') {
      try {
        const page = path.join(path.dirname(fileURLToPath(import.meta.url)), 'splash.html');
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
        res.end(fs.readFileSync(page, 'utf8'));
      } catch {
        json(res, 404, { ok: false, error: 'splash not found' });
      }
      return;
    }

    if (req.method === 'GET' && url.pathname === '/locale') {
      json(res, 200, { ok: true, locale, supported: SUPPORTED, text: t(locale, 'language') });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/health') {
      json(res, 200, { ok: true, name, version: 1, file, port });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/bind') {
      json(res, 200, { ok: true, binding });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/bind') {
      const data = await readJsonBody(req);
      let baseUrl = String(data.baseUrl || '').trim().replace(/\/+$/, '');
      let protocol = String(data.protocol || 'openai');
      let apiKeyEnv = String(data.apiKeyEnv || '');
      let name = String(data.name || '');
      let providerId = String(data.providerId || '');

      if (providerId === 'auto' || (!baseUrl && providerId)) {
        if (providerId === 'auto') {
          const local = await detectModels();
          if (!local.length) {
            json(res, 404, { ok: false, error: 'no local model service detected' });
            return;
          }
          baseUrl = local[0].baseUrl;
          protocol = local[0].protocol;
          name = local[0].baseUrl;
          providerId = 'auto';
        } else {
          const p = PROVIDERS.find((x) => x.id === providerId);
          if (!p) {
            json(res, 404, { ok: false, error: 'unknown providerId' });
            return;
          }
          baseUrl = p.baseUrl;
          protocol = p.protocol;
          apiKeyEnv = p.apiKeyEnv || '';
          name = p.name;
        }
      }

      if (!/^https?:\/\//.test(baseUrl)) {
        json(res, 400, { ok: false, error: 'baseUrl must be http(s)' });
        return;
      }

      const probe = await probeModel(baseUrl, apiKeyEnv);
      if (!probe.ok && data.force !== true) {
        json(res, 400, { ok: false, error: 'model endpoint not reachable; pass force:true to bind anyway' });
        return;
      }

      binding = {
        providerId: providerId || 'custom',
        name: name || baseUrl,
        baseUrl,
        protocol,
        apiKeyEnv,
        model: String(data.model || ''),
        boundAt: Date.now(),
      };
      const settings = loadSettingsFile();
      settings.binding = binding;
      settings.updatedAt = Date.now();
      saveSettingsFile(settings);
      json(res, 200, { ok: true, binding });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/v1/models') {
      const models = binding ? (PROVIDERS.find((p) => p.id === binding.providerId)?.models || []) : [];
      json(res, 200, {
        object: 'list',
        data: models.map((id) => ({ id, object: 'model', owned_by: binding?.providerId || 'memory-hub' })),
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/v1/chat/completions') {
      if (!binding) {
        json(res, 409, { error: { message: t(locale, 'not_bound'), type: 'not_bound' } });
        return;
      }
      if (!['openai', 'ollama'].includes(binding.protocol)) {
        json(res, 501, { error: { message: `protocol ${binding.protocol} needs its native client; use an OpenAI-compatible endpoint`, type: 'unsupported_protocol' } });
        return;
      }
      const data = await readJsonBody(req);
      if (!data.model && binding.model) data.model = binding.model;
      const base = binding.baseUrl.replace(/\/+$/, '');
      const target = /\/v1$/.test(base) ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
      const headers = { 'content-type': 'application/json' };
      const key = binding.apiKeyEnv ? process.env[binding.apiKeyEnv] : '';
      if (key) headers.authorization = `Bearer ${key}`;
      try {
        const upstream = await fetch(target, {
          method: 'POST',
          headers,
          body: JSON.stringify(data),
          signal: AbortSignal.timeout(120000),
        });
        const text = await upstream.text();
        res.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') || 'application/json; charset=utf-8' });
        res.end(text);
      } catch (err) {
        json(res, 502, { error: { message: String(err?.message ?? err), type: 'upstream_error' } });
      }
      return;
    }

    if (req.method === 'GET' && url.pathname === '/models') {
      const allowNetwork = Boolean(binding) || config.networkWithModel === false;
      const catalog = allowNetwork ? await refreshCatalog(false) : { ok: false, skipped: 'model-not-bound' };
      const detected = await detectModels();
      const providers = allowNetwork
        ? await scanProviders()
        : await Promise.all(PROVIDERS.filter((p) => p.local).map((p) => probeProvider(p)));
      json(res, 200, { ok: true, configured: configuredModels, detected, providers, catalog, network: allowNetwork ? 'model-bound' : 'local-only' });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/models/refresh') {
      const catalog = await refreshCatalog(true);
      json(res, catalog.ok ? 200 : 502, catalog);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/models/probe') {
      let data = {};
      try {
        data = await new Promise((resolve) => {
          let body = '';
          req.on('data', (c) => { body += c; });
          req.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch { resolve({}); } });
        });
      } catch { /* ignore */ }
      const result = await probeModel(data.baseUrl, data.apiKeyEnv);
      json(res, result.ok ? 200 : 400, result);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/privacy') {
      json(res, 200, {
        ok: true,
        ...privacy,
        note: 'No telemetry, no outbound collection. Data stays on this machine. Any future collection requires explicit consent.',
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/payment/regions') {
      json(res, 200, {
        ok: true,
        regions: Object.entries(REGIONS).filter(([id]) => id !== 'DEFAULT').map(([id, r]) => ({
          country: id,
          currency: r.currency,
          locale: r.locale,
          methods: r.methods.map(([mid, label]) => ({ id: mid, label })),
        })),
        selected: paymentRegion || 'auto',
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/payment/region') {
      const data = await readJsonBody(req);
      const country = String(data.region || data.country || '').trim().toUpperCase();
      if (country && country !== 'AUTO' && !REGIONS[country]) {
        json(res, 400, { ok: false, error: 'unknown region' });
        return;
      }
      paymentRegion = country === 'AUTO' ? '' : country;
      const settings = loadSettingsFile();
      settings.paymentRegion = paymentRegion;
      settings.updatedAt = Date.now();
      saveSettingsFile(settings);
      const region = resolveRegion({ ...payRaw, region: paymentRegion });
      const method = data.method ? String(data.method) : '';
      if (method && !region.methods.some((m) => m.id === method)) {
        json(res, 400, { ok: false, error: 'method not available in this region', region });
        return;
      }
      json(res, 200, { ok: true, paymentRegion, region, method: method || region.methods[0]?.id || '' });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/payment') {
      json(res, 200, { ok: true, payment, region: resolveRegion({ ...payRaw, region: paymentRegion }) });
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

    if (req.method === 'GET' && url.pathname === '/channels') {
      json(res, 200, {
        ok: true,
        adapters: ['generic', 'slack', 'discord', 'telegram', 'feishu', 'wecom', 'line', 'matrix'],
        channels: Object.entries(channels).map(([name, cfg]) => ({
          name,
          type: String(cfg.type || 'generic'),
          url: String(cfg.url || '').replace(/\/\/[^/]+/, '//***'),
        })),
        locale,
      });
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
          json(res, 400, { ok: false, error: t(locale, 'payment_disabled') });
          return;
        }
        const item = pushPaymentIntent(data);
        if (!item) { json(res, 400, { ok: false, error: t(locale, 'invalid_amount') }); return; }
        const region = resolveRegion({ ...payRaw, region: data.region || paymentRegion });
        const method = String(data.method || region.methods[0]?.id || 'card');
        if (!region.methods.some((m) => m.id === method)) {
          json(res, 400, { ok: false, error: 'method not available in this region', region });
          return;
        }
        const url = new URL(payment.checkoutUrl);
        url.searchParams.set('amount', String(item.amount));
        url.searchParams.set('currency', region.currency);
        url.searchParams.set('method', method);
        url.searchParams.set('region', region.country);
        json(res, 200, {
          ok: true,
          amount: item.amount,
          currency: region.currency,
          region,
          method,
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
        const result = await deliver(channel, { text, character: String(data.character || ''), locale });
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

  let defaultCharacter = safeName(savedSettings.defaultCharacter || config.defaultCharacter, 'default') || 'default';
  let defaultSource = safeName(savedSettings.defaultSource || config.defaultSource, 'model') || 'model';
  const persistCurrentSettings = () => saveSettingsFile({
    version: 1,
    updatedAt: Date.now(),
    defaultCharacter,
    defaultSource,
    payment: {
      enabled: Boolean(payment.checkoutUrl),
      provider: payment.provider,
      checkoutUrl: payment.checkoutUrl,
      currency: payment.currency,
      presets: payment.presets,
    },
    models: configuredModels,
    binding,
  });

  const toolsEnabled = config.tools !== false;

  if (toolsEnabled && ctx.tools?.register) {
    ctx.effect(() => {
      const disposers = [];
      const reg = (definition) => {
        try { disposers.push(ctx.tools.register(definition)); } catch { /* ignore */ }
      };

      reg({
        name: 'memory_hub_write',
        description: '把当前角色的一段对话写入本机记忆中枢。安装者自己的模型可直接调用，数据只落本机。',
        parameters: {
          type: 'object',
          properties: {
            character: { type: 'string', description: '角色名，默认取插件配置' },
            source: { type: 'string', description: '来源，默认 model' },
            role: { type: 'string', enum: ['user', 'assistant'], description: '消息角色' },
            text: { type: 'string', description: '消息内容' },
            messages: { type: 'array', description: '可选，批量消息 [{role,text}]', items: { type: 'object' } },
          },
          additionalProperties: false,
        },
        execute: async (args = {}) => {
          const who = String(args.character || defaultCharacter);
          const src = String(args.source || defaultSource);
          const history = Array.isArray(args.messages)
            ? args.messages
            : [{ role: args.role === 'user' ? 'user' : 'assistant', text: String(args.text || '') }];
          const result = append(who, src, history);
          return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        },
      });

      reg({
        name: 'memory_hub_read',
        description: '读取本机记忆中枢里某个角色/来源的最近记忆。',
        parameters: {
          type: 'object',
          properties: {
            character: { type: 'string' },
            source: { type: 'string' },
            limit: { type: 'number' },
          },
          additionalProperties: false,
        },
        execute: async (args = {}) => {
          const store = load();
          const key = safeName(args.character || defaultCharacter);
          const c = key ? store.characters[key] : null;
          const limit = Math.max(1, Math.min(100, Number(args.limit || 20)));
          const sources = {};
          for (const [name, src] of Object.entries(c?.sources || {})) {
            if (args.source && name !== safeName(args.source)) continue;
            sources[name] = (src.history || []).slice(-limit);
          }
          return { content: [{ type: 'text', text: JSON.stringify({ character: key, sources }) }] };
        },
      });

      reg({
        name: 'memory_hub_delete',
        description: '删除本机记忆中枢某来源的一条记录，不影响其他来源。',
        parameters: {
          type: 'object',
          properties: {
            character: { type: 'string' },
            source: { type: 'string' },
            text: { type: 'string' },
            at: { type: 'number' },
          },
          additionalProperties: false,
        },
        execute: async (args = {}) => {
          const store = load();
          const c = character(store, args.character || defaultCharacter);
          if (!c) return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: 'invalid character' }) }] };
          const key = safeName(args.source || defaultSource, defaultSource) || defaultSource;
          const src = c.sources[key];
          if (!src) return { content: [{ type: 'text', text: JSON.stringify({ ok: true, deleted: 0 }) }] };
          const before = src.history.length;
          snapshot(c);
          src.history = src.history.filter((m) => {
            if (args.at && Number(args.at) === Number(m.at)) return false;
            if (args.text && String(args.text) === String(m.text)) return false;
            return true;
          });
          src.updatedAt = Date.now();
          save(store);
          return { content: [{ type: 'text', text: JSON.stringify({ ok: true, deleted: before - src.history.length }) }] };
        },
      });

      reg({
        name: 'memory_hub_flush',
        description: '把离线来源并回正常来源，去重后清空离线来源。',
        parameters: {
          type: 'object',
          properties: {
            character: { type: 'string' },
            from: { type: 'string' },
            to: { type: 'string' },
          },
          additionalProperties: false,
        },
        execute: async (args = {}) => {
          const added = flushSource(args.character || defaultCharacter, args.from || 'offline', args.to || defaultSource);
          return { content: [{ type: 'text', text: JSON.stringify({ ok: true, added }) }] };
        },
      });

      reg({
        name: 'memory_hub_bind',
        description: '把本插件的 OpenAI 兼容 API 绑定到安装者指定的 AI 软件或模型端点。',
        parameters: {
          type: 'object',
          properties: {
            providerId: { type: 'string', description: '厂商 id，如 ollama、openai、deepseek；auto 表示自动选本机服务' },
            baseUrl: { type: 'string', description: '自定义 OpenAI 兼容地址' },
            model: { type: 'string', description: '默认模型名，可留空' },
          },
          additionalProperties: false,
        },
        execute: async (args = {}) => {
          const r = await fetch(`http://127.0.0.1:${port}/bind`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ providerId: args.providerId || 'auto', baseUrl: args.baseUrl || '', model: args.model || '' }),
          });
          return { content: [{ type: 'text', text: JSON.stringify(await r.json().catch(() => ({}))) }] };
        },
      });

      reg({
        name: 'memory_hub_refresh_catalog',
        description: '刷新 AI 厂商和模型目录，获取插件发布后新增的软件和模型支持。',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
        execute: async () => {
          const result = await refreshCatalog(true);
          return { content: [{ type: 'text', text: JSON.stringify(result) }] };
        },
      });

      reg({
        name: 'memory_hub_list_models',
        description: '识别本机可用的 AI 服务和已配置的云端模型，返回厂商、协议、地址和模型列表。',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
        execute: async () => {
          const providers = await scanProviders();
          return { content: [{ type: 'text', text: JSON.stringify({ providers }) }] };
        },
      });

      reg({
        name: 'memory_hub_configure',
        description: '通过自然语言配置本机记忆中枢：默认角色/来源、模型地址、支付地址与金额档位。用户说“把默认角色改成…”时调用；同键覆盖。',
        parameters: {
          type: 'object',
          properties: {
            instruction: { type: 'string', description: '用户的原话，任意语言' },
          },
          required: ['instruction'],
          additionalProperties: false,
        },
        execute: async (args = {}) => {
          const parsed = parseInstruction(String(args.instruction || ''));
          if (parsed.defaults.defaultCharacter) defaultCharacter = safeName(parsed.defaults.defaultCharacter, defaultCharacter) || defaultCharacter;
          if (parsed.defaults.defaultSource) defaultSource = safeName(parsed.defaults.defaultSource, defaultSource) || defaultSource;
          if (parsed.payment.checkoutUrl) payment.checkoutUrl = parsed.payment.checkoutUrl;
          if (Array.isArray(parsed.payment.presets) && parsed.payment.presets.length) payment.presets = parsed.payment.presets;
          if (parsed.payment.region) paymentRegion = String(parsed.payment.region).toUpperCase();
          if (payment.checkoutUrl) payment.enabled = true;
          for (const m of parsed.models) {
            configuredModels = configuredModels.filter((x) => x.name !== m.name && x.baseUrl !== m.baseUrl);
            configuredModels.push({ name: m.name, baseUrl: m.baseUrl, apiKeyEnv: '', protocol: 'openai' });
          }
          for (const a of parsed.apis) {
            const name = a.name || a.baseUrl;
            configuredModels = configuredModels.filter((x) => x.name !== name && x.baseUrl !== a.baseUrl);
            configuredModels.push({ name, baseUrl: a.baseUrl, apiKeyEnv: a.apiKeyEnv || '', protocol: 'openai' });
            if (parsed.bind) {
              binding = { providerId: 'custom', name, baseUrl: a.baseUrl, protocol: 'openai', apiKeyEnv: a.apiKeyEnv || '', model: a.model || '', boundAt: Date.now() };
            }
          }
          persistCurrentSettings();
          return { content: [{ type: 'text', text: JSON.stringify({ ok: true, applied: parsed.applied, defaultCharacter, defaultSource }) }] };
        },
      });

      reg({
        name: 'memory_hub_payment_intent',
        description: '按安装者配置生成支付意图，返回带金额的支付地址；不处理支付凭证。',
        parameters: {
          type: 'object',
          properties: {
            amount: { type: 'number' },
            target: { type: 'string' },
          },
          required: ['amount'],
          additionalProperties: false,
        },
        execute: async (args = {}) => {
          const item = pushPaymentIntent({ amount: args.amount, target: args.target });
          if (!item) return { content: [{ type: 'text', text: JSON.stringify({ ok: false, error: 'payment disabled or invalid amount' }) }] };
          const url = new URL(payment.checkoutUrl);
          url.searchParams.set('amount', String(item.amount));
          return { content: [{ type: 'text', text: JSON.stringify({ ok: true, ...item, url: url.toString() }) }] };
        },
      });

      return () => {
        for (const dispose of disposers) {
          try { dispose?.(); } catch { /* ignore */ }
        }
      };
    }, 'memory-hub.tools');
  }

  const flushRules = Array.isArray(config.flush) ? config.flush : [];
  for (const rule of flushRules) {
    try {
      const added = flushSource(rule.character || 'default', rule.from || 'offline', rule.to || 'default');
      if (added && ctx.logger?.info) ctx.logger.info(`memory-hub 已并回离线记忆：${added} 条`);
    } catch { /* ignore */ }
  }

  let actualPort = port;
  const portFile = path.join(dshHome, 'memory-hub.port');
  server.on('listening', () => {
    try { actualPort = server.address().port; } catch { /* ignore */ }
    port = actualPort;
    try {
      fs.mkdirSync(path.dirname(portFile), { recursive: true });
      fs.writeFileSync(portFile, `${host}:${actualPort}`, 'utf8');
    } catch { /* ignore */ }
    if (ctx.logger?.info) ctx.logger.info(`memory-hub 监听 http://${host}:${actualPort}`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && actualPort !== 0) {
      if (ctx.logger?.warn) ctx.logger.warn(`端口 ${actualPort} 被占用，自动改用可用端口`);
      actualPort = 0;
      setTimeout(() => { try { server.listen(0, host); } catch { /* ignore */ } }, 50);
      return;
    }
    if (ctx.logger?.warn) ctx.logger.warn(`memory-hub 启动失败：${err.message}`);
  });
  const showSplash = () => {
    if (config.splash === false) return;
    try {
      const here = path.dirname(fileURLToPath(import.meta.url));
      const page = path.join(here, 'splash.html');
      if (!fs.existsSync(page)) return;
      const url = `file:///${page.replace(/\\/g, '/')}`;
      const profile = path.join(os.tmpdir(), 'worldlink-splash');
      const args = [
        `--app=${url}`,
        '--window-size=780,500',
        '--window-position=570,290',
        `--user-data-dir=${profile}`,
        '--no-first-run',
        '--disable-features=Translate',
      ];

      let bin = '';
      if (process.platform === 'win32') {
        bin = [
          'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
          'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
          'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        ].find((p) => fs.existsSync(p)) || '';
      } else if (process.platform === 'darwin') {
        bin = [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
          '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
        ].find((p) => fs.existsSync(p)) || '';
      } else {
        for (const name of ['google-chrome', 'chromium', 'chromium-browser', 'microsoft-edge', 'brave-browser']) {
          try {
            bin = execFileSync('which', [name], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
            if (bin) break;
          } catch { /* try next */ }
        }
      }
      if (!bin) return;

      const child = spawn(bin, args, { detached: true, stdio: 'ignore' });
      child.unref();
      setTimeout(() => {
        try {
          if (process.platform === 'win32') execFile('taskkill', ['/PID', String(child.pid), '/T', '/F']);
          else child.kill('SIGTERM');
        } catch { /* ignore */ }
      }, 2400);
    } catch { /* splash must never block the plugin */ }
  };

  server.listen(port, host);
  showSplash();

  if (ctx.effect) {
    ctx.effect(() => () => {
      try { server.close(); } catch { /* ignore */ }
    }, 'memory-hub.server');
  }
}
