# CONTINUITY TARGET iOS CLIENT SUSPEND/RESUME QUALIFICATION

## Evidence boundary

This objective may emit `TARGET_IOS_CLIENT_SUSPEND_RESUME` only from an actual Apple iOS runtime executing the System Master client. A-01, JVM tests, mocks, synthetic lifecycle callbacks, and a dummy non-System-Master iOS app are non-target evidence and cannot satisfy G-RQ-049, G-RQ-050, or the iOS arm of G-RQ-072.

The runtime kind must be recorded as `IOS_SIMULATOR` or `IOS_PHYSICAL_DEVICE`. Simulator evidence and physical-device evidence remain distinct assurance tiers. A simulator result must never be relabeled as physical-device evidence.

The evidence contract is intentionally narrower than generic background execution. Apple exposes an `XCUIApplication.State.runningBackgroundSuspended` state for UI testing. This qualification therefore requires an OS-level UI-test observation of that exact suspended state, not merely an application callback indicating that UIKit entered the background. UIKit background callbacks, synthetic scene events, `UIApplication.State.background`, and absence of log output are not sufficient substitutes for the suspended-state observation.

## Target scenario

1. Launch the exact System Master iOS build under qualification and create or attach to a durable `work_unit_id`.
2. Record the exact build, iOS runtime, Xcode version, test-host OS version, device/simulator identifier, and a client launch-instance identifier.
3. Establish an authoritative recovery/status condition and a command identity plus idempotency key that can be reconciled after client lifecycle interruption.
4. Exercise an unknown command outcome without resolving it by blind retry.
5. Use XCUITest or equivalent OS-level UI-test control to move the real client from `runningForeground` to `runningBackgroundSuspended`. Record the OS-level application-state observation and timestamped lifecycle evidence.
6. Reactivate the existing app instance and prove the state returns to `runningForeground`. For this suspend/resume qualification, the launch-instance identifier before and after reactivation must be identical; a terminated-and-relaunched process is a separate continuity scenario, not a substitute.
7. After reactivation, reconnect by the same durable `work_unit_id`; an ephemeral pre-suspend session must not be required.
8. Query authoritative recovery status before issuing any replacement/retry command. Record the recovery-status source, progress basis, and any telemetry gap explicitly.
9. Reconcile the unknown command outcome before re-command. Record the authoritative result as `APPLIED` or `NOT_APPLIED`, preserve the original command id and idempotency key, and prove no duplicate effect occurred. If the authoritative outcome is `APPLIED`, no replacement command may be issued.
10. Export one evidence package conforming to `TARGET-IOS-EVIDENCE.schema.json` and bind it to the exact subject commit, client build, iOS runtime, command id, idempotency key, work unit id, launch instance, and timestamps.

## Separate termination/relaunch scenario

Suspension and process termination are different failure modes. Apple can terminate an app after it has moved to the background, and `XCUIApplication.activate()` can launch an app if it is no longer running. Therefore a future target-native termination/relaunch recovery qualification must separately prove durable work restoration across a changed launch instance. It must not be silently counted as this suspend/resume qualification, and this suspend/resume qualification must not be treated as proof of termination/relaunch recovery.

The next Continuity build packet should cover that separate scenario once the real System Master iOS target exists, including durable state restoration, status reconciliation, idempotent command handling, and user-visible progress reconstruction after process recreation.

## Requirement adjudication

- **G-RQ-049 PASS** requires real target lifecycle interruption/reactivation, an observed `runningBackgroundSuspended` state, return to `runningForeground` in the same launch instance, and successful reconnection by durable work identity without dependence on the ephemeral client session.
- **G-RQ-050 PASS** requires authoritative status/query reconciliation after reactivation, reconcile-before-recommand for an unknown command outcome, command/idempotency identity preservation, and no duplicate effect. An already-applied command must not be reissued.
- **G-RQ-072 iOS arm PASS** requires the same target evidence package to be validly classified `TARGET_IOS_CLIENT_SUSPEND_RESUME`. This does not erase the separately required Windows reboot arm.

The Windows arm of G-RQ-072 is already recorded as PASS in the reconciled Continuity closure. Overall G-RQ-072 remains incomplete until this iOS target objective passes.

## Current readiness

The inspected repository snapshot still has no repository-owned Swift/Xcode System Master iOS client or UI-test target. Therefore target execution remains `NOT_STARTED`; no A-01 run is appropriate. Portable JavaScript self-tests validate only the evidence contract and fail-closed classification logic.

Before any target run, the repository must contain the real iOS client surface, a continuity adapter that reconnects by durable work identity, an authoritative recovery/status path callable after reactivation, observable reconcile-before-recommand behavior, an XCUITest or equivalent OS-level lifecycle harness, and a target evidence exporter conforming to the v2 schema.
