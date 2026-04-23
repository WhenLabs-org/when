# Terminal Demos

This directory contains the terminal recordings for `@whenlabs/when`.

## Files

- `hero.tape` — VHS tape used in the top-level README (`when doctor` against `sample/`)
- `install.tape` — VHS tape for `npx @whenlabs/when install`
- `init.tape` — VHS tape for `when init`
- `doctor.tape` — VHS tape for `when doctor`
- `sample/` — fixture project the `hero.tape` runs against (package.json, .env/.env.schema, src/)
- `*.gif` — output GIFs written alongside each tape (generated after recording)

## Recording with VHS

[VHS](https://github.com/charmbracelet/vhs) renders tape files into GIF/MP4/WebM from real terminal sessions.

**Install VHS:**

```bash
# macOS
brew install vhs

# Linux (apt)
sudo apt install vhs

# Or via Go
go install github.com/charmbracelet/vhs@latest
```

**Record:**

```bash
# From the repo root, record each tape individually
vhs demos/hero.tape      # README hero — requires `pnpm build` first
vhs demos/install.tape
vhs demos/init.tape
vhs demos/doctor.tape
```

Each tape writes its own GIF next to itself (`demos/hero.gif`, `demos/install.gif`, `demos/init.gif`, `demos/doctor.gif`).

`hero.tape` shells out to `packages/when/dist/index.js` directly (via a hidden
`when()` function) so it doesn't require a global install — just make sure the
toolkit is built first (`pnpm build`). It also `cd`s into `demos/sample/`,
which is a minimal fixture project with a package-lock, `.env`/`.env.schema`,
and a tiny `src/` so every check has something real to report.

**Requirements:** VHS requires `ffmpeg` and `ttyd`. Install them first:

```bash
# macOS
brew install ffmpeg ttyd

# Linux
sudo apt install ffmpeg
# ttyd: https://github.com/tsl0922/ttyd/releases
```

The tape assumes `when` is on your PATH (installed via `npm install -g @whenlabs/when` or `npx @whenlabs/when install`).

## Recording with asciinema

If you prefer [asciinema](https://asciinema.org) for a lighter-weight recording:

```bash
# Install
pip install asciinema

# Record (one cast per flow)
asciinema rec demos/install.cast
asciinema rec demos/init.cast
asciinema rec demos/doctor.cast

# While recording each cast, run the matching command:
#   npx @whenlabs/when install
#   when init
#   when doctor

# Stop recording
# Ctrl-D or exit

# Convert to GIF with agg (https://github.com/asciinema/agg)
agg demos/install.cast demos/install.gif
agg demos/init.cast demos/init.gif
agg demos/doctor.cast demos/doctor.gif
```

## Customizing the tapes

The tapes use the **Catppuccin Mocha** theme. `hero.tape` renders at 1440x340 with Menlo; the other three render at 800x400 with JetBrains Mono (install JetBrains Mono first, or edit `Set FontFamily` to a font you have). VHS supports any theme from the [Chroma](https://github.com/alecthomas/chroma) library as well as named presets like `"Dracula"`, `"Nord"`, `"Tokyo Night"`, and `"One Dark"`.

Sleep durations are tuned to match realistic command latency (especially for `when init`, which runs parallel scans). If your machine is faster or slower, adjust the `Sleep` values after each `Enter`.
