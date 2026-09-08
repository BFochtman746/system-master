from __future__ import annotations

import copy
import json
import socket
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Callable, Dict, List, Optional, Sequence, Set

from .http_model_provider import HTTPProviderMultiSampleBindingService
from .live_open_goal import NormalizedLiveResearchPort
from .provider_acquisition import OpenGoalInputPacketService
from .provider_multi_candidate_runtime import start_provider_multi_candidate_adaptive_entry
from .repository import Repository, canonical_json, digest


HTTP_RESEARCH_PROVIDER_VERSION = "HTTP-JSON-RESEARCH-PROVIDER-V1"
HTTP_RESEARCH_RECEIPT_VERSION = "HTTP-RESEARCH-TRANSPORT-RECEIPT-V1"
HTTP_RESEARCH_BINDING_VERSION = "HTTP-RESEARCH-MULTI-SAMPLE-PACKET-BINDING-V1"
HTTP_RESEARCH_RECEIPT_STANDING = "DURABLE_NORMALIZED_RESEARCH_RESPONSE_NOT_COURSE_VERIFIED"
HTTP_RESEARCH_BINDING_STANDING = "HTTP_RESEARCH_RECEIPT_BOUND_TO_SEALED_PACKET_SET_NOT_COURSE_VERIFIED"
HTTP_RESEARCH_RECEIPT_KIND = "http_research_transport_receipt"
HTTP_RESEARCH_BINDING_KIND = "http_research_multi_sample_packet_binding"
DEFAULT_TRANSIENT_STATUSES = frozenset({408, 425, 429, 500, 502, 503, 504})
DEFAULT_ALLOWED_SOURCE_POLICIES = frozenset({"OFFICIAL_PRIMARY_CURRENT"})
MAX_RESEARCH_SOURCES = 20
MAX_RESEARCH_CLAIMS = 100


def _inject(stage: Optional[str], expected: str) -> None:
    if stage == expected:
        raise RuntimeError("INJECTED_CRASH:" + expected)


def _validate_endpoint(endpoint: str) -> urllib.parse.SplitResult:
    parsed = urllib.parse.urlsplit(endpoint)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("HTTP_RESEARCH_ENDPOINT_INVALID")
    if parsed.username or parsed.password:
        raise ValueError("HTTP_RESEARCH_ENDPOINT_USERINFO_FORBIDDEN")
    if parsed.query or parsed.fragment:
        raise ValueError("HTTP_RESEARCH_ENDPOINT_QUERY_OR_FRAGMENT_FORBIDDEN")
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


def _validate_source_url(url: str) -> None:
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("HTTP_RESEARCH_SOURCE_URL_INVALID")
    if parsed.username or parsed.password:
        raise ValueError("HTTP_RESEARCH_SOURCE_URL_USERINFO_FORBIDDEN")


