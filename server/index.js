#!/usr/bin/env node

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { put, list, del } from '@vercel/blob';
import {
  createGenerativeAI,
  validateAiConfig,
  classifyAiError,
  resolveAiProvider,
  DEFAULT_IMAGE_MODEL,
} from './lib/ai-provider.js';
import {
  createTextTranslationService,
  TranslationServiceError,
  classifyGeminiError,
} from './lib/text-translation.js';
import { applyTextOverlaysToImage } from './lib/local-image-translation.js';
import { enhancementPrompts, getEnhancementModesList, buildEnhancementPrompt } from './lib/enhancement-modes.js';
import { TEXTBOOK_OCR_PROMPT, buildTextbookImageTranslationPrompt } from './lib/textbook-prompts.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Detect if running on Vercel
// Vercel sets VERCEL=1 and VERCEL_ENV (production, preview, development)
const IS_VERCEL = process.env.VERCEL === '1' || !!process.env.VERCEL_ENV || !!process.env.VERCEL_URL;

// Create upload directories - use /tmp on Vercel (temporary storage)
// Note: Files in /tmp are deleted after function execution on Vercel
// For persistent storage, consider using Vercel Blob Storage or another cloud storage service
const getUploadDirs = () => {
  if (IS_VERCEL) {
    // On Vercel, use /tmp directory (temporary, files are deleted after function execution)
    return {
      enhancement: path.join('/tmp', 'uploads', 'enhancement'),
      translation: path.join('/tmp', 'uploads', 'translation')
    };
  } else {
    // Local development - use project directory
    return {
      enhancement: path.join(__dirname, 'uploads', 'enhancement'),
      translation: path.join(__dirname, 'uploads', 'translation')
    };
  }
};

const UPLOAD_DIRS = getUploadDirs();

// Ensure upload directories exist
Object.entries(UPLOAD_DIRS).forEach(([type, dir]) => {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`📁 Created upload directory: ${dir} (${type})`);
    } else {
      console.log(`📁 Upload directory exists: ${dir} (${type})`);
    }
    
    // Verify directory is writable
    try {
      const testFile = path.join(dir, '.test-write');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      console.log(`✅ Directory is writable: ${dir}`);
    } catch (error) {
      console.error(`❌ Directory is NOT writable: ${dir}`, error);
      if (IS_VERCEL) {
        console.warn('⚠️  On Vercel, files saved to /tmp are temporary and will be deleted after function execution.');
        console.warn('⚠️  For persistent storage, consider using Vercel Blob Storage or another cloud storage service.');
      }
    }
  } catch (error) {
    console.error(`❌ Error creating directory ${dir}:`, error);
    if (IS_VERCEL) {
      console.warn('⚠️  File saving is disabled on Vercel. Files will not be saved.');
    }
  }
});

// Log environment detection and Blob Storage status
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
console.log('🔍 Environment Detection:');
console.log(`   VERCEL env var: ${process.env.VERCEL}`);
console.log(`   VERCEL_ENV: ${process.env.VERCEL_ENV}`);
console.log(`   VERCEL_URL: ${process.env.VERCEL_URL}`);
console.log(`   IS_VERCEL: ${IS_VERCEL}`);
console.log(`   BLOB_READ_WRITE_TOKEN: ${BLOB_TOKEN ? '✅ Set' : '❌ Not set'}`);

if (IS_VERCEL) {
  if (BLOB_TOKEN) {
    console.log('✅ Running on Vercel with Blob Storage enabled');
    console.log('💾 Files will be saved to Vercel Blob Storage');
  } else {
    console.log('⚠️  Running on Vercel - BLOB_READ_WRITE_TOKEN not set');
    console.log('⚠️  Files will NOT be saved without Blob Storage token');
    console.log('💡 Add BLOB_READ_WRITE_TOKEN to Vercel environment variables');
  }
} else if (BLOB_TOKEN) {
  console.log('💡 BLOB_READ_WRITE_TOKEN detected - will use Blob Storage for file saving');
  console.log('   (Even in local development if token is set)');
}

