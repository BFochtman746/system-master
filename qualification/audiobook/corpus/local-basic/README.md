# Audiobook Foundation 1.0 qualification corpus

This corpus is intentionally text-only in Git. The qualification harness stages it into a temporary project and generates a deterministic PCM WAV fixture at `audio/chapter-01.wav` solely to exercise the caller-supplied-audio path.

The C00 runtime builder does **not** generate, synthesize, record, download, transcode, play, stream, publish, or distribute audio. A real caller must supply the narration audio files referenced by `audiobook.json` before invoking `build`.
