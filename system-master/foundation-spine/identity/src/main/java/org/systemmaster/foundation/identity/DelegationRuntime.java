package org.systemmaster.foundation.identity;

import static org.systemmaster.foundation.identity.IdentityContracts.*;

import java.io.BufferedReader;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;

/**
 * CORE-IDENTITY-DELEGATION-BUILD-001 reference runtime.
 *
 * Portable authority mechanics only. It does not establish real credential,
 * external-provider, Keel, Effect Authority, A-01, native, or production standing.
 */
public final class DelegationRuntime {
    private DelegationRuntime() {}

    public static final int MAX_CHAIN_DEPTH = 16;
    private static final String ZERO_HASH = "0".repeat(64);

    public enum GrantStanding { ACTIVE, SUSPENDED, REVOKED }
    public enum ReceiptStanding { CURRENT, DENIED, UNKNOWN }

    public record DelegationHop(
            String grantId,
            String grantDigest,
            String delegatorPrincipalId,
            String delegatePrincipalId) {
        public DelegationHop {
            grantId = requireId("grantId", grantId);
            grantDigest = requireDigest("grantDigest", grantDigest);
            delegatorPrincipalId = requireId("delegatorPrincipalId", delegatorPrincipalId);
            delegatePrincipalId = requireId("delegatePrincipalId", delegatePrincipalId);
        }
    }

    public record ActorChain(
            String subjectPrincipalId,
            String currentActorPrincipalId,
            List<DelegationHop> hops,
            String chainDigest) {
        public ActorChain {
            subjectPrincipalId = requireId("subjectPrincipalId", subjectPrincipalId);
            currentActorPrincipalId = requireId("currentActorPrincipalId", currentActorPrincipalId);
            hops = List.copyOf(hops == null ? List.of() : hops);
            if (hops.size() > MAX_CHAIN_DEPTH) {
                throw new IllegalArgumentException("actor chain exceeds hard depth");
            }
            validateChainStructure(subjectPrincipalId, currentActorPrincipalId, hops);
            String computed = digestActorChain(subjectPrincipalId, currentActorPrincipalId, hops);
            chainDigest = requireDigest("chainDigest", chainDigest);
            if (!computed.equals(chainDigest)) {
                throw new IllegalArgumentException("actor chain digest mismatch");
            }
        }

        public static ActorChain create(String subjectPrincipalId, String currentActorPrincipalId, List<DelegationHop> hops) {
            List<DelegationHop> safe = List.copyOf(hops == null ? List.of() : hops);
            return new ActorChain(subjectPrincipalId, currentActorPrincipalId, safe,
                    digestActorChain(subjectPrincipalId, currentActorPrincipalId, safe));
        }
    }

    public record CapabilityGrant(
            String grantId,
            String subjectPrincipalId,
            String delegatorPrincipalId,
            String delegatePrincipalId,
            String parentGrantId,
            String parentGrantDigest,
            String actorChainDigest,
            Set<String> allowedActions,
            Set<String> resourceRefs,
            Set<String> purposeRefs,
            Set<String> audienceRefs,
            Set<String> targetRefs,
            Instant notBefore,
            Instant expiresAt,
            boolean maySubdelegate,
            int remainingSubdelegationDepth,
            long authorityGeneration,
            String keelCeilingRef,
            String keelCeilingDigest,
            List<String> authorityEvidenceRefs,
            Instant issuedAt,
            String grantDigest) {
        public CapabilityGrant {
            grantId = requireId("grantId", grantId);
            subjectPrincipalId = requireId("subjectPrincipalId", subjectPrincipalId);
            delegatorPrincipalId = requireId("delegatorPrincipalId", delegatorPrincipalId);
            delegatePrincipalId = requireId("delegatePrincipalId", delegatePrincipalId);
            if (delegatorPrincipalId.equals(delegatePrincipalId)) {
                throw new IllegalArgumentException("delegator and delegate must differ");
            }
            if (parentGrantId != null) parentGrantId = requireId("parentGrantId", parentGrantId);
            if (parentGrantDigest != null) parentGrantDigest = requireDigest("parentGrantDigest", parentGrantDigest);
            if ((parentGrantId == null) != (parentGrantDigest == null)) {
                throw new IllegalArgumentException("parent id/digest must appear together");
            }
            actorChainDigest = requireDigest("actorChainDigest", actorChainDigest);
            allowedActions = canonicalSet("allowedActions", allowedActions);
            resourceRefs = canonicalSet("resourceRefs", resourceRefs);
            purposeRefs = canonicalSet("purposeRefs", purposeRefs);
            audienceRefs = canonicalSet("audienceRefs", audienceRefs);
            targetRefs = canonicalSet("targetRefs", targetRefs);
            if (allowedActions.isEmpty()) throw new IllegalArgumentException("allowedActions must not be empty");
            notBefore = Objects.requireNonNull(notBefore, "notBefore");
            expiresAt = Objects.requireNonNull(expiresAt, "expiresAt");
            if (!expiresAt.isAfter(notBefore)) throw new IllegalArgumentException("expiresAt must be after notBefore");
            if (remainingSubdelegationDepth < 0 || remainingSubdelegationDepth > MAX_CHAIN_DEPTH) {
                throw new IllegalArgumentException("remainingSubdelegationDepth out of range");
            }
            if (authorityGeneration < 1) throw new IllegalArgumentException("authorityGeneration must be >= 1");
            keelCeilingRef = requireBounded("keelCeilingRef", keelCeilingRef, 512);
            keelCeilingDigest = requireDigest("keelCeilingDigest", keelCeilingDigest);
            authorityEvidenceRefs = immutableRefs(authorityEvidenceRefs);
            if (authorityEvidenceRefs.isEmpty()) throw new IllegalArgumentException("authorityEvidenceRefs must not be empty");
            issuedAt = Objects.requireNonNull(issuedAt, "issuedAt");
            grantDigest = requireDigest("grantDigest", grantDigest);
            String computed = digestGrant(new GrantBody(grantId, subjectPrincipalId, delegatorPrincipalId,
                    delegatePrincipalId, parentGrantId, parentGrantDigest, actorChainDigest, allowedActions,
                    resourceRefs, purposeRefs, audienceRefs, targetRefs, notBefore, expiresAt,
                    maySubdelegate, remainingSubdelegationDepth, authorityGeneration, keelCeilingRef,
                    keelCeilingDigest, authorityEvidenceRefs, issuedAt));
            if (!computed.equals(grantDigest)) throw new IllegalArgumentException("grant digest mismatch");
        }
    }

