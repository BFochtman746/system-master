from __future__ import annotations

import copy
import json
import socket
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Callable, Dict, List, Optional, Sequence

from .provider_acquisition import OpenGoalInputPacketService
from .provider_multi_candidate_runtime import start_provider_multi_candidate_adaptive_entry
from .provider_multi_sample_acquisition import ProviderMultiSampleAcquisitionService
from .repository import Repository, canonical_json, digest


HTTP_MODEL_PROVIDER_VERSION = "HTTP-JSON-MODEL-PROVIDER-V1"
HTTP_MODEL_RECEIPT_VERSION = "HTTP-MODEL-TRANSPORT-RECEIPT-V1"
HTTP_MODEL_BINDING_VERSION = "HTTP-MODEL-MULTI-SAMPLE-PACKET-BINDING-V1"
HTTP_MODEL_RECEIPT_STANDING = "DURABLE_PROVIDER_RESPONSE_NOT_COURSE_VERIFIED"
HTTP_MODEL_BINDING_STANDING = "HTTP_PROVIDER_RECEIPTS_BOUND_TO_SEALED_PACKETS_NOT_COURSE_VERIFIED"
HTTP_MODEL_RECEIPT_KIND = "http_model_transport_receipt"
HTTP_MODEL_BINDING_KIND = "http_model_multi_sample_packet_binding"
DEFAULT_TRANSIENT_STATUSES = frozenset({408, 425, 429, 500, 502, 503, 504})


def _inject(stage: Optional[str], expected: str) -> None:
    if stage == expected:
        raise RuntimeError("INJECTED_CRASH:" + expected)


def _validate_endpoint(endpoint: str) -> urllib.parse.SplitResult:
    parsed = urllib.parse.urlsplit(endpoint)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("HTTP_MODEL_ENDPOINT_INVALID")
    if parsed.username or parsed.password:
        raise ValueError("HTTP_MODEL_ENDPOINT_USERINFO_FORBIDDEN")
    if parsed.query or parsed.fragment:
        raise ValueError("HTTP_MODEL_ENDPOINT_QUERY_OR_FRAGMENT_FORBIDDEN")
    return parsed


def _safe_endpoint_identity(endpoint: str) -> Dict[str, Any]:
    parsed = _validate_endpoint(endpoint)
    return {
        "scheme": parsed.scheme,
        "host": parsed.hostname,
        "port": parsed.port,
        "path": parsed.path or "/",
    }


def _contains_secret(raw: bytes, secret: Optional[str]) -> bool:
    return bool(secret) and secret.encode("utf-8") in raw