// Helper function to save uploaded image
async function saveUploadedImage(base64Image, folderType, metadata = {}) {
  try {
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
    
    // Check if Blob Storage token is available (use it if available, regardless of environment)
    const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
    
    // Use Blob Storage if token is available (works on Vercel and can work locally too)
    if (BLOB_TOKEN) {
      try {
        console.log(`📤 Attempting to save to Vercel Blob Storage: ${folderType}/${filename}`);
        console.log(`   Buffer size: ${(buffer.length / 1024).toFixed(2)} KB`);
        console.log(`   MIME type: ${mimeType}`);
        console.log(`   IS_VERCEL detected: ${IS_VERCEL}`);
        
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
        console.log(`   Size: ${(buffer.length / 1024).toFixed(2)} KB`);
        
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
        
        // If we're on Vercel, don't fall back to filesystem
        if (IS_VERCEL) {
          console.error('   On Vercel - cannot fall back to filesystem');
          return null;
        }
        
        // On local, fall through to filesystem save
        console.warn('   Falling back to local filesystem save');
      }
    } else if (IS_VERCEL) {
      // On Vercel without token, can't save
      console.warn('⚠️  Running on Vercel but BLOB_READ_WRITE_TOKEN not set - cannot save files');
      return null;
    }
    
    // Local development - save to filesystem
    const targetDir = UPLOAD_DIRS[folderType];
    if (!fs.existsSync(targetDir)) {
      try {
        fs.mkdirSync(targetDir, { recursive: true });
        console.log(`📁 Created upload directory: ${targetDir}`);
      } catch (error) {
        console.error(`❌ Failed to create directory ${targetDir}:`, error);
        return null;
      }
    }
    
    // Save file to local filesystem (buffer already created above)
    const filePath = path.join(targetDir, filename);
    fs.writeFileSync(filePath, buffer);
    console.log(`💾 Saved uploaded image: ${filename} (${(buffer.length / 1024).toFixed(2)} KB) in ${folderType} folder`);
    console.log(`   Full path: ${filePath}`);
    
    // Save metadata as JSON file
    const metadataPath = path.join(targetDir, metadataFilename);
    const metadataContent = {
      filename,
      timestamp: new Date().toISOString(),
      mimeType,
      size: buffer.length,
      ...metadata
    };
    fs.writeFileSync(metadataPath, JSON.stringify(metadataContent, null, 2));
    console.log(`💾 Saved metadata: ${metadataFilename}`);
    
    return { filename, filePath, metadataPath };
  } catch (error) {
    console.error('Error saving uploaded image:', error);
    console.error('Error stack:', error.stack);
    if (IS_VERCEL) {
      console.warn('⚠️  This error occurred on Vercel. File saving requires Vercel Blob Storage or another cloud storage solution.');
      console.warn('💡 See VERCEL_STORAGE_SETUP.md for setup instructions.');
    }
    return null;
  }
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Serve uploaded images statically
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Image Optimizer AI Backend is running!' });
});

// Debug endpoint for Blob Storage testing
app.get('/api/debug/blob-storage', async (req, res) => {
  try {
    const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
    const envInfo = {
      IS_VERCEL,
      VERCEL: process.env.VERCEL,
      VERCEL_ENV: process.env.VERCEL_ENV,
      VERCEL_URL: process.env.VERCEL_URL,
      BLOB_TOKEN_SET: !!BLOB_TOKEN,
      BLOB_TOKEN_LENGTH: BLOB_TOKEN ? BLOB_TOKEN.length : 0,
    };
    
    if (!BLOB_TOKEN) {
      return res.json({
        status: 'error',
        message: 'BLOB_READ_WRITE_TOKEN not set',
        env: envInfo
      });
    }
    
    // Try to list blobs to verify connection
    try {
      const { blobs } = await list({
        limit: 10,
        token: BLOB_TOKEN,
      });
      
      return res.json({
        status: 'success',
        message: 'Blob Storage connection successful',
        blobCount: blobs.length,
        blobs: blobs.map(b => ({
          pathname: b.pathname,
          url: b.url,
          size: b.size,
          uploadedAt: b.uploadedAt,
        })),
        env: envInfo
      });
    } catch (blobError) {
      return res.json({
        status: 'error',
        message: 'Failed to connect to Blob Storage',
        error: blobError.message,
        errorStack: blobError.stack,
        env: envInfo
      });
    }
  } catch (error) {
    return res.status(500).json({
      status: 'error',
      message: 'Internal server error',
      error: error.message,
      errorStack: error.stack
    });
  }
});

