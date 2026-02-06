# Controller Ref Cleanup in Hook useEffect

## Problem

When a React hook lazily initializes a controller in the render body via `if (!controllerRef.current)`, the cleanup effect MUST clear the ref after calling `dispose()`. Otherwise, React 18 StrictMode's effect remount cycle will reuse the disposed controller, and all actions will silently no-op.

## Rule

Always pair `dispose()` with `controllerRef.current = null` in effect cleanup:

```ts
// Correct
useEffect(() => {
  return () => {
    controllerRef.current?.dispose();
    controllerRef.current = null;
  };
}, []);
```

```ts
// WRONG — leaves a disposed controller in the ref
useEffect(() => {
  return () => {
    controllerRef.current?.dispose();
  };
}, []);
```

## When to Apply

- Any hook that uses the `useRef` + lazy-init pattern (`if (!controllerRef.current) { ... }`) for creating controllers or adapters
- The `useMeetingController` hook already follows this pattern correctly

## Why

React 18 StrictMode (dev mode only) runs effects → cleanup → effects again for the same mount. If the ref isn't cleared, the render-time `if (!ref.current)` guard skips re-creation on remount, leaving a dead controller that silently ignores all calls.
