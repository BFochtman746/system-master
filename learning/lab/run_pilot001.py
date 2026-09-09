from __future__ import annotations

import run_pilot001_closed_loop as closed_loop


# Keep `console` exported for compatibility with the already-qualified stage-one
# tests and operator tooling. The closed-loop launcher preserves the same human
# session and safe-withdrawal boundaries while adding retention/transfer/finalization.
console = closed_loop.console


if __name__ == "__main__":
    raise SystemExit(closed_loop.main())