class HTTPJSONResearchProvider:
    """Provider-neutral normalized research transport with durable response-before-return semantics."""

    def __init__(
        self,
        *,
        repo: Repository,
        research_request_id: str,
        endpoint: str,
        credential_provider: Optional[Callable[[], Optional[str]]] = None,
        timeout_seconds: float = 10.0,
        max_attempts: int = 2,
        transient_statuses: Optional[Sequence[int]] = None,
        allowed_source_policies: Optional[Sequence[str]] = None,
        allowed_authorities: Optional[Sequence[str]] = None,
    ):
        if not research_request_id:
            raise ValueError("HTTP_RESEARCH_REQUEST_ID_REQUIRED")
        _validate_endpoint(endpoint)
        if timeout_seconds <= 0 or timeout_seconds > 120:
            raise ValueError("HTTP_RESEARCH_TIMEOUT_OUT_OF_BOUNDS")
        if not isinstance(max_attempts, int) or isinstance(max_attempts, bool) or not (1 <= max_attempts <= 4):
            raise ValueError("HTTP_RESEARCH_MAX_ATTEMPTS_OUT_OF_BOUNDS")
        statuses = set(DEFAULT_TRANSIENT_STATUSES if transient_statuses is None else transient_statuses)
        if any(not isinstance(status, int) or status < 400 or status > 599 for status in statuses):
            raise ValueError("HTTP_RESEARCH_TRANSIENT_STATUS_INVALID")
        policies = set(DEFAULT_ALLOWED_SOURCE_POLICIES if allowed_source_policies is None else allowed_source_policies)
        if not policies or any(not isinstance(policy, str) or not policy for policy in policies):
            raise ValueError("HTTP_RESEARCH_SOURCE_POLICY_SET_INVALID")
        authorities = None if allowed_authorities is None else set(allowed_authorities)
        if authorities is not None and (not authorities or any(not isinstance(value, str) or not value for value in authorities)):
            raise ValueError("HTTP_RESEARCH_AUTHORITY_SET_INVALID")
        self.repo = repo
        self.research_request_id = research_request_id
        self.endpoint = endpoint
        self.endpoint_identity = _safe_endpoint_identity(endpoint)
        self.endpoint_identity_digest = digest(self.endpoint_identity)
        self.credential_provider = credential_provider or (lambda: None)
        self.timeout_seconds = float(timeout_seconds)
        self.max_attempts = max_attempts
        self.transient_statuses = statuses
        self.allowed_source_policies: Set[str] = policies
        self.allowed_authorities: Optional[Set[str]] = authorities

    def call_id(self, *, goal_digest: str) -> str:
        identity = {
            "provider_version": HTTP_RESEARCH_PROVIDER_VERSION,
            "research_request_id": self.research_request_id,
            "endpoint_identity_digest": self.endpoint_identity_digest,
            "goal_digest": goal_digest,
            "allowed_source_policies": sorted(self.allowed_source_policies),
            "allowed_authorities": None if self.allowed_authorities is None else sorted(self.allowed_authorities),
        }
        return "HTTP-RESEARCH-CALL-" + digest(identity)[:24].upper()

    def _validate_capture(self, capture: Dict[str, Any], goal: str) -> Dict[str, Any]:
        if not isinstance(capture, dict):
            raise ValueError("HTTP_RESEARCH_CAPTURE_OBJECT_REQUIRED")
        required = {
            "capture_id", "capture_version", "domain_key", "goal_terms", "sources", "claims",
            "source_policy", "normalized_evidence_digest",
        }
        missing = sorted(required - set(capture))
        if missing:
            raise ValueError("HTTP_RESEARCH_CAPTURE_INCOMPLETE:" + ",".join(missing))
        if capture.get("goal") is not None and capture.get("goal") != goal:
            raise ValueError("HTTP_RESEARCH_CAPTURE_GOAL_MISMATCH")
        if capture["source_policy"] not in self.allowed_source_policies:
            raise ValueError("HTTP_RESEARCH_SOURCE_POLICY_REJECTED")
        sources = capture["sources"]
        claims = capture["claims"]
        if not isinstance(sources, list) or not (1 <= len(sources) <= MAX_RESEARCH_SOURCES):
            raise ValueError("HTTP_RESEARCH_SOURCE_COUNT_OUT_OF_BOUNDS")
        if not isinstance(claims, list) or not (1 <= len(claims) <= MAX_RESEARCH_CLAIMS):
            raise ValueError("HTTP_RESEARCH_CLAIM_COUNT_OUT_OF_BOUNDS")
        source_ids = set()
        for source in sources:
            if not isinstance(source, dict):
                raise ValueError("HTTP_RESEARCH_SOURCE_OBJECT_REQUIRED")
            for key in ("source_id", "title", "url", "authority", "standing"):
                if not source.get(key):
                    raise ValueError("HTTP_RESEARCH_SOURCE_INCOMPLETE:" + key)
            if source["standing"] != "ADMITTED":
                raise ValueError("HTTP_RESEARCH_SOURCE_NOT_ADMITTED")
            if source["source_id"] in source_ids:
                raise ValueError("HTTP_RESEARCH_SOURCE_ID_DUPLICATE")
            source_ids.add(source["source_id"])
            _validate_source_url(source["url"])
            if self.allowed_authorities is not None and source["authority"] not in self.allowed_authorities:
                raise ValueError("HTTP_RESEARCH_SOURCE_AUTHORITY_REJECTED")
        claim_ids = set()
        for claim in claims:
            if not isinstance(claim, dict):
                raise ValueError("HTTP_RESEARCH_CLAIM_OBJECT_REQUIRED")
            for key in ("claim_id", "source_id", "kind", "text"):
                if not claim.get(key):
                    raise ValueError("HTTP_RESEARCH_CLAIM_INCOMPLETE:" + key)
            if claim["claim_id"] in claim_ids:
                raise ValueError("HTTP_RESEARCH_CLAIM_ID_DUPLICATE")
            claim_ids.add(claim["claim_id"])
            if claim["source_id"] not in source_ids:
                raise ValueError("HTTP_RESEARCH_CLAIM_SOURCE_MISSING")
        port = NormalizedLiveResearchPort([copy.deepcopy(capture)])
        interpretation = port.interpret(goal)
        return interpretation

    def _validate_receipt(self, receipt: Dict[str, Any], *, goal: str) -> None:
        required = {
            "receipt_version", "provider_version", "call_id", "research_request_id",
            "endpoint_identity", "endpoint_identity_digest", "goal", "goal_digest",
            "request_body_digest", "response_body_digest", "provider_request_id", "status",
            "attempts", "transient_statuses_seen", "capture", "capture_digest",
            "normalized_evidence_digest", "source_policy", "standing", "receipt_digest",
        }
        missing = sorted(required - set(receipt))
        if missing:
            raise ValueError("HTTP_RESEARCH_RECEIPT_INCOMPLETE:" + ",".join(missing))
        unsigned = {key: value for key, value in receipt.items() if key != "receipt_digest"}
        if digest(unsigned) != receipt["receipt_digest"]:
            raise ValueError("HTTP_RESEARCH_RECEIPT_DIGEST_MISMATCH")
        if receipt["receipt_version"] != HTTP_RESEARCH_RECEIPT_VERSION or receipt["provider_version"] != HTTP_RESEARCH_PROVIDER_VERSION:
            raise ValueError("HTTP_RESEARCH_RECEIPT_VERSION_UNSUPPORTED")
        if receipt["standing"] != HTTP_RESEARCH_RECEIPT_STANDING:
            raise ValueError("HTTP_RESEARCH_RECEIPT_STANDING_INVALID")
        if receipt["research_request_id"] != self.research_request_id:
            raise ValueError("HTTP_RESEARCH_RECEIPT_REQUEST_ID_MISMATCH")
        if receipt["endpoint_identity_digest"] != self.endpoint_identity_digest:
            raise ValueError("HTTP_RESEARCH_RECEIPT_ENDPOINT_MISMATCH")
        if digest(receipt["endpoint_identity"]) != receipt["endpoint_identity_digest"]:
            raise ValueError("HTTP_RESEARCH_RECEIPT_ENDPOINT_DIGEST_MISMATCH")
        if receipt["goal"] != goal or receipt["goal_digest"] != digest(goal):
            raise ValueError("HTTP_RESEARCH_RECEIPT_GOAL_MISMATCH")
        if receipt["call_id"] != self.call_id(goal_digest=receipt["goal_digest"]):
            raise ValueError("HTTP_RESEARCH_RECEIPT_CALL_ID_MISMATCH")
        if digest(receipt["capture"]) != receipt["capture_digest"]:
            raise ValueError("HTTP_RESEARCH_RECEIPT_CAPTURE_DIGEST_MISMATCH")
        interpretation = self._validate_capture(receipt["capture"], goal)
        if receipt["normalized_evidence_digest"] != receipt["capture"]["normalized_evidence_digest"]:
            raise ValueError("HTTP_RESEARCH_RECEIPT_EVIDENCE_DIGEST_MISMATCH")
        if receipt["source_policy"] != receipt["capture"]["source_policy"]:
            raise ValueError("HTTP_RESEARCH_RECEIPT_SOURCE_POLICY_MISMATCH")
        if interpretation["normalized_evidence_digest"] != receipt["normalized_evidence_digest"]:
            raise ValueError("HTTP_RESEARCH_RECEIPT_INTERPRETATION_DRIFT")

    def load_receipt(self, *, goal: str) -> Dict[str, Any]:
        call_id = self.call_id(goal_digest=digest(goal))
        receipt = self.repo.get_object(HTTP_RESEARCH_RECEIPT_KIND, call_id, 1)
        if receipt is None:
            raise ValueError("HTTP_RESEARCH_RECEIPT_NOT_FOUND")
        self._validate_receipt(receipt, goal=goal)
        return receipt

    def capture(self, goal: str, *, inject_crash_after: Optional[str] = None) -> Dict[str, Any]:
        if not goal or not goal.strip():
            raise ValueError("DESIRED_OUTCOME_REQUIRED")
        goal_digest = digest(goal)
        call_id = self.call_id(goal_digest=goal_digest)
        prior = self.repo.get_object(HTTP_RESEARCH_RECEIPT_KIND, call_id, 1)
        if prior is not None:
            self._validate_receipt(prior, goal=goal)
            return copy.deepcopy(prior["capture"])

        request_object = {
            "research_request_id": self.research_request_id,
            "goal": goal,
            "allowed_source_policies": sorted(self.allowed_source_policies),
            "allowed_authorities": None if self.allowed_authorities is None else sorted(self.allowed_authorities),
            "max_sources": MAX_RESEARCH_SOURCES,
            "max_claims": MAX_RESEARCH_CLAIMS,
        }
        request_bytes = canonical_json(request_object).encode("utf-8")
        transient_seen: List[int] = []

        for attempt in range(1, self.max_attempts + 1):
            token = self.credential_provider()
            if token is not None and (not isinstance(token, str) or not token):
                raise ValueError("HTTP_RESEARCH_CREDENTIAL_INVALID")
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
                    raise ValueError(f"HTTP_RESEARCH_TRANSIENT_RETRIES_EXHAUSTED:{status}") from exc
                raise ValueError(f"HTTP_RESEARCH_PERMANENT_STATUS:{status}") from exc
            except (urllib.error.URLError, socket.timeout, TimeoutError) as exc:
                if attempt < self.max_attempts:
                    continue
                raise ValueError("HTTP_RESEARCH_TRANSPORT_RETRIES_EXHAUSTED:" + type(exc).__name__) from exc

            if not (200 <= status <= 299):
                raise ValueError(f"HTTP_RESEARCH_UNEXPECTED_STATUS:{status}")
            if _contains_secret(raw, token):
                raise ValueError("HTTP_RESEARCH_SECRET_ECHO_FORBIDDEN")
            try:
                decoded = raw.decode("utf-8", errors="strict")
                body = json.loads(decoded)
            except (UnicodeDecodeError, json.JSONDecodeError) as exc:
                raise ValueError("HTTP_RESEARCH_RESPONSE_JSON_INVALID") from exc
            if not isinstance(body, dict):
                raise ValueError("HTTP_RESEARCH_RESPONSE_OBJECT_REQUIRED")
            capture = body.get("capture")
            if not isinstance(capture, dict):
                raise ValueError("HTTP_RESEARCH_RESPONSE_CAPTURE_REQUIRED")
            self._validate_capture(capture, goal)
            provider_request_id = body.get("request_id", provider_request_id)
            if provider_request_id is not None and not isinstance(provider_request_id, str):
                raise ValueError("HTTP_RESEARCH_RESPONSE_REQUEST_ID_INVALID")

            receipt = {
                "receipt_version": HTTP_RESEARCH_RECEIPT_VERSION,
                "provider_version": HTTP_RESEARCH_PROVIDER_VERSION,
                "call_id": call_id,
                "research_request_id": self.research_request_id,
                "endpoint_identity": copy.deepcopy(self.endpoint_identity),
                "endpoint_identity_digest": self.endpoint_identity_digest,
                "goal": goal,
                "goal_digest": goal_digest,
                "request_body_digest": digest(request_object),
                "response_body_digest": digest(body),
                "provider_request_id": provider_request_id,
                "status": status,
                "attempts": attempt,
                "transient_statuses_seen": list(transient_seen),
                "capture": copy.deepcopy(capture),
                "capture_digest": digest(capture),
                "normalized_evidence_digest": capture["normalized_evidence_digest"],
                "source_policy": capture["source_policy"],
                "standing": HTTP_RESEARCH_RECEIPT_STANDING,
            }
            receipt["receipt_digest"] = digest(receipt)
            self._validate_receipt(receipt, goal=goal)
            self.repo.put_object(HTTP_RESEARCH_RECEIPT_KIND, call_id, 1, receipt)
            _inject(inject_crash_after, "HTTP_RESEARCH_RECEIPT_STORED")
            return copy.deepcopy(capture)

        raise ValueError("HTTP_RESEARCH_UNREACHABLE_PROVIDER_LOOP")


