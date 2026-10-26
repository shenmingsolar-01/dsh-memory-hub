// Known provider catalog. Detection only runs when the installer asks /models,
// and cloud providers are queried only when the installer's own key env exists.
export const PROVIDERS = [
  {
    id: 'openai', name: 'OpenAI', protocol: 'openai',
    baseUrl: 'https://api.openai.com/v1', apiKeyEnv: 'OPENAI_API_KEY',
    models: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'o3', 'o4-mini'],
  },
  {
    id: 'anthropic', name: 'Anthropic Claude', protocol: 'anthropic',
    baseUrl: 'https://api.anthropic.com/v1', apiKeyEnv: 'ANTHROPIC_API_KEY',
    models: ['claude-sonnet-4', 'claude-opus-4', 'claude-3-7-sonnet', 'claude-3-5-haiku'],
  },
  {
    id: 'google', name: 'Google Gemini', protocol: 'gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta', apiKeyEnv: 'GOOGLE_API_KEY',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
  },
  {
    id: 'deepseek', name: 'DeepSeek', protocol: 'openai',
    baseUrl: 'https://api.deepseek.com', apiKeyEnv: 'DEEPSEEK_API_KEY',
    models: ['deepseek-chat', 'deepseek-reasoner'],
  },
  {
    id: 'openrouter', name: 'OpenRouter', protocol: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1', apiKeyEnv: 'OPENROUTER_API_KEY',
    models: [],
  },
  {
    id: 'groq', name: 'Groq', protocol: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1', apiKeyEnv: 'GROQ_API_KEY',
    models: [],
  },
  {
    id: 'mistral', name: 'Mistral', protocol: 'openai',
    baseUrl: 'https://api.mistral.ai/v1', apiKeyEnv: 'MISTRAL_API_KEY',
    models: [],
  },
  {
    id: 'xai', name: 'xAI Grok', protocol: 'openai',
    baseUrl: 'https://api.x.ai/v1', apiKeyEnv: 'XAI_API_KEY',
    models: ['grok-4', 'grok-3', 'grok-3-mini'],
  },
  {
    id: 'qwen', name: '阿里通义千问', protocol: 'openai',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', apiKeyEnv: 'DASHSCOPE_API_KEY',
    models: ['qwen-max', 'qwen-plus', 'qwen-turbo', 'qwen3-235b-a22b'],
  },
  {
    id: 'zhipu', name: '智谱 GLM', protocol: 'openai',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4', apiKeyEnv: 'ZHIPU_API_KEY',
    models: ['glm-4.5', 'glm-4-plus', 'glm-4-flash'],
  },
  {
    id: 'moonshot', name: '月之暗面 Kimi', protocol: 'openai',
    baseUrl: 'https://api.moonshot.cn/v1', apiKeyEnv: 'MOONSHOT_API_KEY',
    models: ['kimi-k2', 'moonshot-v1-128k'],
  },
  {
    id: 'siliconflow', name: '硅基流动', protocol: 'openai',
    baseUrl: 'https://api.siliconflow.cn/v1', apiKeyEnv: 'SILICONFLOW_API_KEY',
    models: [],
  },
  {
    id: 'minimax', name: 'MiniMax', protocol: 'openai',
    baseUrl: 'https://api.minimax.chat/v1', apiKeyEnv: 'MINIMAX_API_KEY',
    models: [],
  },
  {
    id: 'ollama', name: 'Ollama', protocol: 'ollama',
    baseUrl: 'http://127.0.0.1:11434', local: true,
    models: [],
  },
  {
    id: 'lmstudio', name: 'LM Studio', protocol: 'openai',
    baseUrl: 'http://127.0.0.1:1234/v1', local: true,
    models: [],
  },
  {
    id: 'vllm', name: 'vLLM', protocol: 'openai',
    baseUrl: 'http://127.0.0.1:8000/v1', local: true,
    models: [],
  },
];

function modelsUrl(p) {
  if (p.protocol === 'ollama') return p.baseUrl.replace(/\/+$/, '') + '/api/tags';
  if (p.protocol === 'anthropic') return p.baseUrl.replace(/\/+$/, '') + '/models';
  if (p.protocol === 'gemini') return p.baseUrl.replace(/\/+$/, '') + '/models';
  return p.baseUrl.replace(/\/+$/, '') + '/models';
}

function headersFor(p, key) {
  if (p.protocol === 'anthropic') return { 'x-api-key': key, 'anthropic-version': '2023-06-01' };
  if (p.protocol === 'gemini') return {};
  return { authorization: `Bearer ${key}` };
}

export async function probeProvider(p, env = process.env) {
  const key = p.apiKeyEnv ? env[p.apiKeyEnv] : '';
  if (!p.local && !key) {
    return { id: p.id, name: p.name, protocol: p.protocol, baseUrl: p.baseUrl, configured: false, reachable: false, models: p.models || [] };
  }
  let url = modelsUrl(p);
  if (p.protocol === 'gemini') url += `?key=${encodeURIComponent(key)}`;
  try {
    const r = await fetch(url, { headers: headersFor(p, key), signal: AbortSignal.timeout(1800) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json().catch(() => ({}));
    const list = Array.isArray(j.data) ? j.data : Array.isArray(j.models) ? j.models : [];
    const models = list
      .map((m) => String(m.id || m.name || '').replace(/^models\//, ''))
      .filter(Boolean)
      .slice(0, 80);
    return {
      id: p.id, name: p.name, protocol: p.protocol, baseUrl: p.baseUrl,
      configured: Boolean(key) || Boolean(p.local), reachable: true,
      models: models.length ? models : (p.models || []),
    };
  } catch {
    return {
      id: p.id, name: p.name, protocol: p.protocol, baseUrl: p.baseUrl,
      configured: Boolean(key) || Boolean(p.local), reachable: false,
      models: p.models || [],
    };
  }
}

export async function scanProviders(env = process.env) {
  const results = await Promise.all(PROVIDERS.map((p) => probeProvider(p, env)));
  return results;
}
