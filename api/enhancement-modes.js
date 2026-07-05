import { getEnhancementModesList } from '../server/lib/enhancement-modes.js';

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
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    return res.status(200).json({ modes: getEnhancementModesList() });
  } catch (error) {
    console.error('Error fetching enhancement modes:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