class FullHTTPProviderBindingService:
    """Uses durable HTTP research + durable HTTP model transport, then preserves IMPL-021 authority."""

    def __init__(self, repo: Repository):
        self.repo = repo

    def acquire_and_bind(
        self,
        *,
        operation_id: str,
        batch_id: str,
        desired_outcome: str,
        sample_count: int,
        research_endpoint: str,
        model_endpoint: str,
        model_id: str,
        research_credential_provider: Optional[Callable[[], Optional[str]]] = None,
        model_credential_provider: Optional[Callable[[], Optional[str]]] = None,
        allowed_source_policies: Optional[Sequence[str]] = None,
        allowed_authorities: Optional[Sequence[str]] = None,
        timeout_seconds: float = 10.0,
        max_attempts: int = 2,
    ) -> Dict[str, Any]:
        research_provider = HTTPJSONResearchProvider(
            repo=self.repo,
            research_request_id=batch_id,
            endpoint=research_endpoint,
            credential_provider=research_credential_provider,
            timeout_seconds=timeout_seconds,
            max_attempts=max_attempts,
            allowed_source_policies=allowed_source_policies,
            allowed_authorities=allowed_authorities,
        )
        model_bound = HTTPProviderMultiSampleBindingService(self.repo).acquire_and_bind(
            operation_id=operation_id,
            batch_id=batch_id,
            desired_outcome=desired_outcome,
            sample_count=sample_count,
            endpoint=model_endpoint,
            model_id=model_id,
            research_capture_provider=lambda goal: research_provider.capture(goal),
            credential_provider=model_credential_provider,
            timeout_seconds=timeout_seconds,
            max_attempts=max_attempts,
        )
        research_receipt = research_provider.load_receipt(goal=desired_outcome)
        packet_service = OpenGoalInputPacketService(self.repo)
        entries: List[Dict[str, Any]] = []
        for packet_id in model_bound["packet_ids"]:
            packet = packet_service.load(packet_id)
            if packet["research_capture_digest"] != research_receipt["capture_digest"]:
                raise ValueError("HTTP_RESEARCH_PACKET_CAPTURE_BINDING_MISMATCH")
            if packet["research_evidence_digest"] != research_receipt["normalized_evidence_digest"]:
                raise ValueError("HTTP_RESEARCH_PACKET_EVIDENCE_BINDING_MISMATCH")
            entries.append({
                "packet_id": packet_id,
                "packet_digest": packet["packet_digest"],
                "research_capture_digest": packet["research_capture_digest"],
                "research_evidence_digest": packet["research_evidence_digest"],
            })
        binding = {
            "binding_version": HTTP_RESEARCH_BINDING_VERSION,
            "batch_id": batch_id,
            "batch_digest": model_bound["batch_digest"],
            "research_call_id": research_receipt["call_id"],
            "research_receipt_digest": research_receipt["receipt_digest"],
            "research_capture_digest": research_receipt["capture_digest"],
            "normalized_evidence_digest": research_receipt["normalized_evidence_digest"],
            "source_policy": research_receipt["source_policy"],
            "model_binding_digest": model_bound["http_model_binding_digest"],
            "entries": entries,
            "standing": HTTP_RESEARCH_BINDING_STANDING,
            "authority_boundary": {
                "research_transport_is_course_authority": False,
                "research_receipt_is_course_verification": False,
                "model_transport_is_selection_authority": False,
                "independent_selection_required": True,
                "learning_engine_remains_mastery_authority": True,
            },
        }
        binding["binding_digest"] = digest(binding)
        self.repo.put_object(HTTP_RESEARCH_BINDING_KIND, batch_id, 1, binding)
        return {
            **model_bound,
            "http_research_provider_version": HTTP_RESEARCH_PROVIDER_VERSION,
            "http_research_binding_version": HTTP_RESEARCH_BINDING_VERSION,
            "http_research_binding_digest": binding["binding_digest"],
            "http_research_receipt_digest": research_receipt["receipt_digest"],
        }

    def load_binding(self, batch_id: str) -> Dict[str, Any]:
        binding = self.repo.get_object(HTTP_RESEARCH_BINDING_KIND, batch_id, 1)
        if binding is None:
            raise ValueError("HTTP_RESEARCH_BINDING_NOT_FOUND")
        unsigned = {key: value for key, value in binding.items() if key != "binding_digest"}
        if digest(unsigned) != binding["binding_digest"]:
            raise ValueError("HTTP_RESEARCH_BINDING_DIGEST_MISMATCH")
        if binding.get("binding_version") != HTTP_RESEARCH_BINDING_VERSION:
            raise ValueError("HTTP_RESEARCH_BINDING_VERSION_UNSUPPORTED")
        if binding.get("standing") != HTTP_RESEARCH_BINDING_STANDING:
            raise ValueError("HTTP_RESEARCH_BINDING_STANDING_INVALID")
        boundary = binding.get("authority_boundary", {})
        if boundary.get("research_transport_is_course_authority") is not False:
            raise ValueError("HTTP_RESEARCH_PROVIDER_AUTHORITY_ESCALATION")
        if boundary.get("research_receipt_is_course_verification") is not False:
            raise ValueError("HTTP_RESEARCH_RECEIPT_SELF_APPROVAL_FORBIDDEN")
        if boundary.get("independent_selection_required") is not True:
            raise ValueError("INDEPENDENT_COURSE_VALIDATION_REQUIRED")
        return binding


