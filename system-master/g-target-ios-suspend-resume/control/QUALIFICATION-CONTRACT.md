# CONTINUITY TARGET iOS CLIENT SUSPEND/RESUME QUALIFICATION

## Evidence boundary

This objective may emit `TARGET_IOS_CLIENT_SUSPEND_RESUME` only from an actual Apple iOS runtime executing the System Master client. A-01, JVM tests, mocks, synthetic lifecycle callbacks, and a dummy non-System-Master iOS app are non-target evidence and cannot satisfy G-RQ-049, G-RQ-050, or the iOS arm of G-RQ-072.

The runtime kind must be recorded as `IOS_SIMULATOR` or `IOS_PHYSICAL_DEVICE`. The current requirement does not silently treat simulator evidence as physical-device evidence; any later physical-device assurance requirement remains a separate policy decision.

## Target scenario

1. Launch the exact System Master iOS build under qualification and create or attach to a durable `work_unit_id`.
2. Establish an authoritative recovery/status condition and a command identity that can be reconciled after client lifecycle interruption.
3. Exercise an unknown command outcome without resolving it by blind retry.
4. Use XCUITest or equivalent OS-level lifecycle control to background/suspend the real client and later reactivate it. Record lifecycle observations from the target runtime.
5. After reactivation, reconnect by the same durable `work_unit_id`; an ephemeral pre-suspend session must not be required.
6. Query authoritative recovery status before issuing any replacement/retry command. Progress basis and any telemetry gap must remain explicit.
7. Reconcile the unknown command outcome before re-command. Prove no duplicate effect was produced.
8. Export one evidence package conforming to `TARGET-IOS-EVIDENCE.schema.json` and bind it to the exact subject commit, client build, iOS runtime, command id, work unit id, and timestamps.

## Requirement adjudication

- **G-RQ-049 PASS** requires real target lifecycle interruption/reactivation plus successful reconnection by durable work identity without dependence on the ephemeral client session.
- **G-RQ-050 PASS** requires status/query reconciliation after reactivation, reconcile-before-recommand for an unknown command outcome, and no duplicate effect.
- **G-RQ-072 iOS arm PASS** requires the same target evidence package to be validly classified `TARGET_IOS_CLIENT_SUSPEND_RESUME`. This does not erase the separately required Windows reboot arm.

The Windows arm of G-RQ-072 is already supported by `CONTINUITY-WINREBOOT-20260908-002` on branch `system-master/continuity-target-windows-reboot-evidence-002`. Overall G-RQ-072 remains incomplete until this iOS target objective passes.

## Current readiness

No repository-owned Swift/Xcode/System Master iOS client or UI-test surface is present in the inspected repository snapshot. Therefore target execution is `NOT_STARTED`; no workflow is scheduled and no A-01 run is appropriate.
