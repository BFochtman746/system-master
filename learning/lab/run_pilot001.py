from __future__ import annotations

import run_pilot001_real_participant as console
from learning_lab.real_learner_pilot_withdrawal import withdraw_runtime_bound_pilot


# The participant-facing entrypoint deliberately overrides only the console's
# withdrawal hook. All evidence preparation/submission continues through the
# already-qualified human-session boundary; the additive withdrawal wrapper
# handles the zero-evidence consent-withdrawal edge without changing the frozen
# PILOT-001-v1 validator.
console.mark_runtime_bound_pilot_withdrawn = withdraw_runtime_bound_pilot


if __name__ == "__main__":
    raise SystemExit(console.main())
