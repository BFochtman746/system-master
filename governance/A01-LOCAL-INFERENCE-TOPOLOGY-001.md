# A-01 local inference topology — verified 2026-09-18

**Status: VERIFIED BY MEASUREMENT.** Read off the A-01 box by a bounded self-hosted probe,
GitHub Actions run `35302276922`, job `105467213786`, runner `A-01` (registered id 26,
`[self-hosted, Windows, X64]`).

This record exists because the endpoint was **not** recoverable from the repository. The
doctrine was recorded — `governance/PLATFORM-DISPOSITION-DECISIONS-001.md` lines 76-78: A-01
runs Lemonade Server on the Nimo box with a verified OpenAI-compatible contract, Lemonade
primary and never Ollama because of the gfx1151 silent-fallback bug — but the endpoint, port
and model list were not. A repo-wide search for any `localhost:<port>` or `127.0.0.1:<port>`
returned zero matches, and no LLM credential exists in the tree (every workflow references
exactly `GITHUB_TOKEN` and `CONTROL_GATEWAY_WRITER_PRIVATE_KEY`). Three separate sessions
have now treated "find where the model config lives" as a precondition. It is written down
here so the fourth does not repeat the lookup.

## Verified facts

| Fact | Measured value |
|---|---|
| Base URL | `http://localhost:13305/api/v1` |
| OpenAI-compatible contract | **Confirmed** — `GET /models` returned a `data[]` list |
| Models loaded | 8 |
| Server process | `LemonadeServer` |
| Ollama | **Not live** — `:11434/api/tags` not reachable, no `ollama` process. Consistent with doctrine. |
| Listening ports on the box | 31 |

### Models reported by `/models`

- `Qwen3.6-35B-A3B-GGUF`
- `gpt-oss-120b-MXFP4`
- `gpt-oss-120b-mxfp-GGUF`
- `gpt-oss-20b-NPU`
- `Qwen3-Embedding-8B-GGUF` — embedding
- `bge-reranker-v2-m3-GGUF` — reranker
- `kokoro-v1` — speech
- one further id withheld by the probe's own redaction (see defect below)

Four are general-purpose chat/completion models; the rest are embedding, reranking and speech.
So "multiple LLMs configured" is accurate, and a `ModelDispatch` increment has a real choice
to make rather than a single option.

## THE PORT IS NOT 8000

This is the load-bearing finding. The probe enumerated listening ports with their owning
process and probed process-owned ports *before* documented defaults. Every default was
actively refused:

```
error: No connection could be made because the target machine actively refused it. (localhost:8000)
error: No connection could be made because the target machine actively refused it. (127.0.0.1:8000)
error: No connection could be made because the target machine actively refused it. (localhost:8020)
error: No connection could be made because the target machine actively refused it. (localhost:1234)
```

Lemonade answers on **13305**. Any `ModelDispatch` written against the documented default
would have failed at every call, and the failure would have looked like "the box is down"
rather than "the port was assumed". Discovery, not assumption, is why this record has a
correct value in it.

**Consequence for `ModelDispatch`:** the base URL must be read from configuration with the
measured value as its default, never hardcoded to a documented default, and a wrong-port
failure must surface as a distinct refusal rather than a generic transport error.

## Where this endpoint is reachable from

`localhost:13305` is loopback **on the A-01 box**. It is not reachable from a GitHub-hosted
runner, and not from an agent sandbox. Any component that calls it must execute on that
machine — which makes the runner label `[self-hosted, Windows, X64]` a hard requirement for
`ModelDispatch`, not a preference.

## Probe defect, recorded honestly

The probe's credential redaction is **over-broad**: it replaces any 32+ character opaque
token with `[redacted]`, and one legitimate model id matched that shape. The model list above
is therefore complete except for one entry. Failing toward redaction is the safe direction for
a rule guarding credentials, so the rule stands; the fix is to project `/models` responses
onto the known-safe `id` field without applying the opaque-run rule to it, since a model id is
topology and never a secret.

A second defect is unresolved: the probe's artifact upload failed with `No files were found
with the provided path` even though the report file existed when the preceding step read it
(that step's own guard requires the verdict block and passed). The evidence was recovered from
the job log instead, so the finding is not lost, but the cause is not yet proven and is
deliberately not guessed at here.

## Governance finding: self-hosted work must route through the gateway

The probe was submitted as a workflow declaring `runs-on: [self-hosted, Windows, X64]`
directly. The required check **A-01 Control Plane Enforcement** rejected it by exact code:

```
DIRECT_SELF_HOSTED_WORKFLOW_NOT_REGISTERED; use .github/workflows/a01-control-plane-gateway.yml
```

That refusal is correct and it is architecturally load-bearing. `qualification/a01/legacy-direct-workflows.json`
grandfathers exactly two workflows and states its own rule for the rest: *migrate through
GATEWAY instead of updating the legacy pin*. Adding a new probe to a legacy allowlist would be
quieting a gate, so it was not done, and the probe PR was not merged.

**This is where `ModelDispatch` has to live.** Self-hosted A-01 work routes
gateway → trusted metadata broker → canonical executor, and the enforcement scan additionally
requires the executor to carry `control_plane_sha` binding and canonical runner labels. The
governed path already exists; a model-calling executor belongs behind it rather than beside it.
The gate answered an architectural question that had been open for three passes.
