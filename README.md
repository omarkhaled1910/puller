# YouTube Clipper | مولد مقاطع فيديو تعليمية

A web application that analyzes YouTube videos with Arabic subtitles and automatically generates educational clip plans using AI.

## Overview

This application helps content creators extract educational short videos (2.5-3 minutes each) from longer YouTube videos. It uses OpenAI's GPT-4o-mini to identify the most valuable educational segments and generates Arabic titles, summaries, and key points for each clip.

## Features

- **YouTube Integration** - Automatically fetches transcripts from YouTube videos with subtitles
- **AI-Powered Analysis** - Uses OpenAI GPT-4o-mini to identify optimal educational segments
- **Arabic Localization** - All content generated in Modern Standard Arabic (MSA)
- **Interactive UI** - Approve or reject suggested clips with visual feedback
- **Timestamp Precision** - Exact start/end times for each clip segment
- **Responsive Design** - Works on desktop and mobile devices
- **Dark Mode Support** - Built-in dark/light theme support
- **Error Handling** - Comprehensive error handling for various failure scenarios

## Tech Stack

- **Framework**: Next.js 15.1.3 with App Router
- **Frontend**: React 19.0.0 with TypeScript
- **Styling**: Tailwind CSS 3.4.17
- **State Management**: TanStack React Query 5.62.7
- **AI**: OpenAI API (GPT-4o-mini)
- **YouTube**: youtube-transcript package
- **Validation**: Zod for runtime type safety

## Prerequisites

- Node.js (v18 or higher)
- OpenAI API key
- YouTube videos with available captions/subtitles

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd puller
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env.local` file in the root directory:
```env
OPENAI_API_KEY=your_openai_api_key_here
```

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3009](http://localhost:3009) in your browser.

## Usage

1. **Paste a YouTube URL** - Enter a YouTube video URL that has Arabic subtitles
2. **Click Analyze** - The app will fetch and process the transcript
3. **Review Suggestions** - AI will suggest 3 educational segments with:
   - Arabic title
   - Summary
   - Key points
   - Timestamps
4. **Approve or Reject** - Mark clips as approved or rejected based on quality
5. **Use Timestamps** - Use the provided timestamps for video editing

## Project Structure

```
puller/
├── app/                    # Next.js app router pages
│   ├── api/               # API routes
│   ├── layout.tsx         # Root layout with RTL support
│   └── page.tsx           # Main page
├── components/            # React components
│   ├── ClipCard.tsx       # Clip display component
│   └── VideoInputForm.tsx # URL input form
├── lib/                   # Utilities and types
│   ├── openai.ts          # OpenAI integration
│   ├── transcript.ts      # YouTube transcript fetching
│   └── types.ts           # TypeScript definitions
├── public/                # Static assets
└── package.json           # Dependencies and scripts
```

## Notes & Limitations

- Videos must have available captions/subtitles
- Best results with videos 8+ minutes long
- Target clip duration: 2.5-3 minutes each
- All generated content is in Modern Standard Arabic (MSA)
- Requires valid OpenAI API key with available credits

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server on port 3009 |
| `npm run build` | Build for production |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |

## License

MIT
