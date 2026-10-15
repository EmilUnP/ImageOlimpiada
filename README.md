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
GEMINI_VISION_MODEL=gemini-2.5-pro
GEMINI_IMAGE_MODEL=gemini-3-pro-image
PORT=3001
```

Model names come **only** from `.env` — there are no defaults in the code. With OpenRouter, set `OPENROUTER_<FAMILY>_VISION_MODEL` and `OPENROUTER_<FAMILY>_IMAGE_MODEL` for each family (see `.env.example`). The Translation tool has no model switch: it always uses the family in `TRANSLATION_MODEL_FAMILY` (`openai` by default); the Gemini/OpenAI switch only affects Enhance.

```env
AI_PROVIDER=openrouter
OPENROUTER_API_KEY=...
OPENROUTER_GEMINI_VISION_MODEL=google/gemini-2.5-pro
OPENROUTER_GEMINI_IMAGE_MODEL=google/gemini-3-pro-image-preview
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
2. Set environment variables: the API key **and the model names** — same keys as your `.env` (`GEMINI_API_KEY` + `GEMINI_*_MODEL`, or `AI_PROVIDER=openrouter` + `OPENROUTER_API_KEY` + `OPENROUTER_*_MODEL`)
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

**"No … model configured. Set … in .env"** — The named model key is missing; add it to `.env` (or Vercel environment variables). The backend startup log lists every model it read.

**"Failed to process image" (local)** — Ensure the backend is running on port 3001.

## License

MIT
