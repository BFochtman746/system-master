from __future__ import annotations

import hashlib


def canonical(request_id: str, payload: str) -> str:
    # Intentionally defective: does not normalize incidental whitespace.
    return f"{request_id}:{payload}"


def sha256(request_id: str, payload: str) -> str:
    return hashlib.sha256(canonical(request_id, payload).encode("utf-8")).hexdigest()