    public record GrantStandingState(
            String grantId,
            long standingRevision,
            GrantStanding standing,
            long authorityGeneration,
            Instant changedAt,
            String reasonRef,
            List<String> evidenceRefs) {
        public GrantStandingState {
            grantId = requireId("grantId", grantId);
            if (standingRevision < 1) throw new IllegalArgumentException("standingRevision must be >= 1");
            standing = Objects.requireNonNull(standing, "standing");
            if (authorityGeneration < 1) throw new IllegalArgumentException("authorityGeneration must be >= 1");
            changedAt = Objects.requireNonNull(changedAt, "changedAt");
            reasonRef = requireBounded("reasonRef", reasonRef, 512);
            evidenceRefs = immutableRefs(evidenceRefs);
        }
    }

    public record DelegationCeilingReceipt(
            String receiptRef,
            String keelCeilingRef,
            String keelCeilingDigest,
            String requestDigest,
            ReceiptStanding standing,
            Instant evaluatedAt,
            Instant expiresAt) {
        public DelegationCeilingReceipt {
            receiptRef = requireBounded("receiptRef", receiptRef, 512);
            keelCeilingRef = requireBounded("keelCeilingRef", keelCeilingRef, 512);
            keelCeilingDigest = requireDigest("keelCeilingDigest", keelCeilingDigest);
            requestDigest = requireDigest("requestDigest", requestDigest);
            standing = Objects.requireNonNull(standing, "standing");
            evaluatedAt = Objects.requireNonNull(evaluatedAt, "evaluatedAt");
            expiresAt = Objects.requireNonNull(expiresAt, "expiresAt");
            if (!expiresAt.isAfter(evaluatedAt)) throw new IllegalArgumentException("receipt expiry invalid");
        }
    }

    public record ExternalAuthorizationReceipt(
            String receiptRef,
            String requestDigest,
            ReceiptStanding standing,
            Instant evaluatedAt,
            Instant expiresAt) {
        public ExternalAuthorizationReceipt {
            receiptRef = requireBounded("receiptRef", receiptRef, 512);
            requestDigest = requireDigest("requestDigest", requestDigest);
            standing = Objects.requireNonNull(standing, "standing");
            evaluatedAt = Objects.requireNonNull(evaluatedAt, "evaluatedAt");
            expiresAt = Objects.requireNonNull(expiresAt, "expiresAt");
            if (!expiresAt.isAfter(evaluatedAt)) throw new IllegalArgumentException("receipt expiry invalid");
        }
    }

    public record GrantBody(
            String grantId,
            String subjectPrincipalId,
            String delegatorPrincipalId,
            String delegatePrincipalId,
            String parentGrantId,
            String parentGrantDigest,
            String actorChainDigest,
            Set<String> allowedActions,
            Set<String> resourceRefs,
            Set<String> purposeRefs,
            Set<String> audienceRefs,
            Set<String> targetRefs,
            Instant notBefore,
            Instant expiresAt,
            boolean maySubdelegate,
            int remainingSubdelegationDepth,
            long authorityGeneration,
            String keelCeilingRef,
            String keelCeilingDigest,
            List<String> authorityEvidenceRefs,
            Instant issuedAt) {
        public GrantBody {
            grantId = requireId("grantId", grantId);
            subjectPrincipalId = requireId("subjectPrincipalId", subjectPrincipalId);
            delegatorPrincipalId = requireId("delegatorPrincipalId", delegatorPrincipalId);
            delegatePrincipalId = requireId("delegatePrincipalId", delegatePrincipalId);
            if (parentGrantId != null) parentGrantId = requireId("parentGrantId", parentGrantId);
            if (parentGrantDigest != null) parentGrantDigest = requireDigest("parentGrantDigest", parentGrantDigest);
            actorChainDigest = requireDigest("actorChainDigest", actorChainDigest);
            allowedActions = canonicalSet("allowedActions", allowedActions);
            resourceRefs = canonicalSet("resourceRefs", resourceRefs);
            purposeRefs = canonicalSet("purposeRefs", purposeRefs);
            audienceRefs = canonicalSet("audienceRefs", audienceRefs);
            targetRefs = canonicalSet("targetRefs", targetRefs);
            notBefore = Objects.requireNonNull(notBefore, "notBefore");
            expiresAt = Objects.requireNonNull(expiresAt, "expiresAt");
            keelCeilingRef = requireBounded("keelCeilingRef", keelCeilingRef, 512);
            keelCeilingDigest = requireDigest("keelCeilingDigest", keelCeilingDigest);
            authorityEvidenceRefs = immutableRefs(authorityEvidenceRefs);
            issuedAt = Objects.requireNonNull(issuedAt, "issuedAt");
        }
    }

    public record IssueGrantRequest(
            MutationContext context,
            GrantBody body,
            ActorChain actorChain,
            String externalAuthorizationReceiptRef,
            String keelCeilingReceiptRef,
            long expectedAuthorityGeneration) {
        public IssueGrantRequest {
            context = Objects.requireNonNull(context, "context");
            body = Objects.requireNonNull(body, "body");
            actorChain = Objects.requireNonNull(actorChain, "actorChain");
            externalAuthorizationReceiptRef = requireBounded("externalAuthorizationReceiptRef", externalAuthorizationReceiptRef, 512);
            keelCeilingReceiptRef = requireBounded("keelCeilingReceiptRef", keelCeilingReceiptRef, 512);
            if (expectedAuthorityGeneration < 1) throw new IllegalArgumentException("expectedAuthorityGeneration must be >= 1");
        }
    }

