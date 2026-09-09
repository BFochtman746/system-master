# SMR021 Offline Truthfulness + Portable Accessibility Research Delta 001

Date: 2026-09-09
Owner lane: `SYSTEM_MASTER/CORE`
Status: **RESEARCH_AHEAD CLOSED / KEEP + ADD_OR_REFINE DELTAS SEALED**
Parent readiness packet: `SMR021-ADMISSION-BINDING-TOMORROW-READINESS-001.md`

## Questions closed

1. Does the recovered R025 PWA correctly distinguish browser/network hints, cached shell behavior and actual server-confirmed state?
2. Which accessibility requirements can be enforced in portable/static or bounded browser tests now without falsely claiming device/screen-reader usability evidence?

## Sources and provenance

Accessed 2026-09-09.

1. MDN — `Navigator.onLine`
   - https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine
   - Current guidance: online status uses browser/OS heuristics and is inherently unreliable as proof of Internet/server reachability; use it as a hint rather than a hard availability decision.

2. MDN — `Window: online event`
   - https://developer.mozilla.org/en-US/docs/Web/API/Window/online_event
   - Current guidance: an `online` event does not prove that a particular website/server is reachable.

3. W3C Service Workers Candidate Recommendation Draft, 12 August 2026
   - https://www.w3.org/TR/service-workers/
   - Relevant behavior: service workers can intercept requests and return cached responses, including content usable while offline.

4. MDN — Progressive Web Apps / Caching
   - https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Caching
   - Relevant behavior: service workers can return locally cached `Response` objects instead of network responses.

5. W3C WCAG 2.2
   - https://www.w3.org/TR/WCAG22/
   - Relevant criteria: 2.4.11 Focus Not Obscured (Minimum), 2.5.8 Target Size (Minimum), and existing 4.1.3 Status Messages.

6. W3C Technique ARIA22 — Using `role=status` to present status messages
   - https://www.w3.org/WAI/WCAG21/Techniques/aria/ARIA22.html
   - Relevant guidance: `role="status"` is a polite live region; explicit `aria-atomic="true"` is advisable when the full status context should be announced because some environments do not treat implicit atomic behavior consistently.

7. WAI-ARIA 1.3 — `status` role
   - https://www.w3.org/TR/wai-aria-1.3/#status
   - Relevant semantics: status is advisory, should not receive focus merely because its text changes, and has implicit `aria-live="polite"` and `aria-atomic="true"`.

These sources define portable invariants and test design only. They do not create physical-device, browser-matrix, assistive-technology or usability PASS.

## Recovered historical implementation evidence

The immutable historical v2.0.24 carrier contains:

- `04_PLATFORM/pwa/app.js`
- `04_PLATFORM/pwa/index.html`
- `04_PLATFORM/pwa/app.css`
- `tools/verify_userexperience001_authority.py`
- `tools/verify_pre_orchestrator_portable.py`

Observed historical behavior:

- `boot()` performs `fetch('/api/session', {credentials:'same-origin', cache:'no-store', redirect:'error', ...})`;
- `Connected — server confirmed` is emitted only after an OK response, JSON content-type validation, JSON parsing and projection rendering;
- network/error fallback explicitly says either `Session unavailable. No completion or remote acknowledgement is implied.` or `Offline. Cached shell only; no remote confirmation.`;
- `navigator.onLine` is used only to choose the fallback wording, not to assert server confirmation;
- `online` triggers a fresh `boot()` instead of immediately claiming connectivity;
- `offline` clears protected projection and labels the state as local-shell-only;
- connection and work-status regions use `role="status" aria-live="polite"`;
- buttons/links have historical minimum 44px block/inline sizing;
- CSS contains `:focus-visible`, reduced-motion handling, forced-color handling and safe-area insets;
- the header is sticky, so focus-obscuration needs an explicit test rather than being inferred from the presence of a focus style.

## Finding dispositions

### 1. `navigator.onLine` is not server authority

Disposition: **KEEP**

The historical R025 logic already follows current guidance: `navigator.onLine` changes explanatory wording but does not produce `server confirmed` state.