class HTTPJSONModelProvider:
    """Provider-neutral HTTP JSON transport with durable response-before-return semantics.

    The transport is candidate-generation authority only. A successful provider response
    is durably receipted before its output is returned to packet admission. Replaying the
    same batch/sample/prompt therefore reuses the accepted response without another HTTP
    call. Credentials are request-only and are never written to the receipt.
    """

    def __init__(
        self,
        *,
        repo: Repository,
        batch_id: str,
        endpoint: str,
        model_id: str,
        credential_provider: Optional[Callable[[], Optional[str]]] = None,
        timeout_seconds: float = 10.0,
        max_attempts: int = 2,
        transient_statuses: Optional[Sequence[int]] = None,
    ):
        if not batch_id:
            raise ValueError("HTTP_MODEL_BATCH_ID_REQUIRED")
        if not model_id or not model_id.strip():
            raise ValueError("MODEL_ID_REQUIRED")
        _validate_endpoint(endpoint)
        if timeout_seconds <= 0 or timeout_seconds > 120:
            raise ValueError("HTTP_MODEL_TIMEOUT_OUT_OF_BOUNDS")
        if not isinstance(max_attempts, int) or isinstance(max_attempts, bool) or not (1 <= max_attempts <= 4):
            raise ValueError("HTTP_MODEL_MAX_ATTEMPTS_OUT_OF_BOUNDS")
        statuses = set(DEFAULT_TRANSIENT_STATUSES if transient_statuses is None else transient_statuses)
        if any(not isinstance(status, int) or status < 400 or status > 599 for status in statuses):
            raise ValueError("HTTP_MODEL_TRANSIENT_STATUS_INVALID")
        self.repo = repo
        self.batch_id = batch_id
        self.endpoint = endpoint
        self.endpoint_identity = _safe_endpoint_identity(endpoint)
        self.endpoint_identity_digest = digest(self.endpoint_identity)
        self.model_id = model_id
        self.credential_provider = credential_provider or (lambda: None)
        self.timeout_seconds = float(timeout_seconds)
        self.max_attempts = max_attempts
        self.transient_statuses = statuses

    def call_id(self, *, prompt_digest: str, sample_index: int) -> str:
        identity = {
            "provider_version": HTTP_MODEL_PROVIDER_VERSION,
            "batch_id": self.batch_id,
            "sample_index": sample_index,
            "model_id": self.model_id,
            "endpoint_identity_digest": self.endpoint_identity_digest,
            "prompt_digest": prompt_digest,
        }
        return "HTTP-MODEL-CALL-" + digest(identity)[:24].upper()

    def _validate_receipt(self, receipt: Dict[str, Any], *, prompt: Dict[str, Any], sample_index: int) -> None:
        required = {
            "receipt_version", "provider_version", "call_id", "batch_id", "sample_index",
            "model_id", "endpoint_identity", "endpoint_identity_digest", "prompt_digest",
            "request_body_digest", "response_body_digest", "provider_request_id", "status",
            "attempts", "transient_statuses_seen", "output", "output_digest", "standing",
            "receipt_digest",
        }
        missing = sorted(required - set(receipt))
        if missing:
            raise ValueError("HTTP_MODEL_RECEIPT_INCOMPLETE:" + ",".join(missing))
        unsigned = {key: value for key, value in receipt.items() if key != "receipt_digest"}
        if digest(unsigned) != receipt["receipt_digest"]:
            raise ValueError("HTTP_MODEL_RECEIPT_DIGEST_MISMATCH")
        if receipt["receipt_version"] != HTTP_MODEL_RECEIPT_VERSION or receipt["provider_version"] != HTTP_MODEL_PROVIDER_VERSION:
            raise ValueError("HTTP_MODEL_RECEIPT_VERSION_UNSUPPORTED")
        if receipt["standing"] != HTTP_MODEL_RECEIPT_STANDING:
            raise ValueError("HTTP_MODEL_RECEIPT_STANDING_INVALID")
        if receipt["batch_id"] != self.batch_id or receipt["sample_index"] != sample_index:
            raise ValueError("HTTP_MODEL_RECEIPT_SAMPLE_IDENTITY_MISMATCH")
        if receipt["model_id"] != self.model_id:
            raise ValueError("HTTP_MODEL_RECEIPT_MODEL_MISMATCH")
        if receipt["endpoint_identity_digest"] != self.endpoint_identity_digest:
            raise ValueError("HTTP_MODEL_RECEIPT_ENDPOINT_MISMATCH")
        if digest(receipt["endpoint_identity"]) != receipt["endpoint_identity_digest"]:
            raise ValueError("HTTP_MODEL_RECEIPT_ENDPOINT_DIGEST_MISMATCH")
        if receipt["prompt_digest"] != digest(prompt):
            raise ValueError("HTTP_MODEL_RECEIPT_PROMPT_MISMATCH")
        if receipt["output_digest"] != digest(receipt["output"]):
            raise ValueError("HTTP_MODEL_RECEIPT_OUTPUT_DIGEST_MISMATCH")
        expected_call_id = self.call_id(prompt_digest=receipt["prompt_digest"], sample_index=sample_index)
        if receipt["call_id"] != expected_call_id:
            raise ValueError("HTTP_MODEL_RECEIPT_CALL_ID_MISMATCH")

    def load_receipt(self, *, prompt_digest: str, sample_index: int) -> Dict[str, Any]:
        call_id = self.call_id(prompt_digest=prompt_digest, sample_index=sample_index)
        receipt = self.repo.get_object(HTTP_MODEL_RECEIPT_KIND, call_id, 1)
        if receipt is None:
            raise ValueError("HTTP_MODEL_RECEIPT_NOT_FOUND")
        return receipt

    def generate(
        self,
        prompt: Dict[str, Any],
        sample_index: int,
        *,
        inject_crash_after: Optional[str] = None,
    ) -> Dict[str, Any]:
        if not isinstance(sample_index, int) or isinstance(sample_index, bool) or sample_index < 0:
            raise ValueError("HTTP_MODEL_SAMPLE_INDEX_INVALID")
        prompt_copy = copy.deepcopy(prompt)
        prompt_digest = digest(prompt_copy)
        call_id = self.call_id(prompt_digest=prompt_digest, sample_index=sample_index)
        prior = self.repo.get_object(HTTP_MODEL_RECEIPT_KIND, call_id, 1)
        if prior is not None:
            self._validate_receipt(prior, prompt=prompt_copy, sample_index=sample_index)
            return copy.deepcopy(prior["output"])

        request_object = {
            "model": self.model_id,
            "prompt": prompt_copy,
            "sample_index": sample_index,
        }
        request_bytes = canonical_json(request_object).encode("utf-8")
        transient_seen: List[int] = []
        last_transport_error: Optional[str] = None

        for attempt in range(1, self.max_attempts + 1):
            token = self.credential_provider()
            if token is not None and (not isinstance(token, str) or not token):
                raise ValueError("HTTP_MODEL_CREDENTIAL_INVALID")
            headers = {
                "Content-Type": "application/json; charset=utf-8",
                "Accept": "application/json",
                "User-Agent": "SystemMasterLearningLab/1.0",
            }
            if token:
                headers["Authorization"] = "Bearer " + token
            request = urllib.request.Request(self.endpoint, data=request_bytes, headers=headers, method="POST")
            try:
                with urllib.request.urlopen(request, timeout=self.timeout_seconds) as response:
                    status = int(getattr(response, "status", 200))
                    raw = response.read()
                    provider_request_id = response.headers.get("X-Request-Id")
            except urllib.error.HTTPError as exc:
                status = int(exc.code)
                if status in self.transient_statuses:
                    transient_seen.append(status)
                    if attempt < self.max_attempts:
                        continue
                    raise ValueError(f"HTTP_MODEL_TRANSIENT_RETRIES_EXHAUSTED:{status}") from exc
                raise ValueError(f"HTTP_MODEL_PERMANENT_STATUS:{status}") from exc
            except (urllib.error.URLError, socket.timeout, TimeoutError) as exc:
                last_transport_error = type(exc).__name__
                if attempt < self.max_attempts:
                    continue
                raise ValueError("HTTP_MODEL_TRANSPORT_RETRIES_EXHAUSTED:" + last_transport_error) from exc

            if not (200 <= status <= 299):
                raise ValueError(f"HTTP_MODEL_UNEXPECTED_STATUS:{status}")
            if _contains_secret(raw, token):
                raise ValueError("HTTP_MODEL_SECRET_ECHO_FORBIDDEN")
            try:
                decoded = raw.decode("utf-8", errors="strict")
                body = json.loads(decoded)
            except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                raise ValueError("HTTP_MODEL_RESPONSE_JSON_INVALID") from exc
            if not isinstance(body, dict):
                raise ValueError("HTTP_MODEL_RESPONSE_OBJECT_REQUIRED")
            if body.get("model") != self.model_id:
                raise ValueError("HTTP_MODEL_RESPONSE_MODEL_MISMATCH")
            output = body.get("output")
            if not isinstance(output, dict):
                raise ValueError("HTTP_MODEL_RESPONSE_OUTPUT_OBJECT_REQUIRED")
            provider_request_id = body.get("request_id", provider_request_id)
            if provider_request_id is not None and not isinstance(provider_request_id, str):
                raise ValueError("HTTP_MODEL_RESPONSE_REQUEST_ID_INVALID")

            receipt = {
                "receipt_version": HTTP_MODEL_RECEIPT_VERSION,
                "provider_version": HTTP_MODEL_PROVIDER_VERSION,
                "call_id": call_id,
                "batch_id": self.batch_id,
                "sample_index": sample_index,
                "model_id": self.model_id,
                "endpoint_identity": copy.deepcopy(self.endpoint_identity),
                "endpoint_identity_digest": self.endpoint_identity_digest,
                "prompt_digest": prompt_digest,
                "request_body_digest": digest(request_object),
                "response_body_digest": digest(body),
                "provider_request_id": provider_request_id,
                "status": status,
                "attempts": attempt,
                "transient_statuses_seen": list(transient_seen),
                "output": copy.deepcopy(output),
                "output_digest": digest(output),
                "standing": HTTP_MODEL_RECEIPT_STANDING,
            }
            receipt["receipt_digest"] = digest(receipt)
            self._validate_receipt(receipt, prompt=prompt_copy, sample_index=sample_index)
            self.repo.put_object(HTTP_MODEL_RECEIPT_KIND, call_id, 1, receipt)
            _inject(inject_crash_after, "HTTP_RESPONSE_RECEIPT_STORED")
            return copy.deepcopy(output)

        raise ValueError("HTTP_MODEL_UNREACHABLE_PROVIDER_LOOP")


