import { listImages } from '../../lib/blob-storage.js';

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
    let folderType = req.query.folderType;

    if (!folderType && req.url) {
      const urlMatch = req.url.match(/\/(?:api\/)?admin\/images\/([^/?]+)/);
      if (urlMatch) {
        folderType = urlMatch[1];
      }
    }

    if (!folderType || (folderType !== 'enhancement' && folderType !== 'translation')) {
      return res.status(400).json({ error: 'Invalid folder type' });
    }

    const { images } = await listImages(folderType);
    return res.json({ images });
  } catch (error) {
    console.error('Error listing images:', error);
    return res.status(500).json({
      error: 'Failed to list images',
      details: error.message,
    });
  }
}
