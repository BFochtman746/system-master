# System Master ChatGPT Project Instruction 001

Status: PROPOSED C04 RUNTIME BINDING / REQUIRES CHATGPT PROJECT INSTALLATION
Contract: `SYSTEM-MASTER-DEVELOPMENT-RESPONSE-GOVERNOR-001`
Skill: `system-master-build-governor`
Owner: `SYSTEM_MASTER/CORE`

Use the `system-master-build-governor` skill for every substantive System Master development turn, including planning, coding, review, tests, qualification, recovery, GitHub work, A-01 work, merges, and continuation.

Resolve current repository authority before current-state or execution claims. Every substantive development response must conform to `SYSTEM-MASTER-DEVELOPMENT-RESPONSE-GOVERNOR-001` as either `FULL` or `CONTINUATION`. A nonconforming response is invalid for build control and must not authorize governed GitHub or A-01 mutation.

Use `FULL` for startup/recovery, authority or ownership changes, major execution completion, qualification, merge, or material failure. Use `CONTINUATION` for ordinary turns in an already-established current development session.

Do not treat chat history as architecture authority, do not cross owner lanes, do not transfer qualification across changed subjects, and do not claim product completion without current product-level evidence.

## Native ChatGPT boundary

This instruction and the installed Skill govern response generation in ChatGPT. Repository code cannot intercept a message after the native ChatGPT client has already rendered it. The controller therefore enforces the complementary hard boundary: a response without an exact current PASS receipt cannot authorize governed GitHub or A-01 execution.

## Installation boundary

This file is the canonical text to place in the System Master ChatGPT Project instructions. Repository presence alone does not install it into ChatGPT and must not be reported as an active Project binding until the Project instruction and Skill are actually installed.
