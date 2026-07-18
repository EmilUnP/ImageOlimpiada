import { put, list, del } from '@vercel/blob';
import path from 'path';

const ADMIN_STORAGE_MODES = new Set(['local', 'blob', 'off']);
let hasLoggedDisabledStorage = false;

/**
 * Admin capture storage:
 * - local: Express saves under server/uploads (not persistent on Vercel)
 * - blob: Vercel Blob
 * - off: no admin captures
 */
export function getAdminStorageMode() {
  const configuredMode = process.env.ADMIN_STORAGE?.trim().toLowerCase();
  if (ADMIN_STORAGE_MODES.has(configuredMode)) return configuredMode;

  return process.env.VERCEL ? 'off' : 'local';
}

const shouldUseBlobStorage = () => getAdminStorageMode() === 'blob';

const logDisabledServerlessStorageOnce = () => {
  if (hasLoggedDisabledStorage) return;
  hasLoggedDisabledStorage = true;
  console.log(
    `[admin-storage] ${getAdminStorageMode()} mode: skipping Vercel Blob writes. ` +
      'Local files are only persisted by the Express development server.'
  );
};

/**
 * Save uploaded image to Vercel Blob Storage
 */
export async function saveUploadedImage(base64Image, folderType, metadata = {}) {
  try {
    if (!shouldUseBlobStorage()) {
      logDisabledServerlessStorageOnce();
      return null;
    }

    // Validate folderType
    if (!folderType || (folderType !== 'enhancement' && folderType !== 'translation')) {
      console.error(`Invalid folderType: ${folderType}`);
      return null;
    }
    
    // Extract image data and MIME type
    let mimeType = "image/jpeg";
    let base64Data = base64Image;
    
    if (!base64Image || typeof base64Image !== 'string') {
      console.error('Invalid base64Image: not a string or empty');
      return null;
    }
    
    if (base64Image.includes('data:image/')) {
      const mimeMatch = base64Image.match(/data:image\/([^;]+)/);
      if (mimeMatch) {
        mimeType = `image/${mimeMatch[1]}`;
      }
      base64Data = base64Image.split(',')[1] || base64Image;
    }
    
    // Validate base64 data
    if (!base64Data || base64Data.length === 0) {
      console.error('Invalid base64 data: empty after extraction');
      return null;
    }
    
    // Determine file extension
    const extMap = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'image/bmp': 'bmp'
    };
    const extension = extMap[mimeType] || 'jpg';
    
    // Generate filename with timestamp and metadata
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const mode = (metadata.mode || metadata.stage || 'unknown').replace(/[^a-zA-Z0-9]/g, '_');
    const language = (metadata.targetLanguage || metadata.language || 'unknown').replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `${timestamp}_${mode}_${language}.${extension}`;
    const metadataFilename = `${timestamp}_${mode}_${language}.json`;
    
    // Convert base64 to buffer
    let buffer;
    try {
      buffer = Buffer.from(base64Data, 'base64');
      if (buffer.length === 0) {
        console.error('Failed to decode base64: buffer is empty');
        return null;
      }
    } catch (decodeError) {
      console.error('Error decoding base64:', decodeError);
      return null;
    }
    
    // Get Blob Storage token
    const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
    
    if (!BLOB_TOKEN) {
      console.warn('⚠️  BLOB_READ_WRITE_TOKEN not set - skipping file save');
      return null;
    }
    
    try {
      console.log(`📤 Saving to Vercel Blob Storage: ${folderType}/${filename}`);
      console.log(`   Buffer size: ${(buffer.length / 1024).toFixed(2)} KB`);
      console.log(`   MIME type: ${mimeType}`);
      
      // Upload image to Vercel Blob
      const imagePath = `${folderType}/${filename}`;
      const imageBlob = await put(imagePath, buffer, {
        access: 'public',
        contentType: mimeType,
        addRandomSuffix: false,
        token: BLOB_TOKEN,
      });
      
      console.log(`✅ Successfully saved to Vercel Blob: ${imageBlob.url}`);
      console.log(`   Path: ${imageBlob.pathname}`);
      
      // Save metadata as JSON to Blob
      const metadataContent = {
        filename,
        url: imageBlob.url,
        timestamp: new Date().toISOString(),
        mimeType,
        size: buffer.length,
        ...metadata
      };
      
      const metadataPath = `${folderType}/${metadataFilename}`;
      const metadataBlob = await put(
        metadataPath,
        Buffer.from(JSON.stringify(metadataContent, null, 2)),
        {
          access: 'public',
          contentType: 'application/json',
          addRandomSuffix: false,
          token: BLOB_TOKEN,
        }
      );
      
      console.log(`✅ Successfully saved metadata to Vercel Blob: ${metadataBlob.url}`);
      
      return {
        filename,
        url: imageBlob.url,
        metadataUrl: metadataBlob.url,
        path: imageBlob.pathname,
        size: buffer.length,
        mimeType
      };
    } catch (blobError) {
      console.error('❌ Error saving to Vercel Blob:', blobError);
      console.error('   Error message:', blobError.message);
      console.error('   Error stack:', blobError.stack);
      return null;
    }
  } catch (error) {
    console.error('Error in saveUploadedImage:', error);
    console.error('Error stack:', error.stack);
    return null;
  }
}