    public record StandingChangeRequest(
            MutationContext context,
            String grantId,
            long expectedStandingRevision,
            String reasonRef,
            List<String> evidenceRefs) {
        public StandingChangeRequest {
            context = Objects.requireNonNull(context, "context");
            grantId = requireId("grantId", grantId);
            if (expectedStandingRevision < 1) throw new IllegalArgumentException("expectedStandingRevision must be >= 1");
            reasonRef = requireBounded("reasonRef", reasonRef, 512);
            evidenceRefs = immutableRefs(evidenceRefs);
        }
    }

    public record AdvanceGenerationRequest(
            MutationContext context,
            long expectedGeneration,
            String reasonRef,
            List<String> evidenceRefs) {
        public AdvanceGenerationRequest {
            context = Objects.requireNonNull(context, "context");
            if (expectedGeneration < 1) throw new IllegalArgumentException("expectedGeneration must be >= 1");
            reasonRef = requireBounded("reasonRef", reasonRef, 512);
            evidenceRefs = immutableRefs(evidenceRefs);
        }
    }

    public record CapabilityUseRequest(
            String grantId,
            String grantDigest,
            ActorChain actorChain,
            String presentedCurrentActorPrincipalId,
            String action,
            String resourceRef,
            String purposeRef,
            String audienceRef,
            String targetRef,
            Instant now) {
        public CapabilityUseRequest {
            grantId = requireId("grantId", grantId);
            grantDigest = requireDigest("grantDigest", grantDigest);
            actorChain = Objects.requireNonNull(actorChain, "actorChain");
            presentedCurrentActorPrincipalId = requireId("presentedCurrentActorPrincipalId", presentedCurrentActorPrincipalId);
            action = requireBounded("action", action, 512);
            resourceRef = requireBounded("resourceRef", resourceRef, 512);
            purposeRef = requireBounded("purposeRef", purposeRef, 512);
            audienceRef = requireBounded("audienceRef", audienceRef, 512);
            targetRef = requireBounded("targetRef", targetRef, 512);
            now = Objects.requireNonNull(now, "now");
        }
    }

    public record CapabilityValidationReceipt(
            String grantId,
            String grantDigest,
            String actorChainDigest,
            long authorityGeneration,
            Instant evaluatedAt,
            String validationDigest) {}

    public interface PrincipalAuthority {
        Principal getPrincipal(String principalId) throws IOException;
    }

    public interface ReceiptAuthority {
        ExternalAuthorizationReceipt externalAuthorization(String receiptRef) throws IOException;
        DelegationCeilingReceipt delegationCeiling(String receiptRef) throws IOException;
    }

    public interface MutationAuthorizer {
        void authorize(MutationContext context, String action, String targetRef);
    }

    public static final class RegistryPrincipalAuthority implements PrincipalAuthority {
        private final PrincipalRegistry registry;
        public RegistryPrincipalAuthority(PrincipalRegistry registry) {
            this.registry = Objects.requireNonNull(registry, "registry");
        }
        @Override
        public Principal getPrincipal(String principalId) throws IOException {
            return registry.getPrincipal(principalId);
        }
    }

    public static final class DelegationService {
        private final DelegationJournalStore store;
        private final PrincipalAuthority principals;
        private final ReceiptAuthority receipts;
        private final MutationAuthorizer authorizer;

        public DelegationService(
                DelegationJournalStore store,
                PrincipalAuthority principals,
                ReceiptAuthority receipts,
                MutationAuthorizer authorizer) {
            this.store = Objects.requireNonNull(store, "store");
            this.principals = Objects.requireNonNull(principals, "principals");
            this.receipts = Objects.requireNonNull(receipts, "receipts");
            this.authorizer = Objects.requireNonNull(authorizer, "authorizer");
        }

        public CapabilityGrant issue(IssueGrantRequest request) throws IOException {
            Objects.requireNonNull(request, "request");
            authorizer.authorize(request.context(), "IssueCapabilityGrant", request.body().grantId());
            String requestHash = issueRequestHash(request);
            DelegationState snapshot = store.load();
            CommandMemo prior = snapshot.commands().get(request.context().commandId());
            if (prior != null) return replayIssue(prior, requestHash, snapshot);

            GrantBody body = request.body();
            requireCurrentPrincipal(body.subjectPrincipalId());
            requireCurrentPrincipal(body.delegatorPrincipalId());
            requireCurrentPrincipal(body.delegatePrincipalId());
            if (!request.context().actorPrincipalRef().equals(body.delegatorPrincipalId())) {
                throw new IdentityException(ErrorCode.DENIED, "caller actor is not grant delegator");
            }
            validateActorChain(snapshot, request.actorChain(), body.delegatorPrincipalId(), body.subjectPrincipalId());
            if (!request.actorChain().chainDigest().equals(body.actorChainDigest())) {
                throw new IdentityException(ErrorCode.DENIED, "actor-chain binding mismatch");
            }
            if (snapshot.authorityGeneration() != request.expectedAuthorityGeneration()
                    || body.authorityGeneration() != snapshot.authorityGeneration()) {
                throw new IdentityException(ErrorCode.STALE_BASE, "authority generation changed");
            }
            String proposedDigest = digestGrant(body);
            validateReceipts(request, proposedDigest, body);

            if (body.parentGrantId() == null) {
                if (!body.subjectPrincipalId().equals(body.delegatorPrincipalId())) {
                    throw new IdentityException(ErrorCode.DENIED, "root grant delegator must be subject principal");
                }
            } else {
                validateChild(snapshot, body, request.actorChain());
            }
            CapabilityGrant grant = toGrant(body, proposedDigest);
            store.appendGrantIssued(request.context().commandId(), requestHash, grant);
            return store.load().grants().get(grant.grantId());
        }

        public GrantStandingState suspend(StandingChangeRequest request) throws IOException {
            return changeStanding(request, GrantStanding.SUSPENDED);
        }

