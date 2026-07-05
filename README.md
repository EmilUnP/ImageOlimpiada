# AI Image Optimizer

Enhance image quality and translate text in images using AI. Built with React, Express, and Google Gemini (or OpenRouter).

## Features

- **Image Quality Improver** — 8 enhancement modes with adjustable intensity and batch processing
- **Text Translation** — Detect text in images, translate to multiple languages, and apply translations back to the image

## Quick Start

### Prerequisites

- Node.js 18+
- A Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey), or an OpenRouter key from [openrouter.ai/keys](https://openrouter.ai/keys)

### Setup

```bash
npm install
```

Create a `.env` file in the project root:

```env
GEMINI_API_KEY=your_api_key_here
PORT=3001
```

Optional:

```env
AI_PROVIDER=gemini          # or openrouter
OPENROUTER_API_KEY=...      # if using OpenRouter
BLOB_READ_WRITE_TOKEN=...   # for persistent image storage on Vercel
VITE_API_URL=               # leave empty for auto-detection
```

### Run locally

```bash
npm run dev:all
```

- Frontend: http://localhost:8080
- Backend: http://localhost:3001
- Admin panel: http://localhost:8080/admin

Or run separately:

```bash
npm run dev:backend   # API on :3001
npm run dev           # Frontend on :8080
```

## Vercel Deployment

1. Push to GitHub and import the project in [Vercel](https://vercel.com)
2. Set environment variables: `GEMINI_API_KEY` (and optionally `BLOB_READ_WRITE_TOKEN`, `OPENROUTER_API_KEY`)
3. Deploy — API routes in `/api` are deployed as serverless functions

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/enhance-image` | POST | Enhance an image |
| `/api/enhancement-modes` | GET | List enhancement modes |
| `/api/detect-text` | POST | Detect text in an image |
| `/api/translate-text` | POST | Translate text strings |
| `/api/translate-image` | POST | Apply translations to an image |
| `/api/admin/images/:folderType` | GET | List uploaded images |
| `/api/admin/images/:folderType/:filename` | DELETE | Delete an uploaded image |

## Troubleshooting

**"AI service not configured"** — Set `GEMINI_API_KEY` in `.env` (local) or Vercel environment variables.

**"Failed to process image" (local)** — Ensure the backend is running on port 3001.

**Admin page empty on Vercel** — Set `BLOB_READ_WRITE_TOKEN` for persistent blob storage.

## License

MIT