Dependency-current implementation law:

- never use `navigator.onLine`, `online`, service-worker activation or cache availability as proof that System Master server state is current;
- `server confirmed` requires a successful application-layer response from the intended endpoint and successful validation of the response expected by the current contract.

Candidate tests:

- `NAVIGATOR_ONLINE_SERVER_UNREACHABLE_NOT_CONFIRMED`;
- `ONLINE_EVENT_SERVER_UNREACHABLE_NOT_CONFIRMED`.

### 2. Cached response provenance must not become remote confirmation

Disposition: **KEEP / ADD_OR_REFINE**

Service workers can satisfy fetches from cache. Therefore a future cache-strategy change could accidentally make a syntactically successful response look like fresh server confirmation.

Implementation implication after exact dependency-current source recovery:

- inspect the current service-worker routing for `/api/session` and other authority-bearing endpoints;
- authority-bearing session/work confirmation must be network-origin evidence under the current contract, not a stale Cache API response;
- if `/api/session` is intentionally bypassed by the service worker, preserve that invariant in an executable test;
- if cached application data is intentionally displayed, label it as cached/local with freshness/provenance and do not imply remote acknowledgement, completion or current authority.

Candidate tests:

- `SESSION_AUTHORITY_ENDPOINT_CACHE_BYPASS_OR_NETWORK_PROVENANCE`;
- `CACHED_SESSION_RESPONSE_NOT_SERVER_CONFIRMED`;
- `CACHED_PROJECTION_LABELS_LOCAL_OR_STALE`.

### 3. Successful HTTP alone is not enough

Disposition: **KEEP / ADD_OR_REFINE**

Historical R025 already requires OK status, JSON content type and parse success before server-confirmed wording. Preserve that.

Refinement for the dependency-current contract:

Where current session/work APIs expose a response version, server timestamp, work version, session generation or integrity identity, preserve/project the relevant freshness identity so a successful but stale response cannot silently become a current-work assertion.

Do not invent a new version field if the current API lacks one; classify that as an API/owner contract gap first.

Candidate tests:

- `NON_JSON_200_NOT_CONFIRMED`;
- `STALE_RESPONSE_GENERATION_NOT_RENDERED` (historical `bootGeneration` already protects this class);
- `CURRENT_API_FRESHNESS_IDENTITY_ENFORCED_WHEN_PRESENT`.

### 4. Status-message semantics

Disposition: **KEEP + ADD_OR_REFINE**

Historical use of `role="status" aria-live="polite"` is aligned with WCAG status-message semantics.

Portable refinement:

- add explicit `aria-atomic="true"` to status containers when the entire status message should be announced as one unit;
- do not move keyboard focus to a status region merely because its text updates;
- preserve separate status vs alert semantics; ordinary connection/work updates remain advisory unless the current UX contract proves an interruptive alert is necessary.

Candidate static checks:

- all primary advisory status containers have `role="status"`;
- status containers have `aria-live="polite"` and explicit `aria-atomic="true"` where whole-message announcement is intended;
- status updates do not invoke `.focus()` on the status node.

### 5. Target sizing

Disposition: **KEEP**

Historical CSS enforces `44px` minimum button/link dimensions, which is stronger than WCAG 2.2 SC 2.5.8's 24-by-24 CSS pixel minimum for ordinary pointer targets.

Portable test implication:

- preserve the 44px System Master policy for primary interactive controls unless the current canonical accessibility/human-factors policy explicitly changes it;
- static CSS checks may prove declared minimum dimensions but not real rendered touch-target geometry across all browsers/devices.

Do not downgrade the existing 44px policy merely because WCAG permits 24px in the general case.

### 6. Focus not obscured

Disposition: **ADD_OR_REFINE TESTING**

Historical CSS includes a sticky global header and visible focus styling. WCAG 2.2 additionally requires focused controls not be entirely hidden by author-created content.

Implementation/evaluation implication:

- add a bounded browser test that keyboard-tabs through rendered interactive controls at representative supported viewport sizes and verifies the focused element intersects the visible viewport after accounting for sticky/fixed author-created overlays;
- where scrolling to fragments/focusable controls can place them beneath the sticky header, use an existing/current CSS mechanism such as appropriate scroll padding/margin if needed after reproduced failure;
- this headless/browser test proves only the tested browser/viewport configuration, not a full browser/device/accessibility matrix.

Candidate test:

- `KEYBOARD_FOCUS_NOT_FULLY_OBSCURED_BY_STICKY_HEADER`.

### 7. Focus restoration around Files/artifacts surface

Disposition: **VERIFY CURRENT LINEAGE / POTENTIAL GAP**

Historical code returns focus to `filesButton` when the Files surface closes. On open it calls `artifactsNode.focus?.()`, while the historical `<aside id="artifacts">` has no explicit `tabindex`.

Do not change this from historical evidence alone. After exact SMR020 recovery:

- verify whether the current artifacts surface is modal, non-modal, a disclosure, dialog, sheet or another pattern;
- verify the actual current focus contract;
- if focus is intentionally moved on open, move it to a reliably focusable, semantically appropriate target under that pattern and test return focus on close;
- if focus should remain on the disclosure control, remove unnecessary focus movement rather than forcing a container focus.

Candidate disposition after current-source inspection: `KEEP`, `REFINE`, or `CROSS_SURFACE_UX_CONTRACT_REQUIRED`.

## Minimum added portable/bounded browser cases

Add these cases to the dependency-current USER-EXPERIENCE evaluation plan where the recovered current implementation still has the corresponding surface:

1. `NAVIGATOR_ONLINE_SERVER_UNREACHABLE_NOT_CONFIRMED`
2. `ONLINE_EVENT_SERVER_UNREACHABLE_NOT_CONFIRMED`
3. `SESSION_AUTHORITY_ENDPOINT_CACHE_BYPASS_OR_NETWORK_PROVENANCE`
4. `CACHED_SESSION_RESPONSE_NOT_SERVER_CONFIRMED`
5. `CACHED_PROJECTION_LABELS_LOCAL_OR_STALE`
6. `NON_JSON_200_NOT_CONFIRMED`
7. `STALE_RESPONSE_GENERATION_NOT_RENDERED`
8. `STATUS_MESSAGE_PROGRAMMATIC_AND_ATOMIC`
9. `STATUS_UPDATE_DOES_NOT_STEAL_FOCUS`
10. `PRIMARY_TARGET_MINIMUM_44PX_POLICY`
11. `KEYBOARD_FOCUS_NOT_FULLY_OBSCURED_BY_STICKY_HEADER`
12. `FILES_SURFACE_FOCUS_CONTRACT` after current-lineage pattern classification

## What this research does not prove

- VoiceOver, TalkBack or any specific screen-reader announcement behavior;
- physical iPhone/iPad/Android/desktop target geometry;
- complete keyboard behavior across all browsers;
- dynamic type/zoom/reflow correctness across the full supported matrix;
- touch ergonomics/usability;
- offline synchronization correctness for data flows not actually executed;
- server freshness beyond identities actually supplied and validated by current APIs;
- production continuity.

Those remain separate empirical evidence boundaries.

## Closed research result

The historical R025 offline truthfulness design is materially sound and should be **preserved**, not rebuilt: server-confirmed wording follows an actual no-store application request, while browser online state is only a hint and offline clears protected projection.

The useful deltas are bounded:

1. explicitly protect authority-bearing endpoints from cache-origin false confirmation;
2. preserve freshness identities when the current API exposes them;
3. make whole-message status semantics explicit with `aria-atomic="true"` where intended;
4. add focus-obscuration and Files-surface focus-contract tests;
5. retain the stronger existing 44px target policy.

No broader offline or accessibility research is required before exact-current-source inspection.

## Next dependency-valid action

The implementation-critical blocker remains exact SMR020 source custody. Once recovered, inspect the current `/api/session` service-worker path, status markup/CSS and Files focus pattern during the same pre-mutation mapping pass used by `SMR021-ADMISSION-BINDING-TOMORROW-READINESS-001.md`, then implement only reproduced current-lineage gaps.