        public GrantStandingState revoke(StandingChangeRequest request) throws IOException {
            return changeStanding(request, GrantStanding.REVOKED);
        }

        public long advanceAuthorityGeneration(AdvanceGenerationRequest request) throws IOException {
            Objects.requireNonNull(request, "request");
            authorizer.authorize(request.context(), "AdvanceAuthorityGeneration", "delegation-authority");
            String requestHash = sha256("ADVANCE|" + request.expectedGeneration() + "|" + request.reasonRef()
                    + "|" + String.join(",", request.evidenceRefs()));
            DelegationState state = store.load();
            CommandMemo prior = state.commands().get(request.context().commandId());
            if (prior != null) {
                requireCommandReplay(prior, requestHash, "GENERATION");
                return Long.parseLong(prior.resultId());
            }
            if (state.authorityGeneration() != request.expectedGeneration()) {
                throw new IdentityException(ErrorCode.STALE_BASE, "authority generation changed");
            }
            long next = state.authorityGeneration() + 1;
            store.appendGenerationAdvanced(request.context().commandId(), requestHash, next,
                    request.reasonRef(), request.evidenceRefs());
            return next;
        }

        public CapabilityGrant getGrant(String grantId) throws IOException {
            CapabilityGrant grant = store.load().grants().get(requireId("grantId", grantId));
            if (grant == null) throw new IdentityException(ErrorCode.NOT_FOUND, "grant not found");
            return grant;
        }

        public GrantStandingState getStanding(String grantId) throws IOException {
            GrantStandingState standing = store.load().standings().get(requireId("grantId", grantId));
            if (standing == null) throw new IdentityException(ErrorCode.NOT_FOUND, "grant not found");
            return standing;
        }

        public CapabilityValidationReceipt validateUse(CapabilityUseRequest request) throws IOException {
            DelegationState state = store.load();
            CapabilityGrant grant = state.grants().get(request.grantId());
            if (grant == null) throw new IdentityException(ErrorCode.NOT_FOUND, "grant not found");
            if (!grant.grantDigest().equals(request.grantDigest())) {
                throw new IdentityException(ErrorCode.STALE_BASE, "grant digest mismatch");
            }
            GrantStandingState standing = state.standings().get(grant.grantId());
            requireUsable(grant, standing, state, request.now());
            requireCurrentPrincipal(request.presentedCurrentActorPrincipalId());
            if (!request.presentedCurrentActorPrincipalId().equals(request.actorChain().currentActorPrincipalId())) {
                throw new IdentityException(ErrorCode.DENIED, "presented actor does not match chain");
            }
            validateActorChain(state, request.actorChain(), grant.delegatePrincipalId(), grant.subjectPrincipalId());
            if (!request.actorChain().chainDigest().equals(extendedChainForGrant(state, grant).chainDigest())) {
                throw new IdentityException(ErrorCode.DENIED, "actor chain is not canonical for grant");
            }
            requireContains(grant.allowedActions(), request.action(), "action");
            requireContains(grant.resourceRefs(), request.resourceRef(), "resource");
            requireContains(grant.purposeRefs(), request.purposeRef(), "purpose");
            requireContains(grant.audienceRefs(), request.audienceRef(), "audience");
            requireContains(grant.targetRefs(), request.targetRef(), "target");
            String digest = sha256("SM-CAPABILITY-VALIDATION-V1|" + grant.grantId() + "|" + grant.grantDigest()
                    + "|" + request.actorChain().chainDigest() + "|" + state.authorityGeneration()
                    + "|" + request.now());
            return new CapabilityValidationReceipt(grant.grantId(), grant.grantDigest(),
                    request.actorChain().chainDigest(), state.authorityGeneration(), request.now(), digest);
        }

        private GrantStandingState changeStanding(StandingChangeRequest request, GrantStanding target) throws IOException {
            Objects.requireNonNull(request, "request");
            authorizer.authorize(request.context(), target == GrantStanding.REVOKED
                    ? "RevokeCapabilityGrant" : "SuspendCapabilityGrant", request.grantId());
            String requestHash = sha256("STANDING|" + target + "|" + request.grantId() + "|"
                    + request.expectedStandingRevision() + "|" + request.reasonRef() + "|"
                    + String.join(",", request.evidenceRefs()));
            DelegationState state = store.load();
            CommandMemo prior = state.commands().get(request.context().commandId());
            if (prior != null) {
                requireCommandReplay(prior, requestHash, "STANDING");
                GrantStandingState existing = state.standings().get(prior.resultId());
                if (existing == null) throw new IdentityException(ErrorCode.CORRUPT_STATE, "standing replay result absent");
                return existing;
            }
            GrantStandingState current = state.standings().get(request.grantId());
            if (current == null) throw new IdentityException(ErrorCode.NOT_FOUND, "grant not found");
            if (current.standingRevision() != request.expectedStandingRevision()) {
                throw new IdentityException(ErrorCode.STALE_BASE, "standing revision changed");
            }
            if (current.standing() == GrantStanding.REVOKED) {
                throw new IdentityException(ErrorCode.REVOKED, "revoked grant is terminal");
            }
            if (target == GrantStanding.SUSPENDED && current.standing() == GrantStanding.SUSPENDED) {
                throw new IdentityException(ErrorCode.CONFLICT, "grant already suspended");
            }
            GrantStandingState next = new GrantStandingState(request.grantId(), current.standingRevision() + 1,
                    target, state.authorityGeneration(), Instant.now(), request.reasonRef(), request.evidenceRefs());
            store.appendStandingChanged(request.context().commandId(), requestHash, next);
            return store.load().standings().get(request.grantId());
        }

        private CapabilityGrant replayIssue(CommandMemo prior, String requestHash, DelegationState state) {
            requireCommandReplay(prior, requestHash, "GRANT");
            CapabilityGrant grant = state.grants().get(prior.resultId());
            if (grant == null) throw new IdentityException(ErrorCode.CORRUPT_STATE, "idempotent grant result absent");
            return grant;
        }

