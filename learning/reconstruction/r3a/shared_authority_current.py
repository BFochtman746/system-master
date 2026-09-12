from __future__ import annotations

import copy
from dataclasses import dataclass
from typing import Any, Dict, Mapping, Protocol


class DependencyUnavailable(RuntimeError):
    pass


class SharedAuthorityBindingError(RuntimeError):
    pass


class SharedAuthorityGateway(Protocol):
    def invoke(
        self,
        *,
        canonical_owner: str,
        contract_id: str,
        contract_version: str,
        interface_id: str,
        operation: str,
        payload: Dict[str, Any],
    ) -> Dict[str, Any]: ...


CURRENT_LOGICAL_SHARED_OWNERS = {
    "I021": "Durable Execution Runtime",
    "I022": "Durable Execution Runtime",
    "I031": "Durable Execution Runtime",
    "I045": "Canonical Data & Persistence",
    "I046": "Transport & Delivery",
    "I050": "Rights, Licensing & Attribution",
    "I052": "Capability Registry & Routing",
    "I075": "Recovery & Reconciliation",
    "I085": "Recovery & Reconciliation",
    "I101": "Rights, Licensing & Attribution",
    "I105": "AI Safety & Model Risk",
    "I106": "Security, Privacy, Secrets & Cryptography",
    "I108": "Transport & Delivery",
    "I109": "Effect / Action Authority",
}

HISTORICAL_OWNER_IDS = frozenset(
    {
        "FOUNDATION-003 + PLATFORM-002",
        "RIGHTS-001 + PLATFORM-008",
        "021J + 021K",
        "PLATFORM-006 / MASTER CORE DEPENDENCY RESOLUTION",
        "ASSURANCE-001 + PLATFORM-009 + 021AB",
        "FOUNDATION-002 + 021N + FOUNDATION-004",
        "021O + 021N/FOUNDATION-002 + FOUNDATION-004 + 021M",
    }
)


@dataclass(frozen=True)
class CurrentContractBinding:
    logical_owner: str
    contract_id: str
    contract_version: str


class CurrentSharedAuthorityAdapter:
    """Fail closed until Foundation supplies an exact current Core contract binding."""

    def __init__(
        self,
        gateway: SharedAuthorityGateway | None,
        *,
        bindings: Mapping[str, CurrentContractBinding] | None = None,
    ):
        self._gateway = gateway
        self._bindings = dict(bindings or {})

    def invoke(
        self,
        *,
        interface_id: str,
        logical_owner: str,
        operation: str,
        payload: Dict[str, Any],
    ) -> Dict[str, Any]:
        expected = CURRENT_LOGICAL_SHARED_OWNERS.get(interface_id)
        if expected is None:
            raise SharedAuthorityBindingError(f"UNKNOWN_SHARED_INTERFACE:{interface_id}")
        if logical_owner in HISTORICAL_OWNER_IDS:
            raise SharedAuthorityBindingError(f"HISTORICAL_OWNER_ID_REJECTED:{logical_owner}")
        if logical_owner != expected:
            raise SharedAuthorityBindingError(
                f"SHARED_AUTHORITY_OWNER_MISMATCH:{logical_owner}:{expected}"
            )

        binding = self._bindings.get(interface_id)
        if binding is None:
            raise DependencyUnavailable(
                f"CURRENT_CONTRACT_ID_UNRESOLVED:{interface_id}:{expected}"
            )
        if binding.logical_owner != expected:
            raise SharedAuthorityBindingError(
                f"BOUND_OWNER_MISMATCH:{binding.logical_owner}:{expected}"
            )
        if not binding.contract_id or not binding.contract_version:
            raise SharedAuthorityBindingError(
                f"INVALID_CURRENT_CONTRACT_BINDING:{interface_id}"
            )
        if binding.contract_id in HISTORICAL_OWNER_IDS:
            raise SharedAuthorityBindingError(
                f"HISTORICAL_CONTRACT_ID_REJECTED:{binding.contract_id}"
            )
        if self._gateway is None:
            raise DependencyUnavailable(f"DEPENDENCY_UNAVAILABLE:{interface_id}:{expected}")

        result = self._gateway.invoke(
            canonical_owner=expected,
            contract_id=binding.contract_id,
            contract_version=binding.contract_version,
            interface_id=interface_id,
            operation=operation,
            payload=copy.deepcopy(payload),
        )
        if not isinstance(result, dict):
            raise SharedAuthorityBindingError("INVALID_SHARED_AUTHORITY_RESPONSE")
        if result.get("canonical_owner") not in (None, expected):
            raise SharedAuthorityBindingError(
                f"SHARED_AUTHORITY_OWNER_MISMATCH:{result.get('canonical_owner')}:{expected}"
            )
        if result.get("contract_id") not in (None, binding.contract_id):
            raise SharedAuthorityBindingError(
                f"SHARED_AUTHORITY_CONTRACT_MISMATCH:{result.get('contract_id')}:{binding.contract_id}"
            )
        if result.get("contract_version") not in (None, binding.contract_version):
            raise SharedAuthorityBindingError(
                f"SHARED_AUTHORITY_VERSION_MISMATCH:{result.get('contract_version')}:{binding.contract_version}"
            )
        return copy.deepcopy(result)
