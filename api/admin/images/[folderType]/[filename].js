import { deleteImage } from '../../../lib/blob-storage.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let folderType = req.query.folderType;
    let filename = req.query.filename;

    if ((!folderType || !filename) && req.url) {
      const urlMatch = req.url.match(/\/(?:api\/)?admin\/images\/([^/]+)\/([^/?]+)/);
      if (urlMatch) {
        folderType = folderType || urlMatch[1];
        filename = filename || decodeURIComponent(urlMatch[2]);
      }
    }

    if (!folderType || (folderType !== 'enhancement' && folderType !== 'translation')) {
      return res.status(400).json({ error: 'Invalid folder type' });
    }

    if (!filename) {
      return res.status(400).json({ error: 'Filename is required' });
    }

    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }

    await deleteImage(folderType, filename);
    return res.json({ success: true, message: 'Image deleted successfully' });
  } catch (error) {
    console.error('Error deleting image:', error);
    return res.status(500).json({
      error: 'Failed to delete image',
      details: error.message,
    });
  }
}