        private void validateReceipts(IssueGrantRequest request, String proposedDigest, GrantBody body) throws IOException {
            ExternalAuthorizationReceipt external = receipts.externalAuthorization(request.externalAuthorizationReceiptRef());
            DelegationCeilingReceipt ceiling = receipts.delegationCeiling(request.keelCeilingReceiptRef());
            Instant now = body.issuedAt();
            requireCurrentReceipt(external.standing(), external.expiresAt(), now, "external authorization");
            requireCurrentReceipt(ceiling.standing(), ceiling.expiresAt(), now, "delegation ceiling");
            if (!external.requestDigest().equals(proposedDigest) || !ceiling.requestDigest().equals(proposedDigest)) {
                throw new IdentityException(ErrorCode.STALE_BASE, "receipt request binding mismatch");
            }
            if (!ceiling.keelCeilingRef().equals(body.keelCeilingRef())
                    || !ceiling.keelCeilingDigest().equals(body.keelCeilingDigest())) {
                throw new IdentityException(ErrorCode.STALE_BASE, "Keel ceiling binding mismatch");
            }
        }

        private void validateChild(DelegationState state, GrantBody child, ActorChain actorChain) throws IOException {
            CapabilityGrant parent = state.grants().get(child.parentGrantId());
            if (parent == null) throw new IdentityException(ErrorCode.NOT_FOUND, "parent grant not found");
            if (!parent.grantDigest().equals(child.parentGrantDigest())) {
                throw new IdentityException(ErrorCode.STALE_BASE, "parent grant digest changed");
            }
            GrantStandingState parentStanding = state.standings().get(parent.grantId());
            requireUsable(parent, parentStanding, state, child.issuedAt());
            if (!parent.delegatePrincipalId().equals(child.delegatorPrincipalId())) deny("parent delegate mismatch");
            if (!parent.subjectPrincipalId().equals(child.subjectPrincipalId())) deny("subject changed inside lineage");
            if (!parent.maySubdelegate()) deny("parent forbids subdelegation");
            if (parent.remainingSubdelegationDepth() <= 0) deny("parent depth exhausted");
            if (child.remainingSubdelegationDepth() > parent.remainingSubdelegationDepth() - 1) deny("subdelegation depth widened");
            subset(child.allowedActions(), parent.allowedActions(), "actions widened");
            subset(child.resourceRefs(), parent.resourceRefs(), "resources widened");
            subset(child.purposeRefs(), parent.purposeRefs(), "purposes widened");
            subset(child.audienceRefs(), parent.audienceRefs(), "audiences widened");
            subset(child.targetRefs(), parent.targetRefs(), "targets widened");
            if (child.notBefore().isBefore(parent.notBefore())) deny("child starts before parent");
            if (child.expiresAt().isAfter(parent.expiresAt())) deny("child expires after parent");
            if (child.authorityGeneration() != parent.authorityGeneration()) stale("parent generation mismatch");
            if (!child.keelCeilingRef().equals(parent.keelCeilingRef())
                    || !child.keelCeilingDigest().equals(parent.keelCeilingDigest())) stale("Keel ceiling changed");
            ActorChain expectedParentChain = extendedChainForGrant(state, parent);
            if (!expectedParentChain.chainDigest().equals(actorChain.chainDigest())) {
                deny("child actor chain is not canonical parent chain");
            }
            if (actorChain.hops().size() >= MAX_CHAIN_DEPTH) deny("hard actor-chain depth exceeded");
        }

        private ActorChain extendedChainForGrant(DelegationState state, CapabilityGrant grant) {
            if (grant.parentGrantId() == null) {
                DelegationHop hop = new DelegationHop(grant.grantId(), grant.grantDigest(),
                        grant.delegatorPrincipalId(), grant.delegatePrincipalId());
                return ActorChain.create(grant.subjectPrincipalId(), grant.delegatePrincipalId(), List.of(hop));
            }
            CapabilityGrant parent = state.grants().get(grant.parentGrantId());
            if (parent == null) throw new IdentityException(ErrorCode.CORRUPT_STATE, "parent missing during chain reconstruction");
            ActorChain parentChain = extendedChainForGrant(state, parent);
            List<DelegationHop> hops = new ArrayList<>(parentChain.hops());
            hops.add(new DelegationHop(grant.grantId(), grant.grantDigest(),
                    grant.delegatorPrincipalId(), grant.delegatePrincipalId()));
            return ActorChain.create(grant.subjectPrincipalId(), grant.delegatePrincipalId(), hops);
        }

        private void validateActorChain(DelegationState state, ActorChain chain,
                String expectedCurrentActor, String expectedSubject) throws IOException {
            if (!chain.currentActorPrincipalId().equals(expectedCurrentActor)) deny("actor chain current actor mismatch");
            if (!chain.subjectPrincipalId().equals(expectedSubject)) deny("actor chain subject mismatch");
            requireCurrentPrincipal(chain.currentActorPrincipalId());
            requireCurrentPrincipal(chain.subjectPrincipalId());
            for (DelegationHop hop : chain.hops()) {
                CapabilityGrant grant = state.grants().get(hop.grantId());
                if (grant == null) throw new IdentityException(ErrorCode.NOT_FOUND, "actor-chain grant not found");
                if (!grant.grantDigest().equals(hop.grantDigest())) stale("actor-chain grant digest mismatch");
                if (!grant.delegatorPrincipalId().equals(hop.delegatorPrincipalId())
                        || !grant.delegatePrincipalId().equals(hop.delegatePrincipalId())) deny("actor-chain grant identity mismatch");
                GrantStandingState standing = state.standings().get(grant.grantId());
                requireUsable(grant, standing, state, Instant.now());
            }
        }

