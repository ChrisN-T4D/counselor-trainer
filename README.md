# Counselor Trainer

A web app for counselor trainees to practice client sessions with AI role-play, track practice hours, and review transcripts.

## Stack

- **Next.js 16** (App Router, TypeScript)
- **PostgreSQL** + **Prisma** (Railway)
- **Auth.js** (credentials login)
- **Ollama** via OpenAI-compatible API (LLM)
- **ElevenLabs** planned for Phase 2 voice (TTS + STT)

## Local setup

1. Copy environment variables:

```bash
cp .env.example .env
```

2. Set `DATABASE_URL`, `AUTH_SECRET`, and your Ollama URL in `.env`:

```env
OPENAI_BASE_URL=https://your-ollama-host.example.com/v1
OPENAI_MODEL=llama3.1
```

3. Install dependencies and set up the database:

```bash
npm install
npx prisma migrate dev
npm run db:seed
```

4. Start the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), register an account, pick a scenario, and start a text practice session.

## Railway deployment

1. Create a Railway project with **PostgreSQL** and connect this repo.
2. Add environment variables from `.env.example` (Railway injects `DATABASE_URL` automatically).
3. Set build/start commands if needed:

   - **Build:** `npm run build`
   - **Start:** `npm run start` (runs migrations then starts the app)

4. After first deploy, seed scenarios:

```bash
railway run npm run db:seed
```

## Provider adapters

| Env var | Purpose |
|---------|---------|
| `OPENAI_BASE_URL` | Ollama / OpenAI / Azure OpenAI endpoint |
| `OPENAI_MODEL` | Model name on your LLM host |
| `TTS_PROVIDER` | `noop` (default) or `elevenlabs` |
| `STT_PROVIDER` | `noop` (default) or `elevenlabs` |

Swap URLs and providers without changing application code.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Generate Prisma client and build app |
| `npm run start` | Run migrations and start production server |
| `npm run db:migrate` | Create/apply migrations (dev) |
| `npm run db:seed` | Seed training scenarios |

## Project structure

```
src/
  app/           # Pages and API routes
  components/    # UI components
  lib/
    llm/         # LlmProvider (Ollama/OpenAI-compatible)
    voice/       # TtsProvider + SttProvider (noop → ElevenLabs)
    sessions/    # Prompt building
prisma/          # Schema and migrations
seeds/           # Scenario seed data
```

## Roadmap

- [x] Phase 0: Auth, dashboard, provider adapters
- [x] Phase 1: Text-only practice with Ollama
- [ ] Phase 2: ElevenLabs voice (TTS + STT)
- [ ] Phase 3: Session review and debrief
- [ ] Phase 4: Azure migration (NWOSU production)