class HTTPProviderMultiSampleBindingService:
    """Binds durable HTTP receipts to IMPL-022 packets without giving HTTP selection authority."""

    def __init__(self, repo: Repository):
        self.repo = repo

    def acquire_and_bind(
        self,
        *,
        operation_id: str,
        batch_id: str,
        desired_outcome: str,
        sample_count: int,
        endpoint: str,
        model_id: str,
        research_capture_provider: Callable[[str], Dict[str, Any]],
        credential_provider: Optional[Callable[[], Optional[str]]] = None,
        timeout_seconds: float = 10.0,
        max_attempts: int = 2,
    ) -> Dict[str, Any]:
        provider = HTTPJSONModelProvider(
            repo=self.repo,
            batch_id=batch_id,
            endpoint=endpoint,
            model_id=model_id,
            credential_provider=credential_provider,
            timeout_seconds=timeout_seconds,
            max_attempts=max_attempts,
        )
        acquisition = ProviderMultiSampleAcquisitionService(self.repo).acquire_and_admit(
            operation_id=operation_id,
            batch_id=batch_id,
            desired_outcome=desired_outcome,
            sample_count=sample_count,
            model_id=model_id,
            research_capture_provider=research_capture_provider,
            model_candidate_provider=lambda prompt, index: provider.generate(prompt, index),
        )

        packet_service = OpenGoalInputPacketService(self.repo)
        entries: List[Dict[str, Any]] = []
        for sample_index, packet_id in enumerate(acquisition["packet_ids"]):
            packet = packet_service.load(packet_id)
            prompt_digest = packet["model_trace"]["prompt_digest"]
            receipt = provider.load_receipt(prompt_digest=prompt_digest, sample_index=sample_index)
            provider._validate_receipt(receipt, prompt=packet["model_trace"]["prompt"], sample_index=sample_index)
            if receipt["output_digest"] != packet["model_output_digest"]:
                raise ValueError("HTTP_MODEL_PACKET_OUTPUT_BINDING_MISMATCH")
            if receipt["prompt_digest"] != prompt_digest:
                raise ValueError("HTTP_MODEL_PACKET_PROMPT_BINDING_MISMATCH")
            if receipt["model_id"] != packet["model_trace"]["model_id"]:
                raise ValueError("HTTP_MODEL_PACKET_MODEL_BINDING_MISMATCH")
            entries.append({
                "sample_index": sample_index,
                "call_id": receipt["call_id"],
                "receipt_digest": receipt["receipt_digest"],
                "packet_id": packet_id,
                "packet_digest": packet["packet_digest"],
                "model_trace_digest": packet["model_trace_digest"],
                "output_digest": packet["model_output_digest"],
            })

        binding = {
            "binding_version": HTTP_MODEL_BINDING_VERSION,
            "batch_id": batch_id,
            "batch_digest": acquisition["batch_digest"],
            "model_id": model_id,
            "endpoint_identity_digest": provider.endpoint_identity_digest,
            "sample_count": acquisition["sample_count"],
            "entries": entries,
            "standing": HTTP_MODEL_BINDING_STANDING,
            "authority_boundary": {
                "http_provider_is_selection_authority": False,
                "http_receipt_is_course_verification": False,
                "packet_admission_is_course_verification": False,
                "independent_selection_required": True,
                "learning_engine_remains_mastery_authority": True,
            },
        }
        binding["binding_digest"] = digest(binding)
        self.repo.put_object(HTTP_MODEL_BINDING_KIND, batch_id, 1, binding)
        return {
            **acquisition,
            "http_model_provider_version": HTTP_MODEL_PROVIDER_VERSION,
            "http_model_binding_version": HTTP_MODEL_BINDING_VERSION,
            "http_model_binding_digest": binding["binding_digest"],
            "http_model_endpoint_identity_digest": provider.endpoint_identity_digest,
        }

    def load_binding(self, batch_id: str) -> Dict[str, Any]:
        binding = self.repo.get_object(HTTP_MODEL_BINDING_KIND, batch_id, 1)
        if binding is None:
            raise ValueError("HTTP_MODEL_BINDING_NOT_FOUND")
        unsigned = {key: value for key, value in binding.items() if key != "binding_digest"}
        if digest(unsigned) != binding["binding_digest"]:
            raise ValueError("HTTP_MODEL_BINDING_DIGEST_MISMATCH")
        if binding.get("binding_version") != HTTP_MODEL_BINDING_VERSION:
            raise ValueError("HTTP_MODEL_BINDING_VERSION_UNSUPPORTED")
        if binding.get("standing") != HTTP_MODEL_BINDING_STANDING:
            raise ValueError("HTTP_MODEL_BINDING_STANDING_INVALID")
        boundary = binding.get("authority_boundary", {})
        if boundary.get("http_provider_is_selection_authority") is not False:
            raise ValueError("HTTP_MODEL_PROVIDER_AUTHORITY_ESCALATION")
        if boundary.get("http_receipt_is_course_verification") is not False:
            raise ValueError("HTTP_MODEL_RECEIPT_SELF_APPROVAL_FORBIDDEN")
        if boundary.get("independent_selection_required") is not True:
            raise ValueError("INDEPENDENT_COURSE_VALIDATION_REQUIRED")
        return binding


