# @whenlabs/when — Claude Code Instructions

## Commands

- **Build:** `npm run build` (uses tsup)
- **Test:** `npm test` (uses vitest)
- **Dev:** `npm run dev` (tsup --watch)

## Architecture

This package is a thin CLI wrapper. Each `when <tool>` command delegates to the corresponding individual tool package (`@whenlabs/stale`, `@whenlabs/envalid`, etc.) via `child_process.spawn`. There is minimal logic in this repo — keep it that way.

## ESM

This project uses ESM. All local imports must include `.js` file extensions, even when importing `.ts` source files:

```ts
// correct
import { foo } from './foo.js'

// wrong
import { foo } from './foo'
```

## CLI Parsing

CLI argument parsing uses [commander](https://github.com/tj/commander.js). Each subcommand is registered as a `commander` subcommand that spawns the appropriate tool package.
