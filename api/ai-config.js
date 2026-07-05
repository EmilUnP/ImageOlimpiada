import '../server/load-env.js';
import { resolveAiProvider } from '../server/lib/ai-provider.js';
import { getPublicAiConfig } from '../server/lib/model-config.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const provider = resolveAiProvider();
  res.status(200).json(getPublicAiConfig(provider));
}
