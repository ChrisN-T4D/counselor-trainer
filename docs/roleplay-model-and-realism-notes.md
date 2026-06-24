# Roleplay Client — Model & Realism Notes

*Working notes / backlog for the AI client's brain and on-screen realism. Not yet
implemented — captured for later work. Cost/sizing context lives in
[`services-and-costs.md`](./services-and-costs.md) (§6).*

---

## 1. Client model selection (accuracy-first, 70B range)

**Direction (tentative):** run a **70B-class uncensored *instruct* model**, quantized to
**Q5_K_M / Q6** (don't go below Q5 — accuracy is the point), on an **A100 80 GB**
(best accuracy-per-dollar at ~$2.72/hr) for 50-minute sessions, with idle-timeout
warming. H100 / RTX 6000 Pro 96 GB if we want Q8 + faster replies. See §6 of the cost doc.

**Why 70B:** better DSM/clinical knowledge, emotional coherence, scenario adherence, and
fewer character breaks than the current 9B. We want a believable *client*, not a creative
writer — so prefer **uncensored/abliterated instruct** models over heavy ERP fine-tunes.

**Candidate families to verify (check current Ollama / HF availability, refusal behavior,
and whether they reliably emit our emotion/cue tags):**

| Candidate | Base | Why consider | Watch for |
|-----------|------|--------------|-----------|
| **Llama 3.3 70B** (abliterated / uncensored) | Llama 3.3 | Top-tier instruction-following + knowledge | Confirm refusals actually removed for clinical-sensitive topics |
| **Qwen2.5-72B** (uncensored fine-tune) | Qwen2.5 | Consistent with current Qwen stack; strong reasoning | Reasoning model — see §2 (thinking control) |
| **Nous Hermes 3 70B** | Llama 3.1 70B | Permissive, good at holding a system persona | Verify emotional nuance |
| **Dolphin 70B** (Cognitive Computations) | Llama/Qwen | Explicitly uncensored, steerable | Can be *too* compliant/flat — test affect |
| RP-tuned (Euryale / Magnum 72B) | L3.3 / Qwen | Strong character immersion | May skew dramatic/unprofessional — test tone |

**Open questions / next steps:**
- [ ] Pull a current shortlist with live availability + VRAM fit + refusal test on our
      sensitive scenarios (self-harm, trauma, substance use).
- [ ] Decide quant (Q5_K_M vs Q6 vs Q8) based on A100 80 GB context headroom.
- [ ] Verify token streaming → TTS sentence-chunking is wired so ~9–13s full-reply
      latency is masked (client starts speaking at ~1–2s).
- [ ] Default reasoning **off** for quick replies (see §2).

---

## 2. Selective / adaptive "thinking" (reason only when a human would)

**Goal:** the client should answer **quick/factual** prompts instantly, but **pause to
think** on **deeper, emotionally-loaded, or reflective** prompts — like a real person.
This also controls cost/latency (thinking tokens are the biggest GPU-time lever).

**Key reframe:** when thinking *is* triggered, the extra latency is **a feature, not a
bug** — present it as the character genuinely considering a hard question (a beat of
silence, gaze-down, "hmm…", thoughtful face). Ties directly into §3 non-verbal cues.

**Signals for "deep" (think) vs "quick" (no-think):**
- **Deep / think:** emotionally charged content, insight/reflection questions
  ("how did that make you feel?"), confronting trauma, open-ended exploration, silence
  prompts, value/meaning questions, anything requiring the client to weigh feelings.
- **Quick / no-think:** factual recall (age, job, who's at home), yes/no, greetings,
  logistics, small talk.

**Approaches to explore:**
1. **Lightweight router/classifier** on the trainee's last utterance → returns a
   difficulty/affect score; set `think` + a **reasoning-token budget** per turn
   accordingly. Could be a tiny model, embedding+rules, or a cheap first LLM pass.
2. **Budgeted reasoning:** scale max thinking tokens by detected difficulty (0 for quick,
   up to N for deep) instead of binary on/off.
3. **Two-tier escalation:** small/fast model for quick turns, escalate to 70B + thinking
   for hard turns (more infra; revisit if single-model control is insufficient).
4. **Prompt-driven self-gating:** instruct the model to deliberate briefly only when
   warranted — simplest, but least reliable; needs eval.

**Open questions / next steps:**
- [ ] Pick the gating mechanism (lean toward router + reasoning budget).
- [ ] Define the "deep vs quick" label set and build a small eval set from real scenario
      turns.
- [ ] Set per-mode latency targets (quick < ~1.5s to first audio; deep can be longer if
      masked as a natural pause).
- [ ] Confirm `think:false` path in the app's request to Ollama (per earlier Qwen
      investigation) and a `think:true` + token-cap path for deep turns.

---

## 3. Non-verbal cues & emotional reactivity (uncomfortable, crying, etc.)

**Goal:** the client visibly/audibly **reacts to what the trainee says** — gets
uncomfortable, tears up, withdraws, softens, etc. — not just neutral talking-head speech.
This is pedagogically core: trainees must learn to *read and respond to* non-verbal
distress.

**Proposed pipeline:** model returns **reply text + structured cue data**, which drives
three layers:

1. **Voice (ElevenLabs v3 audio tags):** map cues → `[sighs]`, `[crying]`, `[shaky
   voice]`, `[whispers]`, `[nervous laugh]`. Natural fit — v3 was chosen for emotives.
2. **Avatar face/body (TalkingHead / 3D):** expression morphs (sad, fear, disgust),
   tears, gaze aversion, body language (slumping, fidgeting) via blendshapes / mood
   params.
3. **Pacing:** pauses, slowed/broken speech — reuse the "thinking pause" from §2.

**Design pieces to work out:**
- **Cue taxonomy:** a small, well-defined enum of emotions + non-verbal behaviors that
  maps cleanly to **both** v3 audio tags **and** avatar blendshapes/animations. Keep it
  tight so all three layers can consume it.
- **Output schema:** decide format — inline tags (`[uncomfortable]`) vs. a structured
  side-channel (`{emotion, intensity, nonverbal:[...]}`). Structured is easier to route
  reliably to voice + avatar.
- **Persistent emotional state:** maintain an evolving client state across the session
  (e.g. rapport, distress/arousal level) rather than resetting per turn, so reactions are
  consistent and build over time. System prompt instructs the model to express affect via
  the schema and to let it shift based on the trainee's approach (empathic → opens up;
  blunt / pushes a sore spot → withdraws, defends, or tears up).
