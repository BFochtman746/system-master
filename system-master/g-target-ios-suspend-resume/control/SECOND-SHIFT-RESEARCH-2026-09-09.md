# System Master Continuity — Second-Shift Research & Build Packet — 2026-09-09

## Scope and lineage reconciliation

Authoritative Continuity branch reviewed:

- `system-master/g-wp-011-015-continuity-slice` head `347b0e4931f6fbc53a9c7bfe906e634fd90ac9af`
- `system-master/continuity-target-ios-suspend-resume-qualification` pre-hardening head `b0301732666d7e7b89d299893712df86e89c5832`
- merge base `777836653aa967f4559e25a3cee26c9fb160398e`

The iOS target branch was cut from the exact subject that later passed the shared A-01 control-plane migration (`777836653aa967f4559e25a3cee26c9fb160398e`). The Continuity branch then added one doc/control closure commit (`347b0e4931f6fbc53a9c7bfe906e634fd90ac9af`) while the iOS branch added its target-evidence contract. The branches therefore diverged after the qualified subject; this is not evidence of conflicting implementation bytes, but future promotion/integration must explicitly reconcile the closure commit instead of assuming ancestry.

The control-plane closure records the ordinary integration gate PASS at 143 assertions / 29 new requirements and separately records Windows target reboot PASS. It leaves iOS suspend/resume and empirical human evidence pending. The iOS target branch correctly preserves that separation.

## Current standing

| Capability / boundary | Standing | Evidence / implication |
| --- | --- | --- |
| Replacement + Signals + Compatibility (G-WP-008..010) | COVERED | A-01 predecessor run `34281081879` concluded success on exact subject `ba5713958cd2930c7c54e3d5fdadc41dd7a7a9ca`; the later consolidated qualifier treats it as the qualified 96-assertion predecessor. No repeat run is justified without changed bytes. |
| Recovery Integrity + Visibility + Resource Admission (G-WP-011..013) | COVERED | Repository-owned branch implementation and portable evidence are present; consolidated closure records 30 assertions / 22 requirements PASS. This is published on the owning Continuity branch. Promotion to canonical `main` is not authorized merely by the consolidated receipt (`promotion_authorized=false`). |
| G-WP-011..015 ordinary integration / control-plane migration | COVERED | Shared A-01 run `34291119893` produced exact-SHA PASS for `777836653aa967f4559e25a3cee26c9fb160398e`, 143 assertions, and migration-equivalence PASS. Closure commit `347b0e...` disables the automatic push gate afterward. |
| Windows reboot target arm | COVERED | Reconciled closure records `TARGET_WINDOWS_REBOOT=PASS`; no overnight disruptive rerun is justified. |
| iOS client suspend/resume | TARGET_EVIDENCE_REQUIRED | Portable evidence contract exists and is now hardened, but no repository-owned System Master Swift/Xcode client/UI-test target exists. A-01 cannot satisfy this target. |
| iOS process termination / relaunch restoration | MISSING | This is a distinct lifecycle failure mode from suspend/resume. The current target contract intentionally does not claim it. Build a separate target-native scenario once the real app exists. |
| iOS background execution strategy | PARTIAL | Architecture must choose the Apple mechanism per work class; durable work identity and recovery remain the primary correctness boundary because iOS background execution can be interrupted. |
| Real-user crash/hang/launch diagnostics | PARTIAL | MetricKit can supply device-side diagnostic evidence after a real app exists; repository ingestion/association with durable work identities is not yet implemented. |

## Current Apple platform findings

### 1. Suspension is observable in UI tests and must not be conflated with generic background state

Apple's `XCUIApplication.State` includes `runningBackgroundSuspended`, distinct from `runningBackground` and `runningForeground`. `XCUIApplication.state` is asynchronously updated by the system. `activate()` brings an existing app to the foreground, but if the app is no longer running, `activate()` launches it.

Implication: a real suspend/resume qualification should require the OS-level UI-test state `runningBackgroundSuspended`, then `runningForeground` after activation. It must also prove the client launch instance did not change; otherwise a termination/relaunch was silently substituted for suspend/resume.

Primary sources:

- https://developer.apple.com/documentation/xcuiautomation/xcuiapplication/state-swift.enum/runningbackgroundsuspended
- https://developer.apple.com/documentation/xcuiautomation/xcuiapplication/state-swift.property
- https://developer.apple.com/documentation/xcuiautomation/xcuiapplication/activate()
- https://developer.apple.com/documentation/xcuiautomation/xcuidevice/button

### 2. UIKit background entry is not itself proof of suspension

UIKit/scene lifecycle APIs notify the app as it moves between foreground/background states. Apple separately documents that the system may eventually suspend a background app. Application callbacks are therefore useful telemetry but are not equivalent to an external observation that the process reached the suspended UI-test state.

Implication: the qualification contract now rejects synthetic callbacks and ordinary `runningBackground` as substitutes for actual suspended-state evidence.

Primary sources:

- https://developer.apple.com/documentation/uikit/about-the-background-execution-sequence
- https://developer.apple.com/documentation/uikit/preparing-your-ui-to-run-in-the-foreground
- https://developer.apple.com/documentation/uikit/uiscene

### 3. Long-running/background work requires strategy selection, not one generic mode

Apple provides several different mechanisms:

- `BGContinuedProcessingTask` for user-initiated long-running work that starts in the foreground and can continue after the app is backgrounded on supported systems.
- `BGProcessingTask` for deferred processing; the system can interrupt it, and an expiration handler is required for cleanup.
- Background `URLSession` configurations for HTTP transfers; transfers run in a separate process and can continue while the app is suspended or terminated.
- A short `beginBackgroundTask` assertion for finite cleanup/critical work; it is not a long-job scheduler and can expire.

Implication: System Master must keep durable job/checkpoint state independent of the iOS process. Background APIs are execution opportunities, not the source of truth for job identity or completion. The client should always recover through durable `work_unit_id` plus authoritative status/reconciliation.

Primary sources:

- https://developer.apple.com/documentation/backgroundtasks/performing-long-running-tasks-on-ios-and-ipados
- https://developer.apple.com/documentation/backgroundtasks/bgprocessingtask
- https://developer.apple.com/documentation/foundation/urlsessionconfiguration/background(withidentifier:)
- https://developer.apple.com/documentation/uikit/uiapplication/beginbackgroundtask(expirationhandler:)

### 4. Termination/relaunch requires durable domain recovery in addition to UI restoration

Apple documents that iOS may terminate an app after the user leaves it and provides scene/UI state restoration mechanisms to reconstruct interface context after a later launch. Apple also explicitly warns that UI state preservation is not a substitute for persistently saving application data structures.

Implication: System Master should separate two layers:

1. UI restoration (scene/navigation context, presentation state).
2. Durable domain recovery (work identity, checkpoint/progress basis, authoritative command outcome, idempotency state, artifacts).

A new target-native termination/relaunch scenario should prove both layers without using UI restoration as proof that a long-running operation itself survived correctly.

Primary sources:

- https://developer.apple.com/documentation/uikit/restoring-your-app-s-state
- https://developer.apple.com/documentation/uikit/preserving-your-app-s-ui-across-launches
- https://developer.apple.com/documentation/uikit/uiapplicationdelegate/application(_:willencoderestorablestatewith:)

### 5. Target observability should include real-device diagnostics

MetricKit provides on-device metrics and diagnostics, including crash, hang, and launch diagnostics. Those reports can strengthen post-failure analysis once the real iOS client exists.

Implication: future System Master iOS evidence should bind diagnostic events to app build/version and, where privacy allows, a non-sensitive correlation handle that can be joined to durable work/recovery evidence. MetricKit is diagnostic evidence, not a replacement for deterministic qualification assertions.

Primary source:

- https://developer.apple.com/documentation/metrickit

## Implemented hardening in this second shift

The target evidence contract was upgraded to v2 without claiming any target iOS PASS:

- require XCUITest or equivalent OS-level UI-test control;
- require `runningForeground -> runningBackgroundSuspended -> runningForeground` state evidence;
- require the same launch-instance identifier before/after suspend/resume;
- record Xcode and test-host OS versions;
- require a named recovery-status source;
- preserve command id plus idempotency key;
- require authoritative reconciliation result (`APPLIED` / `NOT_APPLIED`);
- forbid reissuing an already-applied command;
- require UTC timestamps;
- preserve simulator vs physical-device assurance-tier separation;
- add a hosted portable validator/schema selftest that explicitly cannot satisfy target iOS requirements.

