# Bug: "Grant Camera & Mic Access" button does nothing

## Symptom

Clicking the "Grant Camera & Mic Access" button in development mode (`bun --hot`)
does nothing — no browser permission dialog appears, no error message is shown, and
the UI remains unchanged.

## Root Cause

React 18 `StrictMode` (enabled in dev mode via `frontend.tsx`) triggers a
mount → unmount → remount cycle for effects. The cleanup effect in controller hooks
called `dispose()` on the controller, which sets an internal `isDisposed = true` flag.
However, the cleanup did **not** clear `controllerRef.current`, so the remounted
effects continued to reference the disposed controller.

All state-mutating operations in the controller are guarded by `if (!isDisposed)`,
causing them to silently no-op. As a result, `getUserMedia` was never called and
`hasPermission` was never set to `true`.

### Affected hooks

| Hook                       | File                                    |
| -------------------------- | --------------------------------------- |
| `useMediaStreamController` | `src/hooks/useMediaStreamController.ts` |
| `useRecordingController`   | `src/hooks/useRecordingController.ts`   |
| `useAudioUpload`           | `src/hooks/useAudioUpload.ts`           |
| `useLocalRecording`        | `src/hooks/useLocalRecording.ts`        |

`useMeetingController` was **not** affected — it already cleared `controllerRef.current = null`
in its cleanup.

## Reproduction Steps

1. Start the dev server with `bun --hot src/index.ts`
2. Open the app in a browser
3. Select or create a meeting
4. Click "Grant Camera & Mic Access"
5. **Expected**: browser permission dialog appears
6. **Actual**: nothing happens

## Fix

Added `controllerRef.current = null` after `dispose()` in each hook's cleanup effect.
This ensures that if React re-runs the effect (as in StrictMode), the render-time
lazy initialization block (`if (!controllerRef.current)`) creates a fresh controller.

```ts
// Before (broken)
useEffect(() => {
  return () => {
    controllerRef.current?.dispose();
  };
}, []);

// After (fixed)
useEffect(() => {
  return () => {
    controllerRef.current?.dispose();
    controllerRef.current = null;
  };
}, []);
```