        private void requireUsable(CapabilityGrant grant, GrantStandingState standing,
                DelegationState state, Instant now) throws IOException {
            if (standing == null) throw new IdentityException(ErrorCode.CORRUPT_STATE, "grant standing absent");
            if (standing.standing() == GrantStanding.REVOKED) throw new IdentityException(ErrorCode.REVOKED, "grant revoked");
            if (standing.standing() == GrantStanding.SUSPENDED) throw new IdentityException(ErrorCode.DENIED, "grant suspended");
            if (grant.authorityGeneration() != state.authorityGeneration()) throw new IdentityException(ErrorCode.REVOKED, "grant generation stale");
            if (now.isBefore(grant.notBefore())) throw new IdentityException(ErrorCode.EXPIRED, "grant not yet valid");
            if (!now.isBefore(grant.expiresAt())) throw new IdentityException(ErrorCode.EXPIRED, "grant expired");
            requireCurrentPrincipal(grant.subjectPrincipalId());
            requireCurrentPrincipal(grant.delegatorPrincipalId());
            requireCurrentPrincipal(grant.delegatePrincipalId());
            if (grant.parentGrantId() != null) {
                CapabilityGrant parent = state.grants().get(grant.parentGrantId());
                if (parent == null) throw new IdentityException(ErrorCode.CORRUPT_STATE, "parent missing");
                requireUsable(parent, state.standings().get(parent.grantId()), state, now);
            }
        }

        private void requireCurrentPrincipal(String principalId) throws IOException {
            Principal principal = principals.getPrincipal(principalId);
            if (principal == null) throw new IdentityException(ErrorCode.NOT_FOUND, "principal not found");
            switch (principal.status()) {
                case ENROLLED, ACTIVE -> { }
                case QUARANTINED -> throw new IdentityException(ErrorCode.QUARANTINED, "principal quarantined");
                case DISABLED, RETIRED, SUSPENDED, CANDIDATE -> throw new IdentityException(ErrorCode.DENIED, "principal not current for delegation");
            }
        }
    }

    public static final class DelegationJournalStore {
        private final Path journal;
        private final Path lockPath;

        public DelegationJournalStore(Path directory) throws IOException {
            Objects.requireNonNull(directory, "directory");
            Files.createDirectories(directory);
            journal = directory.resolve("delegation.journal");
            lockPath = directory.resolve("delegation.lock");
            if (!Files.exists(journal)) Files.createFile(journal);
        }

        public DelegationState load() throws IOException {
            return replay(journal);
        }

        public void appendGrantIssued(String commandId, String requestHash, CapabilityGrant grant) throws IOException {
            append("GRANT_ISSUED", commandId, requestHash, encodeGrant(grant));
        }

        public void appendStandingChanged(String commandId, String requestHash, GrantStandingState standing) throws IOException {
            append(standing.standing() == GrantStanding.REVOKED ? "GRANT_REVOKED" : "GRANT_SUSPENDED",
                    commandId, requestHash, encodeStanding(standing));
        }

        public void appendGenerationAdvanced(String commandId, String requestHash, long generation,
                String reasonRef, List<String> evidenceRefs) throws IOException {
            append("AUTHORITY_GENERATION_ADVANCED", commandId, requestHash,
                    encodeList(List.of(Long.toString(generation), reasonRef, String.join("\u001e", evidenceRefs))));
        }

        private void append(String type, String commandId, String requestHash, String payload) throws IOException {
            requireId("commandId", commandId);
            requireDigest("requestHash", requestHash);
            try (FileChannel lockChannel = FileChannel.open(lockPath,
                    StandardOpenOption.CREATE, StandardOpenOption.WRITE);
                 FileLock ignored = lockChannel.lock()) {
                DelegationState current = replay(journal);
                CommandMemo memo = current.commands().get(commandId);
                if (memo != null) {
                    requireCommandReplay(memo, requestHash, expectedResultType(type));
                    return;
                }
                long sequence = current.sequence() + 1;
                String previousHash = current.lastHash();
                String preimage = sequence + "\t" + previousHash + "\t" + type + "\t" + commandId
                        + "\t" + requestHash + "\t" + payload;
                String recordHash = sha256(preimage);
                String line = preimage + "\t" + recordHash + "\n";
                try (FileChannel out = FileChannel.open(journal,
                        StandardOpenOption.WRITE, StandardOpenOption.APPEND)) {
                    ByteBuffer bytes = StandardCharsets.UTF_8.encode(line);
                    while (bytes.hasRemaining()) out.write(bytes);
                    out.force(true);
                }
            }
        }

        static DelegationState replay(Path file) throws IOException {
            Map<String, CapabilityGrant> grants = new LinkedHashMap<>();
            Map<String, GrantStandingState> standings = new LinkedHashMap<>();
            Map<String, CommandMemo> commands = new LinkedHashMap<>();
            long generation = 1;
            long sequence = 0;
            String lastHash = ZERO_HASH;
            try (BufferedReader reader = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
                String line;
                while ((line = reader.readLine()) != null) {
                    if (line.isEmpty()) throw corrupt("blank journal record");
                    String[] parts = line.split("\\t", -1);
                    if (parts.length != 7) throw corrupt("truncated/malformed journal record");
                    long seq;
                    try { seq = Long.parseLong(parts[0]); }
                    catch (NumberFormatException ex) { throw corrupt("invalid journal sequence"); }
                    if (seq != sequence + 1) throw corrupt("non-contiguous journal sequence");
                    if (!parts[1].equals(lastHash)) throw corrupt("journal previous-hash mismatch");
                    String preimage = String.join("\t", parts[0], parts[1], parts[2], parts[3], parts[4], parts[5]);
                    if (!sha256(preimage).equals(parts[6])) throw corrupt("journal record hash mismatch");
                    if (commands.containsKey(parts[3])) throw corrupt("duplicate command id in journal");
                    String resultType;
                    String resultId;
                    switch (parts[2]) {
                        case "GRANT_ISSUED" -> {
                            CapabilityGrant grant = decodeGrant(parts[5]);
                            if (grants.putIfAbsent(grant.grantId(), grant) != null) throw corrupt("duplicate grant id");
                            standings.put(grant.grantId(), new GrantStandingState(grant.grantId(), 1,
                                    GrantStanding.ACTIVE, grant.authorityGeneration(), grant.issuedAt(),
                                    "ref:delegation/issued", grant.authorityEvidenceRefs()));
                            resultType = "GRANT";
                            resultId = grant.grantId();
                        }
                        case "GRANT_SUSPENDED", "GRANT_REVOKED" -> {
                            GrantStandingState standing = decodeStanding(parts[5]);
                            GrantStandingState prior = standings.get(standing.grantId());
                            if (prior == null || standing.standingRevision() != prior.standingRevision() + 1) {
                                throw corrupt("standing revision discontinuity");
                            }
                            if (prior.standing() == GrantStanding.REVOKED) throw corrupt("revoked standing mutated");
                            standings.put(standing.grantId(), standing);
                            resultType = "STANDING";
                            resultId = standing.grantId();
                        }
                        case "AUTHORITY_GENERATION_ADVANCED" -> {
                            List<String> fields = decodeList(parts[5]);
                            if (fields.size() != 3) throw corrupt("generation payload malformed");
                            long next;
                            try { next = Long.parseLong(fields.get(0)); }
                            catch (NumberFormatException ex) { throw corrupt("generation malformed"); }
                            if (next != generation + 1) throw corrupt("generation discontinuity");
                            generation = next;
                            resultType = "GENERATION";
                            resultId = Long.toString(next);
                        }
                        default -> throw corrupt("unknown journal event type");
                    }
                    commands.put(parts[3], new CommandMemo(parts[4], resultType, resultId));
                    sequence = seq;
                    lastHash = parts[6];
                }
            }
            return new DelegationState(Map.copyOf(grants), Map.copyOf(standings), Map.copyOf(commands),
                    generation, sequence, lastHash);
        }
    }

