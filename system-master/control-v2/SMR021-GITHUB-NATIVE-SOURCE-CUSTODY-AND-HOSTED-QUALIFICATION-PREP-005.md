# SMR021 GitHub-Native Source Custody and Hosted Qualification Preparation 005

Date: 2026-09-10
Owner: `SYSTEM_MASTER/CORE`
Input Core head: `ce902b740ef4a9577f6266287ea03067050ab57c`
Standing: **PREPARATION COMPLETE / SOURCE IMPORT AND HOSTED EXECUTION NOT YET ADMITTED**

## Exact source intake

The only acceptable unchanged candidate is the 435-file source/test identity `fe325804bacfd5c40339a18bc393fb1bdfb2191c8b0f3946219d7d81f1971596`, carried by `SMR021_MINIMUM_UX_ADMISSION_BINDING_SOURCE_TEST_CANDIDATE_001.zip` at 424,986 bytes and SHA-256 `377afa2c9ff2c7c69e5cd5bc45c66dd95ceb2315c1787afc35df6d907165fca1`.

Import must be a new immutable candidate ref. Before extracting or treating any file as evidence, the intake job must check byte count and archive SHA-256. After extraction it must execute the capsule's canonical source/test identity verifier and require the declared 435-file identity. A different archive, file set, ordering rule, source/test digest, migration, schema, or test byte set is a new candidate and cannot inherit `fe325...` evidence.

## GitHub-native manifest contract

The import commit must carry a machine-readable manifest containing:

- archive name, byte count and SHA-256;
- exact source/test digest and canonical digest algorithm/tool revision;
- all 435 canonical paths or an exact manifest digest plus the committed verifier;
- patch SHA-256 `77bb53bfef9a8ff3a49357736ed4aef2c908dda47c9aa7001946fe98a33a90a0`;
- predecessor `e22ecedf...`, bounded candidate `fe325804...`, import commit SHA and source branch/ref;
- DATA contract/migration identities when supplied;
- compiler/JDK requirement, complete suite discovery rule and expected inherited count;
- explicit false authority flags for A-01, native/device, human, promotion and production.

The ordinary Git tree—not an Actions cache, transient workspace, chat attachment, or digest-only prose pointer—must contain the runnable source/test/verifier bytes used by hosted qualification.

## Hosted qualification job contract

The job is hosted Ubuntu only and must not carry `self-hosted`, `Windows`, or `A-01` labels. It must:

1. checkout the exact immutable import SHA with credentials disabled;
2. verify the checkout SHA, archive/capsule SHA-256, byte count, manifest and canonical source/test identity;
3. enforce a 30-minute outer timeout and a 25-minute qualification timeout;
4. use concurrency `smr021-hosted-prequalification-<exact-subject>` with `cancel-in-progress: false`;
5. report disk/memory/tool versions and clean its temporary extraction directory after evidence sealing;
6. run strict Java 21 compilation, the inherited 21-suite discovery set, all Packet-004 persistence/admission cases, static schema/SQL/JDBC parity, release-manifest/current-authority coherence and a second fresh extraction;
7. require zero unauthorized durable writes and zero effect executions across all negative cases;
8. upload request, environment, manifest, compile log, suite log, focused matrix results, digests and a non-authoritative hosted receipt for 30 days;
9. set every promotion/A-01/native/device/human/production flag false;
10. route the result to `SYSTEM_MASTER/CORE` for morning adjudication.

Hosted failure classification must distinguish source/custody mismatch, compile/test subject failure, transient infrastructure, timeout, and DATA-owner dependency. A hosted PASS proves only the exact portable/hosted boundary.

## Scheduler and A-01 policy

No overnight or A-01 ticket is admitted from this preparation record. If a later owner-valid packet needs A-01, it must first have a GitHub-native exact subject, a registered qualification, hosted PASS on that same subject, current control-plane enforcement PASS, valid window math, serialized A-01 admission, runner resource/sleep guards, evidence upload, and a return ticket. No PASS transfers.

The active control-plane repair uses its existing transaction and replacement ticket; this SMR021 packet must not create or reuse that repair lineage.

## Remaining dependency

DATA-owned durable admission storage/migration remains owner-action-required in `SMR021-DATA-PERSISTENCE-OWNER-HANDOFF-005.json`. CORE can build adversarial fixtures against the returned interface, but cannot invent the DATA authority boundary.

## Successor

`SMR021-HOSTED-PREQUALIFICATION-WORKFLOW-AND-MANIFEST-SPEC-006`

Prepare reviewable workflow/schema fixtures without scheduling or running them. Stop before executable admission until exact runnable bytes and a DATA-owner-valid contract are both present.
