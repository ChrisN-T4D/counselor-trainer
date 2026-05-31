# Client avatar models (GLB)

Place TalkingHead-compatible `.glb` files here. The app maps scenarios to these files via `src/lib/visual/avatar-catalog.ts`.

## Expected filenames

| File | Used for |
|------|----------|
| `adult-female-01.glb` | Adult female clients |
| `adult-male-01.glb` | Adult male clients |
| `adolescent-female-01.glb` | Child / adolescent female |
| `adolescent-male-01.glb` | Child / adolescent male |
| `older-adult-female-01.glb` | Older adult female |
| `older-adult-male-01.glb` | Older adult male |
| `neutral-adult-01.glb` | Neutral fallback |

You do not need every file on day one — missing models show an error in Avatar view; **Text view always works**.

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