// Get available enhancement modes
app.get('/api/enhancement-modes', (req, res) => {
  res.json({ modes: getEnhancementModesList() });
});

// Admin API endpoints for viewing uploaded images
app.get('/api/admin/images/:folderType', async (req, res) => {
  try {
    const { folderType } = req.params;
    
    if (folderType !== 'enhancement' && folderType !== 'translation') {
      return res.status(400).json({ error: 'Invalid folder type' });
    }
    
    // On Vercel, fetch from Blob Storage
    if (IS_VERCEL) {
      try {
        const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
        
        if (!BLOB_TOKEN) {
          return res.json({ 
            images: [],
            message: 'BLOB_READ_WRITE_TOKEN not set. Files cannot be retrieved.',
            vercel: true
          });
        }
        
        // List all blobs in the folder
        const { blobs } = await list({
          prefix: `${folderType}/`,
          limit: 1000,
          token: BLOB_TOKEN,
        });
        
        // Filter for image files and metadata files
        const imageFiles = blobs.filter(blob => {
          const ext = path.extname(blob.pathname).toLowerCase();
          return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(ext);
        });
        
        // Build images array with metadata
        const images = await Promise.all(
          imageFiles.map(async (blob) => {
            // Try to find corresponding metadata file
            const metadataFilename = blob.pathname.replace(/\.[^/.]+$/, '') + '.json';
            const metadataBlob = blobs.find(b => b.pathname === metadataFilename);
            
            let metadata = {};
            if (metadataBlob) {
              try {
                const metadataResponse = await fetch(metadataBlob.url);
                metadata = await metadataResponse.json();
              } catch (e) {
                console.error('Error reading metadata from blob:', e);
              }
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
        
        console.log(`✅ Retrieved ${images.length} images from Blob Storage`);
        return res.json({ images });
      } catch (blobError) {
        console.error('❌ Error fetching from Vercel Blob:', blobError);
        console.error('   Error message:', blobError.message);
        
        // If on Vercel, return error. Otherwise fall back to filesystem
        if (IS_VERCEL) {
          return res.status(500).json({ 
            error: 'Failed to fetch images from Blob Storage', 
            details: blobError.message 
          });
        }
        console.warn('   Falling back to filesystem...');
      }
    } else if (IS_VERCEL) {
      // On Vercel without token, return empty
      return res.json({ 
        images: [],
        message: 'BLOB_READ_WRITE_TOKEN not set. Files cannot be retrieved.',
        vercel: true
      });
    }
    
    // Local development - read from filesystem (or fallback)
    const folderPath = UPLOAD_DIRS[folderType];
    
    if (!fs.existsSync(folderPath)) {
      return res.json({ images: [] });
    }
    
    const files = fs.readdirSync(folderPath);
    const images = files
      .filter(file => {
        const ext = path.extname(file).toLowerCase();
        return ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'].includes(ext);
      })
      .map(file => {
        const filePath = path.join(folderPath, file);
        const stats = fs.statSync(filePath);
        const metadataFile = file.replace(/\.[^/.]+$/, '') + '.json';
        const metadataPath = path.join(folderPath, metadataFile);
        
        let metadata = {};
        if (fs.existsSync(metadataPath)) {
          try {
            metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
          } catch (e) {
            console.error('Error reading metadata:', e);
          }
        }
        
        return {
          filename: file,
          url: `/uploads/${folderType}/${file}`,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime,
          ...metadata
        };
      })
      .sort((a, b) => new Date(b.created) - new Date(a.created)); // Newest first
    
    res.json({ images });
  } catch (error) {
    console.error('Error listing images:', error);
    res.status(500).json({ error: 'Failed to list images', details: error.message });
  }
});

// Delete image endpoint
app.delete('/api/admin/images/:folderType/:filename', async (req, res) => {
  try {
    const { folderType, filename } = req.params;
    
    if (folderType !== 'enhancement' && folderType !== 'translation') {
      return res.status(400).json({ error: 'Invalid folder type' });
    }
    
    // Security: prevent directory traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    
    // Try to delete from Blob Storage if token is available
    const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;
    
    if (BLOB_TOKEN) {
      try {
        console.log(`🗑️ Attempting to delete from Blob Storage: ${folderType}/${filename}`);
        
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
        return res.json({ success: true, message: 'Image deleted successfully' });
      } catch (blobError) {
        console.error('❌ Error deleting from Vercel Blob:', blobError);
        console.error('   Error message:', blobError.message);
        
        // If on Vercel, return error. Otherwise fall back to filesystem
        if (IS_VERCEL) {
          return res.status(500).json({ 
            error: 'Failed to delete image from Blob Storage', 
            details: blobError.message 
          });
        }
        console.warn('   Falling back to filesystem delete...');
      }
    } else if (IS_VERCEL) {
      // On Vercel without token, can't delete
      return res.status(500).json({ error: 'BLOB_READ_WRITE_TOKEN not set' });
    }
    
    // Local development - delete from filesystem (or fallback)
    const folderPath = UPLOAD_DIRS[folderType];
    const filePath = path.join(folderPath, filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Delete the image file
    fs.unlinkSync(filePath);
    
    // Try to delete associated metadata file
    const metadataFile = filename.replace(/\.[^/.]+$/, '') + '.json';
    const metadataPath = path.join(folderPath, metadataFile);
    if (fs.existsSync(metadataPath)) {
      fs.unlinkSync(metadataPath);
    }
    
    console.log(`🗑️ Deleted image: ${filename} from ${folderType} folder`);
    res.json({ success: true, message: 'Image deleted successfully' });
  } catch (error) {
    console.error('Error deleting image:', error);
    res.status(500).json({ error: 'Failed to delete image', details: error.message });
  }
});

// Image enhancement endpoint
app.post('/api/enhance-image', async (req, res) => {
  try {
    const { image, mode = 'textbook', intensity = 'medium' } = req.body;
    
    if (!image) {
      return res.status(400).json({ error: 'No image provided' });
    }

    // Save uploaded image for analysis
    await saveUploadedImage(image, 'enhancement', {
      mode,
      intensity,
      type: 'enhancement',
      endpoint: '/api/enhance-image'
    });

    const configError = validateAiConfig();
    if (configError) {
      return res.status(configError.status).json(configError.body);
    }

    // Validate mode
    const validMode = enhancementPrompts[mode] ? mode : 'photo';
    const prompt = buildEnhancementPrompt(validMode, intensity);

    // Initialize Google Generative AI
    const genAI = createGenerativeAI();
    const model = genAI.getGenerativeModel({ model: DEFAULT_IMAGE_MODEL });

    try {
      // Determine MIME type from base64 string
      let mimeType = "image/jpeg";
      if (image.includes('data:image/')) {
        const mimeMatch = image.match(/data:image\/([^;]+)/);
        if (mimeMatch) {
          mimeType = `image/${mimeMatch[1]}`;
        }
      }
      
      const base64Data = image.split(',')[1] || image;
      const result = await model.generateContent([
        prompt,
        { inlineData: { data: base64Data, mimeType } }
      ]);

      const response = await result.response;
      
      // Try to get image from response
      let enhancedImageBase64 = null;
      
      if (response.candidates && response.candidates[0]) {
        const parts = response.candidates[0].content?.parts || [];
        for (const part of parts) {
          if (part.inlineData?.data) {
            enhancedImageBase64 = part.inlineData.data;
            break;
          }
        }
      }
      
      // If enhanced image is returned, use it
      if (enhancedImageBase64) {
        return res.json({ 
          enhancedImage: `data:${mimeType};base64,${enhancedImageBase64}`,
          message: `Image enhanced successfully using ${validMode} mode.`,
          mode: validMode
        });
      } else {
        // Return original image with analysis
        const text = response.text();
        return res.json({ 
          enhancedImage: image,
          analysis: text,
          message: `Image processed using ${validMode} mode. Note: Gemini provides analysis, not enhanced images.`,
          mode: validMode
        });
      }

    } catch (error) {
      console.error('AI API error:', error);
      const aiError = classifyAiError(error);
      return res.status(aiError.status).json({
        error: aiError.message,
        message: aiError.message,
        details: aiError.details,
        retryAfter: aiError.retryAfter,
      });
    }

  } catch (error) {
    return res.status(500).json({ 
      error: 'An unexpected error occurred', 
      details: error.message || 'Unknown error'
    });
  }
});

// Text detection endpoint
app.post('/api/detect-text', async (req, res) => {
  try {
    const { image, model: requestedModel } = req.body;
    
    if (!image) {
      return res.status(400).json({ error: 'No image provided' });
    }

    // Save uploaded image for analysis (this is part of translation workflow)
    await saveUploadedImage(image, 'translation', {
      model: requestedModel || 'default',
      type: 'translation',
      stage: 'text-detection',
      endpoint: '/api/detect-text'
    });

    const configError = validateAiConfig();
    if (configError) {
      return res.status(configError.status).json(configError.body);
    }

    // Model selection: Use requested model or default to best text detection model
     const availableModels = [
      'gemini-2.0-flash-exp',      // Best for text detection (experimental)
      'gemini-3-pro-image-preview', // Current default
    ];
    
    // Default to flash which is more stable and available
    const modelName = requestedModel && availableModels.includes(requestedModel) 
      ? requestedModel 
      : 'gemini-2.0-flash-exp'; // Default to flash for better availability

    const prompt = TEXTBOOK_OCR_PROMPT;

    // Initialize Google Generative AI
    const genAI = createGenerativeAI();
    // Note: getGenerativeModel doesn't validate the model until generateContent is called
    // So we'll handle model errors in the API call catch block
    const model = genAI.getGenerativeModel({ model: modelName });
    let actualModelName = modelName;
    console.log(`Attempting to use model: ${modelName} for text detection`);

    try {
      // Determine MIME type from base64 string
      let mimeType = "image/jpeg";
      if (image.includes('data:image/')) {
        const mimeMatch = image.match(/data:image\/([^;]+)/);
        if (mimeMatch) {
          mimeType = `image/${mimeMatch[1]}`;
        }
      }
      
      const base64Data = image.split(',')[1] || image;
      
      // Use generation config for better JSON output
      const generationConfig = {
        temperature: 0.1, // Low temperature for more deterministic, accurate text detection
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 8192,
      };
      
      let result;
      let response;
      let text;
      
      try {
        result = await model.generateContent(
          [
            prompt,
            { inlineData: { data: base64Data, mimeType } }
          ],
          { generationConfig }
        );
        response = await result.response;
        text = response.text();
      } catch (apiError) {
        // If the model fails (404 or other API error), try fallback models
        if (apiError.status === 404 || apiError.message?.includes('not found') || apiError.message?.includes('not supported')) {
          console.warn(`Model ${actualModelName} failed with error:`, apiError.message);
          console.log('Attempting to use fallback model: gemini-2.0-flash');
          
          try {
            const fallbackModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
            result = await fallbackModel.generateContent(
              [
                prompt,
                { inlineData: { data: base64Data, mimeType } }
              ],
              { generationConfig }
            );
            response = await result.response;
            text = response.text();
            actualModelName = 'gemini-2.0-flash-exp';
            console.log('Successfully used fallback model');
          } catch (fallbackError) {
            console.error('Fallback model also failed:', fallbackError);
            throw apiError; // Throw original error
          }
        } else {
          throw apiError; // Re-throw if it's not a model availability error
        }
      }
      
      // Try to parse JSON from response with multiple strategies
      let detectedTexts = [];
      try {
        // Strategy 1: Extract JSON from markdown code blocks
        const jsonMatch = text.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
        if (jsonMatch) {
          detectedTexts = JSON.parse(jsonMatch[1]);
        } else {
          // Strategy 2: Find JSON array in the text
          const arrayMatch = text.match(/\[[\s\S]*\]/);
          if (arrayMatch) {
            detectedTexts = JSON.parse(arrayMatch[0]);
          } else {
            // Strategy 3: Try parsing the entire response as JSON
            detectedTexts = JSON.parse(text.trim());
          }
        }
      } catch (parseError) {
        console.warn('JSON parsing failed, attempting fallback extraction:', parseError.message);
        // Fallback: Try to extract structured data from text response
        // Look for patterns like: "text": "...", "confidence": ...
        try {
          const textMatches = Array.from(text.matchAll(/"text"\s*:\s*"([^"]+)"/g));
          const confidenceMatches = Array.from(text.matchAll(/"confidence"\s*:\s*([\d.]+)/g));
          
          const texts = textMatches.map(m => m[1]);
          const confidences = confidenceMatches.map(m => parseFloat(m[1]));
          
          if (texts.length > 0) {
            detectedTexts = texts.map((text, index) => ({
              text: text,
              confidence: confidences[index] || 0.7,
            }));
          } else {
            // Last resort: Split by lines and create basic text blocks
            const lines = text.split('\n')
              .filter(line => line.trim().length > 0)
              .filter(line => !line.match(/^[\[\]{}",\s]*$/)) // Filter out JSON structure lines
              .slice(0, 50); // Limit to 50 lines
            
            detectedTexts = lines.map((line, index) => ({
              id: `text-${index + 1}`,
              text: line.trim().replace(/^["']|["']$/g, ''), // Remove quotes
              confidence: 0.7,
            }));
          }
        } catch (fallbackError) {
          console.error('Fallback extraction also failed:', fallbackError);
          detectedTexts = [];
        }
      }

      // Ensure we have an array with proper structure
      if (!Array.isArray(detectedTexts)) {
        detectedTexts = [];
      }

      // Add IDs and ensure proper structure
      detectedTexts = detectedTexts.map((item, index) => ({
        id: item.id || `text-${index + 1}`,
        text: item.text || String(item),
        confidence: typeof item.confidence === 'number' ? item.confidence : 0.7,
        boundingBox: item.boundingBox || undefined,
      }));

            return res.json({ 
              detectedTexts,
              message: `Detected ${detectedTexts.length} text block(s) using ${actualModelName}`,
              model: actualModelName,
            });

    } catch (error) {
      console.error('Gemini API error:', error);
      return res.status(500).json({ 
        error: 'Failed to detect text in image',
        details: error.message || 'Unknown error'
      });
    }
  } catch (error) {
    console.error('Text detection error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message || 'Unknown error'
    });
  }
});

// Text translation endpoint (translates text only, not images)
app.post('/api/translate-text', async (req, res) => {
  try {
    const { texts, targetLanguage = 'en' } = req.body;

    if (!texts || !Array.isArray(texts) || texts.length === 0) {
      return res.status(400).json({ error: 'No texts provided' });
    }

    const configError = validateAiConfig();
    if (configError) {
      return res.status(configError.status).json(configError.body);
    }

    const genAI = createGenerativeAI();
    const translator = createTextTranslationService(genAI);

    try {
      const { translations, sanitizedCount, targetLanguageName } = await translator.translateTexts({
        texts,
        targetLanguage,
      });

      if (sanitizedCount === 0) {
        return res.json({
          translations,
          message: 'No valid text content received for translation',
        });
      }

      return res.json({
        translations,
        message: `Translated ${sanitizedCount} text(s) to ${targetLanguageName}`,
      });
    } catch (error) {
      const handledError = error instanceof TranslationServiceError ? error : classifyGeminiError(error);
      console.error('Gemini API error:', error);
      return res.status(handledError.statusCode).json({
        error: handledError.message,
        details: handledError.details || error.message || 'Unknown error',
      });
    }
  } catch (error) {
    console.error('Text translation error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error.message || 'Unknown error',
    });
  }
});

// Image text translation endpoint
app.post('/api/translate-image', async (req, res) => {
  try {
    const {
      image,
      targetLanguage = 'en',
      translatedTexts: translatedTextPairs,
      correctedTexts,
      quality = 'premium',
      fontMatching = 'auto',
      textStyle = 'adaptive',
      preserveFormatting = true,
      enhanceReadability = true
    } = req.body;
    
    if (!image) {
      return res.status(400).json({ error: 'No image provided' });
    }

    // Save uploaded image for analysis (final translation stage)
    await saveUploadedImage(image, 'translation', {
      targetLanguage,
      quality,
      fontMatching,
      textStyle,
      preserveFormatting,
      enhanceReadability,
      translatedTextsCount: translatedTextPairs ? translatedTextPairs.length : 0,
      type: 'translation',
      stage: 'image-translation',
      endpoint: '/api/translate-image'
    });

    const configError = validateAiConfig();
    if (configError) {
      return res.status(configError.status).json(configError.body);
    }

    // Language name mapping for better prompts
    const languageNames = {
      en: 'English',
      ru: 'Russian',
      az: 'Azerbaijani',
    };

    const targetLangName = languageNames[targetLanguage] || targetLanguage;

    const textPairs = (translatedTextPairs || [])
      .map((pair) => ({
        original: typeof pair.original === 'string' ? pair.original.trim() : '',
        translated: typeof pair.translated === 'string' ? pair.translated.trim() : '',
        boundingBox: pair.boundingBox,
      }))
      .filter((pair) => pair.original && pair.translated);

    const prompt = buildTextbookImageTranslationPrompt({
      textPairs,
      correctedTexts,
      targetLangName,
      quality,
      fontMatching,
      textStyle,
      preserveFormatting,
      enhanceReadability,
    });

    // Initialize Google Generative AI
    const genAI = createGenerativeAI();
    const model = genAI.getGenerativeModel({ model: DEFAULT_IMAGE_MODEL });

    try {
      // Determine MIME type from base64 string
      let mimeType = "image/jpeg";
      if (image.includes('data:image/')) {
        const mimeMatch = image.match(/data:image\/([^;]+)/);
        if (mimeMatch) {
          mimeType = `image/${mimeMatch[1]}`;
        }
      }
      
      const base64Data = image.split(',')[1] || image;
      const result = await model.generateContent([
        prompt,
        { inlineData: { data: base64Data, mimeType } }
      ]);

      const response = await result.response;
      
      // Try to get image from response
      let translatedImageBase64 = null;
      
      if (response.candidates && response.candidates[0]) {
        const parts = response.candidates[0].content?.parts || [];
        for (const part of parts) {
          if (part.inlineData?.data) {
            translatedImageBase64 = part.inlineData.data;
            break;
          }
        }
      }
      
      // If translated image is returned, use it
      if (!translatedImageBase64 && translatedTextPairs && translatedTextPairs.length > 0) {
        console.warn('Gemini did not return an inline image. Falling back to local renderer.');
        try {
          const overlayImage = await applyTextOverlaysToImage(image, translatedTextPairs);
          if (overlayImage) {
            return res.json({
              translatedImage: overlayImage,
              message: `Applied ${translatedTextPairs.length} translations using fallback renderer.`,
              targetLanguage: targetLangName,
            });
          }
        } catch (fallbackError) {
          console.error('Fallback translation renderer failed:', fallbackError);
        }
      }

      if (translatedImageBase64) {
        return res.json({
          translatedImage: `data:${mimeType};base64,${translatedImageBase64}`,
          message: `Image text translated successfully to ${targetLangName}.`,
          targetLanguage: targetLangName
        });
      } else {
        // Return original image with analysis
        const text = response.text();
        return res.json({
          translatedImage: image,
          analysis: text,
          message: `Translation processed. Note: Gemini may provide analysis instead of translated images.`,
          targetLanguage: targetLangName
        });
      }

    } catch (error) {
      console.error('AI API error:', error);
      const aiError = classifyAiError(error);
      return res.status(aiError.status).json({
        error: aiError.message,
        message: aiError.message,
        details: aiError.details,
        retryAfter: aiError.retryAfter,
      });
    }

  } catch (error) {
    return res.status(500).json({ 
      error: 'An unexpected error occurred', 
      details: error.message || 'Unknown error'
    });
  }
});

app.listen(PORT, () => {
  const provider = resolveAiProvider();
  console.log(`Backend running at http://localhost:${PORT} (${provider})`);
  console.log(`Frontend: http://localhost:8080 | Admin: http://localhost:8080/admin`);
});
