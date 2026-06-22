# Client avatar models (GLB)

Self-hosted TalkingHead-compatible `.glb` files. The app maps scenarios to these files via `src/lib/visual/avatar-catalog.ts`. Models are **bundled here (not hotlinked)** because this network blocks `readyplayer.me` at the DNS level, so remote avatar hosts are unreachable.

## Bundled models

| File | Source | Used for |
|------|--------|----------|
| `brunette.glb` | Ready Player Me (free, non-commercial) | Female + neutral clients |
| `avatarsdk.glb` | AvatarSDK | Male clients |

Both come from the TalkingHead repo's `avatars/` folder, so they are rig-compatible (Mixamo skeleton + ARKit/Oculus visemes). Female/neutral catalog entries point at `brunette.glb`; male entries point at `avatarsdk.glb`.

> Note: the earlier male model (`mpfb.glb`, MakeHuman) was dropped because its base mesh read as female.

If a model URL fails to load, the avatar falls back to `brunette.glb` (see `talking-head-bridge.ts`). **Text view always works** regardless.

## Adding cleaner / per-demographic models

The bundled male model carries a small MakeHuman logo on its shirt, and faces are generic (not age-matched). For polished, demographic-specific avatars, the simplest path is **Ready Player Me** — but that requires unblocking `readyplayer.me` on your router's DNS filter (ASUS AiProtection / parental controls). Then you can swap the catalog `modelUrl`s back to RPM URLs, or download per-demographic GLBs into this folder using the catalog filename keys.

## VRoid Studio workflow

1. Create the character in [VRoid Studio](https://vroid.com/en/studio) and export `.vrm`.
2. Convert to TalkingHead-compatible `.glb` using Blender and the [TalkingHead VRoid guide](https://github.com/met4citizen/TalkingHead/blob/main/blender/VRoid/VROID.md).
3. Save the GLB here using the catalog filename for that demographic.
4. Re-run `npm run db:seed` (or update `clientAvatarKey` on scenarios) if needed.

## Enable avatar view

Set in `.env`:

```env
VISUAL_PROVIDER=talkinghead
```

In practice sessions, use the **Text / Avatar** toggle. Text view is the default and matches the original chat-only experience.
