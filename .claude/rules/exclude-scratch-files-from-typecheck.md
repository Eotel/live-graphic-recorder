# Exclude Scratch/Script Files from Type Checking

## Problem

Scratch files or experimental scripts in `scripts/` directory may have type errors that block CI but aren't critical to fix.

## Solution

Exclude non-production files from TypeScript compilation by updating `tsconfig.json`:

```json
{
  "exclude": ["node_modules", "dist", "scripts/**/*"]
}
```

Or create a separate `tsconfig.scripts.json` for scripts with relaxed settings.

## When to Apply

- Files in `scripts/` directory that are for local development/testing only
- Prototype code that isn't part of the build
- One-off utilities that don't need strict type checking

## Alternative

If the script is important, fix the actual type errors instead of excluding it.
