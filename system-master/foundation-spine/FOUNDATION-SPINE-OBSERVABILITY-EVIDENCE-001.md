# FOUNDATION-SPINE-OBSERVABILITY-EVIDENCE-001

Status: CANONICAL TELEMETRY/EVIDENCE SEPARATION

## Observability

FS-19 standardizes operational traces, metrics, logs, profiles, health and alerts. All material spans/events should carry the applicable WorkId, JobId, AttemptId, service/component identity and causal correlation, while avoiding secrets and unnecessarily sensitive data.

Telemetry naming should follow OpenTelemetry semantic conventions where a suitable convention exists; project-specific attributes must use a stable System Master namespace and registry.

## Evidence

FS-18 stores durable evidence objects whose subjects, source identities, environment, method, result, freshness, scope and integrity can be evaluated later. Evidence is not equivalent to a log line, dashboard status or process exit code.

## Evidence classes

At minimum standing must distinguish:
- DESIGN/RESEARCH evidence;
- STATIC/STRUCTURAL evidence;
- PORTABLE executable evidence;
- HOSTED/CI evidence;
- A-01 target qualification evidence;
- NATIVE platform/provider evidence;
- HUMAN/author/operator evidence;
- EXTERNAL/private authority evidence;
- PRODUCTION evidence.

Evidence from one class cannot silently promote another.

## Subject exactness

Every qualification receipt binds the exact subject: code/artifact digest or commit, contract/schema versions, relevant configuration, dependency/model/tool/provider versions, test suite/version, environment fingerprint and applicable ownership/policy revision. Material subject change invalidates or narrows prior standing according to explicit rules.

## Claim law

A claim is valid only to the scope supported by current evidence. 'Unit tests passed' cannot become 'system is production ready.' 'Portable pass' cannot become 'A-01 pass.' 'A-01 not run' cannot become 'A-01 failed.'

## Trusted history

Architecture/change/release evidence must preserve immutable historical records plus one current pointer. Telemetry can be retained/compacted under policy; evidence required to support a standing cannot disappear while that standing remains relied upon.

## Independent trust

For high-consequence release/change decisions, evidence design should support independent integrity verification through digest chaining, signed checkpoints/attestation or independent custody/witness mechanisms as appropriate.