## Candidate target-native test harness

When the real System Master iOS target becomes available, implement the following UI-test harness rather than inventing another portable simulation:

1. `testSuspendResumeReconnectSameProcess`
   - launch exact app build;
   - start/attach durable work unit and capture launch-instance id;
   - create an unknown command outcome;
   - press Home (or equivalent OS-level action);
   - wait until `XCUIApplication.state == .runningBackgroundSuspended`;
   - call `activate()`;
   - require `.runningForeground` and unchanged launch-instance id;
   - reconnect by durable work id;
   - query recovery status;
   - reconcile command outcome before retry;
   - assert no duplicate effect;
   - export v2 evidence.

2. `testTerminationRelaunchDurableRecovery` — separate next-scope test
   - establish durable work and UI restoration context;
   - terminate or otherwise prove `notRunning`;
   - relaunch and require a changed launch-instance id;
   - restore user-facing context without treating UI state as domain authority;
   - reconnect by durable work id and reconcile status/idempotency;
   - prove artifact/progress state is authoritative and no duplicate command effect occurs.

3. `testBackgroundExecutionExpirationRecovery`
   - for each selected background strategy, exercise expiration/interruption;
   - persist/checkpoint before expiration where required;
   - prove foreground recovery is based on durable status rather than in-memory assumptions.

4. `testBackgroundTransferReassociation`
   - use a background URLSession transfer owned by the real app;
   - background/suspend the app and, in the separate termination suite, terminate/relaunch;
   - prove transfer/result reassociation does not duplicate artifacts or lose provenance.

## Prioritized build packets

### P0 — Native client surface binding

Blocked until the real System Master iOS target is present in repository authority. Bind the continuity adapter, durable work identity/status endpoint, command reconciliation/idempotency path, and evidence exporter to that target. Do not create a dummy app solely to make the gate green.

Acceptance: target repo contains real Swift/Xcode client + UI-test target; hosted/portable checks can validate wiring, but final evidence runs on an Apple iOS runtime.

### P1 — Termination/relaunch recovery contract

Create a separate evidence schema/protocol only after P0 supplies a real target. Keep it distinct from suspend/resume. Require changed launch instance, durable work recovery, UI restoration separation, authoritative status, idempotency, and artifact/progress reconciliation.

### P1 — Background execution strategy matrix

Map System Master work classes to Apple strategies: interactive user-initiated continuation, deferred processing, background transfer, short cleanup. Define checkpoint/expiration behavior and fallback to server/headless execution. Do not assume any iOS API provides unlimited execution.

### P2 — iOS diagnostic provenance

Add MetricKit ingestion/correlation design for crashes, hangs and launch diagnostics, with privacy-minimized identifiers and exact app/build/runtime provenance.

### P2 — Native fault-injection matrix

Cover network loss, process suspension, OS termination, expired background assertion/task, duplicate callback/delivery, unknown command outcome, stale cache, partial artifact download/upload, and reactivation with delayed telemetry. Each scenario needs an explicit authoritative reconciliation source and no-duplicate-effect assertion.

## A-01 admission decision

No new Continuity A-01 ticket is justified by this work. Replacement/Signals/Compatibility and the G-WP-011..015 ordinary integration are already closed; Windows reboot target evidence is already PASS; the remaining critical target is iOS-native and A-01 is Windows. Re-running portable regressions unchanged would add no material completion delta.

A future A-01 ticket becomes valid only after changed Windows/portable implementation creates a new registered exact-SHA boundary. Native iOS evidence must remain on an Apple runtime.

## Exact next objective

`CONTINUITY-IOS-NATIVE-SURFACE-BIND-001` — when the real System Master Swift/Xcode client enters repository authority, bind the durable continuity/recovery adapter and v2 evidence exporter to it, implement the XCUITest suspend/resume harness above, then obtain real target evidence for G-RQ-049, G-RQ-050, and the iOS arm of G-RQ-072 without conflating simulator, physical-device, termination/relaunch, or A-01 evidence classes.
