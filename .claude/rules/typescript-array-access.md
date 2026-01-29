# TypeScript Array Access in Tests

## Problem

TypeScript's strict mode reports "Object is possibly 'undefined'" (TS2532) when accessing array elements by index without null checks.

```ts
// Error: Object is possibly 'undefined'
expect(states[0].sessions.length).toBe(1);
```

## Solution

Use non-null assertion (`!`) when you are certain the element exists (common in tests where you control the data):

```ts
// Correct
expect(states[0]!.sessions.length).toBe(1);
```

## When to Use

- **Test files**: Non-null assertions are acceptable when the test setup guarantees the element exists
- **Production code**: Prefer optional chaining (`?.`) or explicit null checks

## Examples

```ts
// Test file - non-null assertion is OK
const lastState = states.at(-1)!;
expect(lastState.status).toBe("connected");

// Production code - prefer defensive checks
const lastState = states.at(-1);
if (lastState) {
  processState(lastState);
}
```

## Related

- TypeScript `noUncheckedIndexedAccess` compiler option
- Array methods like `.at()` also return `T | undefined`