    public record DelegationState(
            Map<String, CapabilityGrant> grants,
            Map<String, GrantStandingState> standings,
            Map<String, CommandMemo> commands,
            long authorityGeneration,
            long sequence,
            String lastHash) {}

    public record CommandMemo(String requestHash, String resultType, String resultId) {}

    public static CapabilityGrant toGrant(GrantBody body, String digest) {
        return new CapabilityGrant(body.grantId(), body.subjectPrincipalId(), body.delegatorPrincipalId(),
                body.delegatePrincipalId(), body.parentGrantId(), body.parentGrantDigest(), body.actorChainDigest(),
                body.allowedActions(), body.resourceRefs(), body.purposeRefs(), body.audienceRefs(), body.targetRefs(),
                body.notBefore(), body.expiresAt(), body.maySubdelegate(), body.remainingSubdelegationDepth(),
                body.authorityGeneration(), body.keelCeilingRef(), body.keelCeilingDigest(),
                body.authorityEvidenceRefs(), body.issuedAt(), digest);
    }

    public static String digestGrant(GrantBody body) {
        return sha256("SM-CAPABILITY-GRANT-V1|" + String.join("|",
                body.grantId(), body.subjectPrincipalId(), body.delegatorPrincipalId(), body.delegatePrincipalId(),
                nullToEmpty(body.parentGrantId()), nullToEmpty(body.parentGrantDigest()), body.actorChainDigest(),
                joinSet(body.allowedActions()), joinSet(body.resourceRefs()), joinSet(body.purposeRefs()),
                joinSet(body.audienceRefs()), joinSet(body.targetRefs()), body.notBefore().toString(),
                body.expiresAt().toString(), Boolean.toString(body.maySubdelegate()),
                Integer.toString(body.remainingSubdelegationDepth()), Long.toString(body.authorityGeneration()),
                body.keelCeilingRef(), body.keelCeilingDigest(), String.join("\u001e", body.authorityEvidenceRefs()),
                body.issuedAt().toString()));
    }

    public static String digestActorChain(String subject, String actor, List<DelegationHop> hops) {
        StringBuilder rows = new StringBuilder();
        for (DelegationHop hop : hops) {
            if (rows.length() > 0) rows.append('\u001e');
            rows.append(hop.grantId()).append('\u001f').append(hop.grantDigest()).append('\u001f')
                    .append(hop.delegatorPrincipalId()).append('\u001f').append(hop.delegatePrincipalId());
        }
        return sha256("SM-ACTOR-CHAIN-V1|subject=" + subject + "|actor=" + actor + "|hops=" + rows);
    }

    public static String issueRequestHash(IssueGrantRequest request) {
        return sha256("ISSUE|" + digestGrant(request.body()) + "|" + request.actorChain().chainDigest()
                + "|" + request.externalAuthorizationReceiptRef() + "|" + request.keelCeilingReceiptRef()
                + "|" + request.expectedAuthorityGeneration());
    }