- **Reactivity loop:** cues are a *response* to the trainee's last turn + running state,
  not random flavor.

**Open questions / next steps:**
- [ ] Define the cue taxonomy + the voice-tag and avatar-blendshape mappings.
- [ ] Choose the model output schema (structured side-channel preferred) and a robust
      parser.
- [ ] Add a persistent client-emotion-state object to the session and feed it back into
      the prompt each turn.
- [ ] (Later) Score the trainee on whether they *noticed and responded to* non-verbal
      cues — a training metric.

---

## 4. Lip-sync + animation implementation notes (shipped, no-GPU)

The first slice of §3 is now implemented client-side ($0 GPU) behind a swappable
engine. Reference for future work / the Audio2Face upgrade.

**Engine abstraction.** `src/lib/visual/lipsync/` holds a `LipSyncEngine` contract
(`types.ts`) that turns audio+text into a normalized `VisemeTimeline`. Selected via
`NEXT_PUBLIC_LIPSYNC_ENGINE` (`rule` default):
- `rule` — TalkingHead word→viseme rules (the original approximate behavior; also the
  guaranteed fallback if another engine throws).
- `rhubarb` — accurate audio-driven lip-sync via the `lip-sync-engine` WASM port
  (Rhubarb / PocketSphinx) running in a Web Worker pool. Assets are self-hosted under
  `public/lipsync/` (copied from `node_modules` by `scripts/copy-lipsync-assets.mjs` on
  postinstall; the 36 MB data file is gitignored, not committed). Dialog text is passed
  as a recognition hint.
- `audio2face` — Phase 4 stub (see §5 below); falls back to `rule` until wired.

**Rhubarb shape → Oculus viseme map** (`rhubarb-engine.ts`). The plan's draft map was
corrected against the library's *actual* Preston-Blair shape definitions (confirmed in
the package's API docs) so the result is phonetically accurate:

| Rhubarb | Phonemes | Oculus viseme |
|---------|----------|---------------|
| X | silence/rest | *(omitted — mouth rests closed)* |
| A | AH/AA/AO/AW | `viseme_aa` |
| B | P/B/M | `viseme_PP` |
| C | SH/CH/JH/ZH | `viseme_CH` |
| D | TH/DH/T/D/N/L | `viseme_DD` |
| E | EH/AE/UH/ER | `viseme_E` |
| F | F/V | `viseme_FF` |
| G | K/G/NG | `viseme_kk` |
| H | IY/IH/EY/AY | `viseme_I` |

**Mouth smoothing** (`viseme-player.ts`): raised-cosine **coarticulation** ramps
(`COARTICULATION_MS`) crossfade adjacent visemes instead of snapping; **jaw-from-amplitude**
drives `jawOpen` from an `AnalyserNode` RMS tap (only if the morph exists); and a
**silence-close** asserts `viseme_sil` when mouth activity + loudness are both low.

**Expressive face** (`expression-controller.ts`): maps `AvatarMood`
(`neutral|happy|sad|fear|angry|love|disgust|sleep`) → moderate ARKit blendshape weights,
eased in/out (`EASE_TAU`) and reset to neutral between utterances. It owns **brows / eyes
(squint·wide) / mouth-corners / nose** only; the **mouth-open** shapes (`viseme_*`,
`jawOpen`) stay owned by the viseme player so they never fight. Every drive is
**defensive** — only morphs present on the avatar are touched.

### Avatar morph inventory (probe)

`VisemePlayer` logs each avatar's morph dictionary once on mount (dev-only,
`[avatar morphs] probe`). Expected, from the catalog:
- `avatarsdk.glb` (male) — full **ARKit + Oculus** visemes → expression map applies fully.
- `brunette.glb` (RPM female) — **Oculus** visemes + the standard RPM ARKit subset;
  some expression morphs (e.g. `mouthShrug*`, `cheekSquint*`) may be absent and are
  skipped automatically.

> TODO: paste the real probe output for both GLBs here once observed in the running app,
> and trim/extend `MOOD_EXPRESSIONS` to the morphs that actually exist.

---

## 5. Audio2Face-3D seam (Phase 4 — scaffold, needs a GPU)

`src/lib/visual/lipsync/audio2face-engine.ts` documents a future `Audio2FaceEngine`
(`implements LipSyncEngine`) that POSTs 16 kHz PCM to `src/app/api/lipsync/route.ts`,
which streams to the NVIDIA **Audio2Face-3D NIM** over gRPC (`ProcessAudioStream`,
16 kHz/16-bit/mono in → ARKit blendshape frames at ~30 fps out) and returns a normalized
`VisemeTimeline` (ARKit→Oculus map, or drive ARKit morphs directly on ARKit-capable
avatars). Gated by `LIPSYNC_ENGINE=audio2face` + `A2F_ENDPOINT`. Implement when the 3060
is freed (brain on RunPod) or via NVIDIA's hosted API.
