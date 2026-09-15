from __future__ import annotations

import hashlib
import re


_ASCII_WS_RUN = re.compile(r"[ \t\r\n\f]+")
_ASCII_WS_TRIM = " \t\r\n\f"


def _trim_request_id(request_id: str) -> str:
    return request_id.strip(_ASCII_WS_TRIM)


def _normalize_payload(payload: str) -> str:
    # Normalize line endings first, then collapse exactly the ASCII whitespace
    # named by the cross-language contract.
    payload = payload.replace("\r\n", "\n").replace("\r", "\n")
    return _ASCII_WS_RUN.sub(" ", payload).strip(" ")


def canonical(request_id: str, payload: str) -> str:
    return f"{_trim_request_id(request_id)}:{_normalize_payload(payload)}"


def sha256(request_id: str, payload: str) -> str:
    return hashlib.sha256(canonical(request_id, payload).encode("utf-8")).hexdigest()
