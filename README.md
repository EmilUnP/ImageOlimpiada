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

Create a `.env` file in the project root (see `.env.example`):

```env
AI_PROVIDER=gemini
GEMINI_API_KEY=your_api_key_here
PORT=3001
```

Optional:

```env
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=...
VITE_API_URL=               # leave empty for auto-detection
```

### Run locally

```bash
npm run dev:all
```

- Frontend: http://localhost:8080
- Backend: http://localhost:3001

Or run separately:

```bash
npm run dev:backend   # API on :3001
npm run dev           # Frontend on :8080
```

## Vercel Deployment

1. Push to GitHub and import the project in [Vercel](https://vercel.com)
2. Set environment variables: `GEMINI_API_KEY` (and optionally `OPENROUTER_API_KEY` / `AI_PROVIDER`)
3. Deploy — API routes in `/api` are deployed as serverless functions

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/enhance-image` | POST | Enhance an image |
| `/api/enhancement-modes` | GET | List enhancement modes |
| `/api/ai-config` | GET | Public AI provider / model-family config |
| `/api/detect-text` | POST | Detect text in an image |
| `/api/translate-text` | POST | Translate text strings |
| `/api/translate-image` | POST | Apply translations to an image |

## Troubleshooting

**"AI service not configured"** — Set `GEMINI_API_KEY` (or OpenRouter keys) in `.env` or Vercel environment variables.

**"Failed to process image" (local)** — Ensure the backend is running on port 3001.

## License

MIT