/**
 * List images from Blob Storage
 */
export async function listImages(folderType) {
  try {
    if (!shouldUseBlobStorage()) {
      return { images: [] };
    }

    console.log(`📥 listImages called for folderType: ${folderType}`);
    
    const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
    
    if (!BLOB_TOKEN) {
      console.warn('⚠️  BLOB_READ_WRITE_TOKEN not set');
      return { images: [] };
    }
    
    console.log(`🔍 Listing blobs with prefix: ${folderType}/`);
    
    // List all blobs in the folder
    const { blobs } = await list({
      prefix: `${folderType}/`,
      limit: 1000,
      token: BLOB_TOKEN,
    });
    
    console.log(`📋 Found ${blobs.length} total blobs in ${folderType}/`);
    
    // Filter for image files
    const imageFiles = blobs.filter(blob => {
      const ext = path.extname(blob.pathname).toLowerCase();
      const isImage = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(ext);
      if (isImage) {
        console.log(`  ✅ Image file: ${blob.pathname}`);
      }
      return isImage;
    });
    
    console.log(`🖼️  Found ${imageFiles.length} image files`);
    
    // Build images array with metadata
    const images = await Promise.all(
      imageFiles.map(async (blob) => {
        // Try to find corresponding metadata file
        const metadataFilename = blob.pathname.replace(/\.[^/.]+$/, '') + '.json';
        const metadataBlob = blobs.find(b => b.pathname === metadataFilename);
        
        let metadata = {};
        if (metadataBlob) {
          try {
            console.log(`  📄 Found metadata file: ${metadataFilename}`);
            const metadataResponse = await fetch(metadataBlob.url);
            metadata = await metadataResponse.json();
          } catch (e) {
            console.error(`  ⚠️  Error reading metadata from blob ${metadataFilename}:`, e);
          }
        } else {
          console.log(`  ⚠️  No metadata file found for: ${blob.pathname}`);
        }
        
        return {
          filename: path.basename(blob.pathname),
          url: blob.url,
          size: blob.size,
          created: new Date(blob.uploadedAt),
          modified: new Date(blob.uploadedAt),
          ...metadata
        };
      })
    );
    
    // Sort by created date (newest first)
    images.sort((a, b) => new Date(b.created) - new Date(a.created));
    
    console.log(`✅ Returning ${images.length} images`);
    return { images };
  } catch (error) {
    console.error('❌ Error listing images from Blob Storage:', error);
    console.error('   Error message:', error.message);
    console.error('   Error stack:', error.stack);
    throw error;
  }
}

/**
 * Delete image from Blob Storage
 */
export async function deleteImage(folderType, filename) {
  try {
    if (!shouldUseBlobStorage()) {
      throw new Error(
        `Admin storage is "${getAdminStorageMode()}"; Blob deletion is disabled.`
      );
    }

    const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
    
    if (!BLOB_TOKEN) {
      throw new Error('BLOB_READ_WRITE_TOKEN not set');
    }
    
    // Delete the image file
    const imagePath = `${folderType}/${filename}`;
    await del(imagePath, { token: BLOB_TOKEN });
    
    // Try to delete associated metadata file
    const metadataFile = filename.replace(/\.[^/.]+$/, '') + '.json';
    const metadataPath = `${folderType}/${metadataFile}`;
    try {
      await del(metadataPath, { token: BLOB_TOKEN });
    } catch (e) {
      // Metadata file might not exist, that's okay
      console.log('Metadata file not found or already deleted:', metadataPath);
    }
    
    console.log(`✅ Successfully deleted from Vercel Blob: ${imagePath}`);
    return { success: true };
  } catch (error) {
    console.error('Error deleting from Blob Storage:', error);
    throw error;
  }
}