def acquire_bind_and_start_http_multi_sample_adaptive_entry(
    *,
    repo: Repository,
    operation_id: str,
    batch_id: str,
    request_id: str,
    learner_id: str,
    desired_outcome: str,
    sample_count: int,
    endpoint: str,
    model_id: str,
    research_capture_provider: Callable[[str], Dict[str, Any]],
    claimed_skill_ids: Sequence[str],
    now: int,
    credential_provider: Optional[Callable[[], Optional[str]]] = None,
    timeout_seconds: float = 10.0,
    max_attempts: int = 2,
) -> Dict[str, Any]:
    bound = HTTPProviderMultiSampleBindingService(repo).acquire_and_bind(
        operation_id=operation_id,
        batch_id=batch_id,
        desired_outcome=desired_outcome,
        sample_count=sample_count,
        endpoint=endpoint,
        model_id=model_id,
        research_capture_provider=research_capture_provider,
        credential_provider=credential_provider,
        timeout_seconds=timeout_seconds,
        max_attempts=max_attempts,
    )
    runtime = start_provider_multi_candidate_adaptive_entry(
        repo=repo,
        request_id=request_id,
        learner_id=learner_id,
        packet_ids=bound["packet_ids"],
        claimed_skill_ids=list(claimed_skill_ids),
        now=now,
    )
    out = dict(runtime)
    out.update({
        "http_model_provider_version": bound["http_model_provider_version"],
        "http_model_binding_version": bound["http_model_binding_version"],
        "http_model_binding_digest": bound["http_model_binding_digest"],
        "provider_multi_sample_batch_id": bound["batch_id"],
        "provider_multi_sample_batch_digest": bound["batch_digest"],
    })
    return out