    public static String sha256(String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return bytesToHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 unavailable", ex);
        }
    }

    private static void validateChainStructure(String subject, String actor, List<DelegationHop> hops) {
        if (hops.isEmpty()) {
            if (!subject.equals(actor)) throw new IllegalArgumentException("empty chain requires subject == actor");
            return;
        }
        if (!hops.get(0).delegatorPrincipalId().equals(subject)) {
            throw new IllegalArgumentException("first hop does not begin at subject");
        }
        Set<String> principals = new HashSet<>();
        principals.add(subject);
        for (int i = 0; i < hops.size(); i++) {
            DelegationHop hop = hops.get(i);
            if (!principals.add(hop.delegatePrincipalId())) throw new IllegalArgumentException("actor-chain cycle");
            if (i > 0 && !hops.get(i - 1).delegatePrincipalId().equals(hop.delegatorPrincipalId())) {
                throw new IllegalArgumentException("non-contiguous actor chain");
            }
        }
        if (!hops.get(hops.size() - 1).delegatePrincipalId().equals(actor)) {
            throw new IllegalArgumentException("final hop does not end at actor");
        }
    }

    private static Set<String> canonicalSet(String name, Set<String> input) {
        TreeSet<String> sorted = new TreeSet<>();
        if (input != null) {
            for (String item : input) {
                if (item == null || item.isBlank() || item.length() > 512 || item.contains("*")) {
                    throw new IllegalArgumentException(name + " contains invalid scope item");
                }
                sorted.add(item);
            }
        }
        return Collections.unmodifiableSet(sorted);
    }

    private static String joinSet(Set<String> values) {
        return String.join("\u001e", new TreeSet<>(values));
    }

    private static String requireDigest(String name, String value) {
        Objects.requireNonNull(value, name);
        if (!value.matches("[0-9a-f]{64}")) throw new IllegalArgumentException(name + " invalid");
        return value;
    }

    private static String nullToEmpty(String value) { return value == null ? "" : value; }

    private static String encodeGrant(CapabilityGrant grant) {
        return encodeList(List.of(
                grant.grantId(), grant.subjectPrincipalId(), grant.delegatorPrincipalId(), grant.delegatePrincipalId(),
                nullToEmpty(grant.parentGrantId()), nullToEmpty(grant.parentGrantDigest()), grant.actorChainDigest(),
                joinSet(grant.allowedActions()), joinSet(grant.resourceRefs()), joinSet(grant.purposeRefs()),
                joinSet(grant.audienceRefs()), joinSet(grant.targetRefs()), grant.notBefore().toString(),
                grant.expiresAt().toString(), Boolean.toString(grant.maySubdelegate()),
                Integer.toString(grant.remainingSubdelegationDepth()), Long.toString(grant.authorityGeneration()),
                grant.keelCeilingRef(), grant.keelCeilingDigest(), String.join("\u001e", grant.authorityEvidenceRefs()),
                grant.issuedAt().toString(), grant.grantDigest()));
    }

    private static CapabilityGrant decodeGrant(String encoded) {
        List<String> f = decodeList(encoded);
        if (f.size() != 22) throw corrupt("grant payload malformed");
        return new CapabilityGrant(f.get(0), f.get(1), f.get(2), f.get(3), emptyToNull(f.get(4)),
                emptyToNull(f.get(5)), f.get(6), splitSet(f.get(7)), splitSet(f.get(8)), splitSet(f.get(9)),
                splitSet(f.get(10)), splitSet(f.get(11)), Instant.parse(f.get(12)), Instant.parse(f.get(13)),
                Boolean.parseBoolean(f.get(14)), Integer.parseInt(f.get(15)), Long.parseLong(f.get(16)),
                f.get(17), f.get(18), splitList(f.get(19)), Instant.parse(f.get(20)), f.get(21));
    }

    private static String encodeStanding(GrantStandingState standing) {
        return encodeList(List.of(standing.grantId(), Long.toString(standing.standingRevision()),
                standing.standing().name(), Long.toString(standing.authorityGeneration()),
                standing.changedAt().toString(), standing.reasonRef(), String.join("\u001e", standing.evidenceRefs())));
    }

    private static GrantStandingState decodeStanding(String encoded) {
        List<String> f = decodeList(encoded);
        if (f.size() != 7) throw corrupt("standing payload malformed");
        return new GrantStandingState(f.get(0), Long.parseLong(f.get(1)), GrantStanding.valueOf(f.get(2)),
                Long.parseLong(f.get(3)), Instant.parse(f.get(4)), f.get(5), splitList(f.get(6)));
    }

    private static String encodeList(List<String> fields) {
        String joined = String.join("\u001f", fields);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(joined.getBytes(StandardCharsets.UTF_8));
    }

    private static List<String> decodeList(String encoded) {
        try {
            String decoded = new String(Base64.getUrlDecoder().decode(encoded), StandardCharsets.UTF_8);
            return List.of(decoded.split("\u001f", -1));
        } catch (IllegalArgumentException ex) {
            throw corrupt("payload base64 malformed");
        }
    }

    private static Set<String> splitSet(String value) {
        if (value.isEmpty()) return Set.of();
        return canonicalSet("scope", Set.of(value.split("\u001e", -1)));
    }

    private static List<String> splitList(String value) {
        if (value.isEmpty()) return List.of();
        return List.of(value.split("\u001e", -1));
    }

    private static String emptyToNull(String value) { return value.isEmpty() ? null : value; }

    private static void subset(Set<String> child, Set<String> parent, String message) {
        if (!parent.containsAll(child)) deny(message);
    }

    private static void requireContains(Set<String> set, String value, String kind) {
        if (!set.contains(value)) deny(kind + " outside grant scope");
    }

    private static void requireCurrentReceipt(ReceiptStanding standing, Instant expiresAt, Instant now, String name) {
        if (standing == ReceiptStanding.DENIED) throw new IdentityException(ErrorCode.DENIED, name + " denied");
        if (standing == ReceiptStanding.UNKNOWN) throw new IdentityException(ErrorCode.BLOCKED_DEPENDENCY, name + " unknown");
        if (!now.isBefore(expiresAt)) throw new IdentityException(ErrorCode.EXPIRED, name + " expired");
    }

    private static void requireCommandReplay(CommandMemo memo, String requestHash, String expectedType) {
        if (!memo.requestHash().equals(requestHash)) {
            throw new IdentityException(ErrorCode.CONFLICT, "command id reused with changed semantic payload");
        }
        if (!memo.resultType().equals(expectedType)) {
            throw new IdentityException(ErrorCode.CORRUPT_STATE, "command replay result type mismatch");
        }
    }

    private static String expectedResultType(String eventType) {
        return switch (eventType) {
            case "GRANT_ISSUED" -> "GRANT";
            case "GRANT_SUSPENDED", "GRANT_REVOKED" -> "STANDING";
            case "AUTHORITY_GENERATION_ADVANCED" -> "GENERATION";
            default -> throw new IllegalArgumentException("unknown event type");
        };
    }

    private static IdentityException corrupt(String message) {
        return new IdentityException(ErrorCode.CORRUPT_STATE, message);
    }

    private static void deny(String message) {
        throw new IdentityException(ErrorCode.DENIED, message);
    }

    private static void stale(String message) {
        throw new IdentityException(ErrorCode.STALE_BASE, message);
    }

    private static String bytesToHex(byte[] bytes) {
        StringBuilder out = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) out.append(String.format("%02x", b));
        return out.toString();
    }
}
