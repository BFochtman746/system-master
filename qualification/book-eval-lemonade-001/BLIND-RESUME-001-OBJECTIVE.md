# BOOK-EVAL-LEMONADE-001-BLIND-RESUME-001

## Objective

Recover and bind the persisted A-01 blind-campaign state after the runner shutdown, prove exactly which frozen E4/E5 outputs survived, then resume only the missing blind work from the repository-authoritative Package V2 inputs.

## Qualified predecessor

- repository-bind closure commit: `10b52a31e64ed272ee36261d507e53d91a042e61`
- authoritative Package V2 payload commit: `2afd9458168edd1d399a329488572e25596d9609`
- Package V2 rebuild workflow: `34161022958`
- technical preflight marker: `PASS_A01_REPOSITORY_PACKAGE_V2_PREFLIGHT`

## Known interrupted campaign evidence

Prior run `34157917638` reached E4 `160/160` and E5 `16/160` before A-01 received a runner shutdown signal. That evidence is provisional until the persistent run root is independently probed.

## Phase 1 - read-only state probe

The first action is strictly read-only against:

`C:\AI Test Kit\Books Testing\BOOK_EVAL_LEMONADE_001_A01_BLIND_RUN_GPT_OSS_120B`

The probe may:

- verify the run root exists;
- count lines in `E4-SPECIALIST-v2-FROZEN.jsonl` and `E5-PANEL-v2-FROZEN.jsonl`;
- SHA-256 hash those frozen-output files when present;
- capture `BLIND-RUN-STATUS.json` and `A01-EXECUTION-SUMMARY.txt` when present;
- list file names in the run root for recovery diagnosis.

The probe must not:

- call the model;
- generate or modify blind outputs;
- access scoring-private material;
- use PowerShell;
- mutate the persistent run root.

## Resume gate

No blind resume is permitted until the probe proves the persisted state. If E4 is exactly 160 and E5 is partial, the successor resume must preserve E4 and continue E5 only from the existing resumable state. If the state differs, adjudicate before execution.
