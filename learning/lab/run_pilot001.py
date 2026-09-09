from __future__ import annotations

import run_pilot001_closed_loop as closed_loop


# Keep `console` exported for compatibility with the already-qualified stage-one
# tests and operator tooling. The closed-loop launcher preserves the same human
# session and safe-withdrawal boundaries while adding retention/transfer/finalization.
console = closed_loop.console


def print_evidence_handling_notice() -> None:
    print("\n=== PILOT-001-RUN-001 EVIDENCE HANDLING ===")
    print("Pilot evidence is stored locally on this machine by default, outside the source-code repository.")
    print("This participant launcher does not automatically upload pilot evidence to GitHub, GitHub Actions, or another external service.")
    print("Retained pilot evidence uses scored/routing evidence and SHA-256 response digests rather than raw participant free-text answers or direct PII.")
    print("Any later external export or integrity anchoring is a separate controlled operation and is not implied by participation.\n")


def main() -> int:
    print_evidence_handling_notice()
    return closed_loop.main()


if __name__ == "__main__":
    raise SystemExit(main())
