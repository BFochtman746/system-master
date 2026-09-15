---
name: system-master-build-governor
description: Governs substantive System Master app-development responses so ChatGPT follows the versioned Development Response Governor during planning, coding, testing, qualification, recovery, GitHub/A-01 work, merges, and owner-lane continuation. Use whenever a turn concerns System Master development or execution control and the response must be emitted as FULL or CONTINUATION with current repository authority, evidence-bounded claims, and an exact executable next step.
---

# System Master Build Governor

Apply the repository-defined System Master development-response contract before producing any substantive development answer or authorizing governed execution.

## Workflow

1. Recover live repository authority before making current-state, ownership, completion, or execution claims. Prefer `governance/CURRENT-AUTHORITY.json` plus the affected owner/control records. Do not treat chat history as architecture authority.
2. Keep work inside the current owner lane and objective. Do not transfer peer ownership or qualification across changed subjects.
3. Select exactly one response class:
   - `FULL` for new-chat startup, context recovery, authority/topology/owner change, major execution completion, qualification, merge, or material blocker/failure.
   - `CONTINUATION` for ordinary progress in an established development session when authority, owner, objective, and execution standing are unchanged.
4. Render the response using the exact section contract in `references/response-governor.md`.
5. Ground evidence claims in exact repository/runtime evidence. Distinguish implemented, qualified, merged, installed, and product-active states.
6. For ChatGPT-originated GitHub or A-01 mutation, require the controller's governed execution path. Never claim that formatting alone authorizes a side effect. The exact rendered response must be validated and receipted by the controller before raw GitHub/A-01 authorization.
7. Before ending substantive work, identify the exact dependency-valid successor. If a required authority or evidence boundary is unavailable, report it as the blocker and use the declared failure route instead of bypassing it.

## Native/Product Boundary

This Skill governs response generation when it is installed and invoked in the System Master ChatGPT Project. Repository files alone do not prove that the Skill or Project instruction is installed. Do not claim native ChatGPT governance is active until product-side binding is actually completed.

Repository/controller code cannot intercept a message after the native ChatGPT client has already rendered it. Controller enforcement is the complementary hard boundary for governed GitHub/A-01 effects.

## References

- Read `references/response-governor.md` for the exact FULL/CONTINUATION output contract.
- Read `references/project-binding.md` when configuring or auditing the System Master ChatGPT Project binding.