def acquire_bind_and_start_full_http_adaptive_entry(
    *,
    repo: Repository,
    operation_id: str,
    batch_id: str,
    request_id: str,
    learner_id: str,
    desired_outcome: str,
    sample_count: int,
    research_endpoint: str,
    model_endpoint: str,
    model_id: str,
    claimed_skill_ids: Sequence[str],
    now: int,
    research_credential_provider: Optional[Callable[[], Optional[str]]] = None,
    model_credential_provider: Optional[Callable[[], Optional[str]]] = None,
    allowed_source_policies: Optional[Sequence[str]] = None,
    allowed_authorities: Optional[Sequence[str]] = None,
    timeout_seconds: float = 10.0,
    max_attempts: int = 2,
) -> Dict[str, Any]:
    bound = FullHTTPProviderBindingService(repo).acquire_and_bind(
        operation_id=operation_id,
        batch_id=batch_id,
        desired_outcome=desired_outcome,
        sample_count=sample_count,
        research_endpoint=research_endpoint,
        model_endpoint=model_endpoint,
        model_id=model_id,
        research_credential_provider=research_credential_provider,
        model_credential_provider=model_credential_provider,
        allowed_source_policies=allowed_source_policies,
        allowed_authorities=allowed_authorities,
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
        "http_research_provider_version": bound["http_research_provider_version"],
        "http_research_binding_version": bound["http_research_binding_version"],
        "http_research_binding_digest": bound["http_research_binding_digest"],
        "http_model_provider_version": bound["http_model_provider_version"],
        "http_model_binding_version": bound["http_model_binding_version"],
        "http_model_binding_digest": bound["http_model_binding_digest"],
        "provider_multi_sample_batch_id": bound["batch_id"],
        "provider_multi_sample_batch_digest": bound["batch_digest"],
    })
    return out
