Output demos/hero.gif

Set Shell "bash"
Set Theme "Catppuccin Mocha"
Set Width 1440
Set Height 340
Set FontFamily "Menlo"
Set FontSize 14
Set Padding 20
Set TypingSpeed 55ms

# Point `when` at the locally built CLI and cd into the fixture project.
# This lets the tape render from a fresh clone without a global install,
# and keeps the demo deterministic. Hidden from the recording.
Hide
Type `WHEN_BIN="$(pwd)/packages/when/dist/index.js"`
Enter
Type `when() { node "$WHEN_BIN" "$@"; }`
Enter
Type `cd demos/sample`
Enter
Type "clear"
Enter
Show

Sleep 600ms
Type "when doctor"
Sleep 400ms
Enter

# Six tools run in parallel; unified report renders at the end.
Sleep 6s
