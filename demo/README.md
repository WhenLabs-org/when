# Terminal Demo

This directory contains the demo recording for `@whenlabs/when`.

## Files

- `demo.tape` — VHS tape file covering install, init, doctor, and status
- `demo.gif` — output GIF (generated after recording)

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
# From the repo root
vhs demo/demo.tape
```

Output is written to `demo/demo.gif`.

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

# Record
asciinema rec demo/demo.cast

# Then manually run:
#   npx @whenlabs/when install
#   when init
#   when doctor

# Stop recording
# Ctrl-D or exit

# Convert to GIF with agg (https://github.com/asciinema/agg)
agg demo/demo.cast demo/demo.gif
```

## Customizing the tape

The tape uses the **Catppuccin Mocha** theme at 900x500. To change the theme, edit the `Set Theme` line in `demo.tape`. VHS supports any theme from the [Chroma](https://github.com/alecthomas/chroma) library as well as named presets like `"Dracula"`, `"Nord"`, `"Tokyo Night"`, and `"One Dark"`.

Sleep durations are tuned to match realistic command latency for `when init` (which runs parallel scans). If your machine is faster or slower, adjust the `Sleep` values after `Enter`.
