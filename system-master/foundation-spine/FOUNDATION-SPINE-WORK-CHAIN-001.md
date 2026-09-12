# FOUNDATION-SPINE-WORK-CHAIN-001

Status: CANONICAL CAUSAL IDENTITY MODEL

## Purpose

Every meaningful outcome must be explainable backward to the exact user-authorized intent and forward through every material decision that produced it.

## Canonical chain

IntentCaptureId
-> GoalContractId + GoalRevision
-> WorkId / ProjectId
-> PlanId + PlanRevision
-> StepId
-> AdmissionDecisionId
-> PreliminaryBudgetId
-> RouteDecisionId + RouteDigest
-> ResourceReservationId / ResourceGrantId
-> AssignmentId + ExecutorId
-> JobId
-> AttemptId + FenceEpoch
-> ContextAssemblyId
-> InvocationId(s) [ModelInvocationId / ToolInvocationId / SpecialistInvocationId]
-> EffectRequestId / EffectReceiptId when applicable
-> StateMutationId and/or ArtifactId + ArtifactDigest
-> EvidenceSetId
-> CompletionDecisionId
-> RecoveryEpisodeId when applicable

## Binding laws

- Every descendant carries WorkId and the relevant GoalRevision.
- PlanRevision may change without changing GoalRevision; a changed goal requires an explicit new GoalRevision.
- Each Plan Step binds required capability, contract version, constraints and completion predicate.
- AdmissionDecision records the resource/cost envelope before routing.
- RouteDecision binds the exact capability/provider/profile and descriptor digest. Route substitution creates a new route decision.
- Final ResourceGrant binds the route and placement-relevant resource needs; no executor may consume an unbound or expired grant.
- Assignment binds RouteDecision + ResourceGrant + ExecutorId.
- Job/Attempt binds Assignment and carries a monotonic fence epoch or equivalent stale-writer protection.
- ContextAssembly binds the exact source identities/versions/privacy decisions used for an invocation.
- Model/tool/specialist invocations bind exact version/profile/contract identities.
- External effects bind the exact request digest and commit-time authorization; retries use idempotency/reconciliation rather than blind replay.
- Artifacts bind byte digest, lineage and producing attempt/invocation.
- Evidence binds exact subjects and cannot promote a changed subject.
- CompletionDecision states which success predicates were evaluated and what evidence supported them.
- RecoveryEpisode records what became uncertain, which authority resolved it and which identities were superseded/reused.

## Answerability requirement

The completed system must be able to answer, from durable records:
- Why was this artifact/state/effect produced?
- Which exact user intent and goal revision caused it?
- Which plan and route were used?
- Which budget/grant and executor ran it?
- Which model/tool/provider/version participated?
- What did it cost/consume?
- What evidence justified success?
- What happened after any crash/retry/recovery?

If any of those questions cannot be answered for a governed work item, the chain is incomplete.