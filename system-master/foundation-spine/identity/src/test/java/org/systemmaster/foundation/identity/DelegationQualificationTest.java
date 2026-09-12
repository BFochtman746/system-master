package org.systemmaster.foundation.identity;

import static org.systemmaster.foundation.identity.DelegationRuntime.*;
import static org.systemmaster.foundation.identity.IdentityContracts.*;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Exact 36-case isolated denominator for CORE-IDENTITY-DELEGATION-BUILD-001. */
public final class DelegationQualificationTest {
    private static int cases;

    public static void main(String[] args) throws Exception {
        case01RootGrantIssues();
        case02RootGrantIdempotentReplay();
        case03CommandConflict();
        case04ActionWideningDenied();
        case05ResourceWideningDenied();
        case06PurposeWideningDenied();
        case07AudienceWideningDenied();
        case08TargetWideningDenied();
        case09ChildStartsBeforeParentDenied();
        case10ChildExpiresAfterParentDenied();
        case11ParentForbidsSubdelegation();
        case12DepthIncreaseDenied();
        case13ParentDigestMismatch();
        case14ParentDelegateMismatch();
        case15SubjectChangeDenied();
        case16KeelCeilingChangeDenied();
        case17StaleGenerationFails();
        case18ParentSuspensionBlocksChild();
        case19ParentRevocationBlocksDescendantUse();
        case20ExpiredGrantFailsUse();
        case21NotYetValidGrantFailsUse();
        case22DisabledActorFailsClosed();
        case23ForgedActorChainDigestRejected();
        case24NonContiguousActorChainRejected();
        case25ActorChainCycleRejected();
        case26HardDepthExceeded();
        case27PresentedActorMismatch();
        case28UnknownGrantInHopFailsClosed();
        case29WrongGrantDigestInHopFailsClosed();
        case30RestartReplayEquivalent();
        case31TruncatedJournalFailsClosed();
        case32HashCorruptJournalFailsClosed();
        case33StaleConcurrentGenerationCannotIssue();
        case34JournalContainsNoRawCredentialPayload();
        case35ValidationDoesNotBecomeEffectPermission();
        case36GrantDoesNotOwnLeaseFenceTruth();
        if (cases != 36) throw new AssertionError("case denominator mismatch: " + cases);
        System.out.println("PASS FOUNDATION_IDENTITY_DELEGATION cases=36");
    }

    private static void case01RootGrantIssues() throws Exception {
        Fixture f = new Fixture();
        CapabilityGrant root = f.issueRoot("c01", true, 3);
        check(root.grantId().equals("grant-root-c01"), "root grant id");
        check(f.service.getStanding(root.grantId()).standing() == GrantStanding.ACTIVE, "root active");
        pass();
    }

    private static void case02RootGrantIdempotentReplay() throws Exception {
        Fixture f = new Fixture();
        GrantBody body = f.rootBody("grant-root-c02", true, 3, f.now.minusSeconds(5), f.now.plusSeconds(600));
        ActorChain chain = ActorChain.create("principal-user", "principal-user", List.of());
        CapabilityGrant a = f.issue("same-command-c02", body, chain);
        CapabilityGrant b = f.issue("same-command-c02", body, chain);
        check(a.equals(b), "idempotent replay differs");
        pass();
    }

    private static void case03CommandConflict() throws Exception {
        Fixture f = new Fixture();
        GrantBody body = f.rootBody("grant-root-c03", true, 3, f.now.minusSeconds(5), f.now.plusSeconds(600));
        ActorChain chain = ActorChain.create("principal-user", "principal-user", List.of());
        f.issue("same-command-c03", body, chain);
        GrantBody changed = f.withScopes(body, Set.of("read", "write"), body.resourceRefs(), body.purposeRefs(), body.audienceRefs(), body.targetRefs());
        expect(ErrorCode.CONFLICT, () -> f.issue("same-command-c03", changed, chain));
        pass();
    }

    private static void case04ActionWideningDenied() throws Exception { wideningCase("c04", 0); }
    private static void case05ResourceWideningDenied() throws Exception { wideningCase("c05", 1); }
    private static void case06PurposeWideningDenied() throws Exception { wideningCase("c06", 2); }
    private static void case07AudienceWideningDenied() throws Exception { wideningCase("c07", 3); }
    private static void case08TargetWideningDenied() throws Exception { wideningCase("c08", 4); }

    private static void wideningCase(String suffix, int kind) throws Exception {
        Fixture f = new Fixture();
        CapabilityGrant parent = f.issueRoot("root-" + suffix, true, 3);
        GrantBody child = f.validChildBody(parent, "grant-child-" + suffix);
        Set<String> a = child.allowedActions();
        Set<String> r = child.resourceRefs();
        Set<String> p = child.purposeRefs();
        Set<String> u = child.audienceRefs();
        Set<String> t = child.targetRefs();
        if (kind == 0) a = Set.of("read", "write");
        if (kind == 1) r = Set.of("resource:alpha", "resource:beta");
        if (kind == 2) p = Set.of("purpose:learn", "purpose:other");
        if (kind == 3) u = Set.of("audience:user", "audience:other");
        if (kind == 4) t = Set.of("target:one", "target:two");
        GrantBody changed = f.withScopes(child, a, r, p, u, t);
        expect(ErrorCode.DENIED, () -> f.issue("cmd-" + suffix, changed, f.chainFor(parent)));
        pass();
    }

    private static void case09ChildStartsBeforeParentDenied() throws Exception {
        Fixture f = new Fixture();
        CapabilityGrant parent = f.issueRoot("root-c09", true, 3);
        GrantBody child = f.validChildBody(parent, "grant-child-c09");
        child = f.withTimes(child, parent.notBefore().minusSeconds(1), child.expiresAt());
        GrantBody finalChild = child;
        expect(ErrorCode.DENIED, () -> f.issue("cmd-c09", finalChild, f.chainFor(parent)));
        pass();
    }

    private static void case10ChildExpiresAfterParentDenied() throws Exception {
        Fixture f = new Fixture();
        CapabilityGrant parent = f.issueRoot("root-c10", true, 3);
        GrantBody child = f.validChildBody(parent, "grant-child-c10");
        child = f.withTimes(child, child.notBefore(), parent.expiresAt().plusSeconds(1));
        GrantBody finalChild = child;
        expect(ErrorCode.DENIED, () -> f.issue("cmd-c10", finalChild, f.chainFor(parent)));
        pass();
    }

    private static void case11ParentForbidsSubdelegation() throws Exception {
        Fixture f = new Fixture();
        CapabilityGrant parent = f.issueRoot("root-c11", false, 0);
        GrantBody child = f.validChildBody(parent, "grant-child-c11");
        expect(ErrorCode.DENIED, () -> f.issue("cmd-c11", child, f.chainFor(parent)));
        pass();
    }

    private static void case12DepthIncreaseDenied() throws Exception {
        Fixture f = new Fixture();
        CapabilityGrant parent = f.issueRoot("root-c12", true, 1);
        GrantBody child = f.validChildBody(parent, "grant-child-c12");
        child = f.withDepth(child, 1);
        GrantBody finalChild = child;
        expect(ErrorCode.DENIED, () -> f.issue("cmd-c12", finalChild, f.chainFor(parent)));
        pass();
    }

    private static void case13ParentDigestMismatch() throws Exception {
        Fixture f = new Fixture();
        CapabilityGrant parent = f.issueRoot("root-c13", true, 3);
        GrantBody child = f.validChildBody(parent, "grant-child-c13");
        child = f.withParent(child, parent.grantId(), "0".repeat(64));
        GrantBody finalChild = child;
        expect(ErrorCode.STALE_BASE, () -> f.issue("cmd-c13", finalChild, f.chainFor(parent)));
        pass();
    }

    private static void case14ParentDelegateMismatch() throws Exception {
        Fixture f = new Fixture();
        CapabilityGrant parent = f.issueRoot("root-c14", true, 3);
        GrantBody child = f.validChildBody(parent, "grant-child-c14");
        child = f.withPrincipals(child, child.subjectPrincipalId(), "principal-other", child.delegatePrincipalId());
        GrantBody finalChild = child;
        expect(ErrorCode.DENIED, () -> f.issue("cmd-c14", finalChild, f.chainFor(parent)));
        pass();
    }

    private static void case15SubjectChangeDenied() throws Exception {
        Fixture f = new Fixture();
        CapabilityGrant parent = f.issueRoot("root-c15", true, 3);
        GrantBody child = f.validChildBody(parent, "grant-child-c15");
        child = f.withPrincipals(child, "principal-other", child.delegatorPrincipalId(), child.delegatePrincipalId());
        ActorChain chain = ActorChain.create("principal-other", parent.delegatePrincipalId(), f.chainFor(parent).hops());
        GrantBody finalChild = child;
        expect(ErrorCode.DENIED, () -> f.issue("cmd-c15", finalChild, chain));
        pass();
    }

    private static void case16KeelCeilingChangeDenied() throws Exception {
        Fixture f = new Fixture();
        CapabilityGrant parent = f.issueRoot("root-c16", true, 3);
        GrantBody child = f.validChildBody(parent, "grant-child-c16");
        child = f.withCeiling(child, "ref:keel/other", sha256("other-ceiling"));
        GrantBody finalChild = child;
        expect(ErrorCode.STALE_BASE, () -> f.issue("cmd-c16", finalChild, f.chainFor(parent)));
        pass();
    }

    private static void case17StaleGenerationFails() throws Exception {
        Fixture f = new Fixture();
        f.service.advanceAuthorityGeneration(f.advance("adv-c17", 1));
        GrantBody body = f.rootBody("grant-root-c17", true, 3, f.now.minusSeconds(5), f.now.plusSeconds(600));
        expect(ErrorCode.STALE_BASE, () -> f.issue("cmd-c17", body, ActorChain.create("principal-user", "principal-user", List.of())));
        pass();
    }

    private static void case18ParentSuspensionBlocksChild() throws Exception {
        Fixture f = new Fixture();
        CapabilityGrant parent = f.issueRoot("root-c18", true, 3);
        f.service.suspend(f.standing("suspend-c18", parent.grantId(), 1));
        GrantBody child = f.validChildBody(parent, "grant-child-c18");
        expect(ErrorCode.DENIED, () -> f.issue("cmd-c18", child, f.chainFor(parent)));
        pass();
    }

    private static void case19ParentRevocationBlocksDescendantUse() throws Exception {
        Fixture f = new Fixture();
        CapabilityGrant parent = f.issueRoot("root-c19", true, 3);
        CapabilityGrant child = f.issue("child-c19", f.validChildBody(parent, "grant-child-c19"), f.chainFor(parent));
        f.service.revoke(f.standing("revoke-c19", parent.grantId(), 1));
        expect(ErrorCode.REVOKED, () -> f.service.validateUse(f.use(child, f.chainFor(child), f.now)));
        pass();
    }

    private static void case20ExpiredGrantFailsUse() throws Exception {
        Fixture f = new Fixture();
        CapabilityGrant root = f.issueRootWithTimes("root-c20", f.now.minusSeconds(20), f.now.minusSeconds(10));
        expect(ErrorCode.EXPIRED, () -> f.service.validateUse(f.use(root, f.chainFor(root), f.now)));
        pass();
    }

    private static void case21NotYetValidGrantFailsUse() throws Exception {
        Fixture f = new Fixture();
        CapabilityGrant root = f.issueRootWithTimes("root-c21", f.now.plusSeconds(100), f.now.plusSeconds(200));
        expect(ErrorCode.EXPIRED, () -> f.service.validateUse(f.use(root, f.chainFor(root), f.now)));
        pass();
    }

    private static void case22DisabledActorFailsClosed() throws Exception {
        Fixture f = new Fixture();
        CapabilityGrant root = f.issueRoot("root-c22", true, 3);
        f.statuses.put("principal-agent", PrincipalStatus.DISABLED);
        GrantBody child = f.validChildBody(root, "grant-child-c22");
        expect(ErrorCode.DENIED, () -> f.issue("cmd-c22", child, f.chainFor(root)));
        pass();
    }

    private static void case23ForgedActorChainDigestRejected() throws Exception {
        expectIllegal(() -> new ActorChain("principal-user", "principal-user", List.of(), "0".repeat(64)));
        pass();
    }

    private static void case24NonContiguousActorChainRejected() throws Exception {
        DelegationHop h1 = new DelegationHop("g1", sha256("g1"), "principal-user", "principal-agent");
        DelegationHop h2 = new DelegationHop("g2", sha256("g2"), "principal-other", "principal-worker");
        expectIllegal(() -> ActorChain.create("principal-user", "principal-worker", List.of(h1, h2)));
        pass();
    }

    private static void case25ActorChainCycleRejected() throws Exception {
        DelegationHop h1 = new DelegationHop("g1", sha256("g1"), "principal-user", "principal-agent");
        DelegationHop h2 = new DelegationHop("g2", sha256("g2"), "principal-agent", "principal-user");
        expectIllegal(() -> ActorChain.create("principal-user", "principal-user", List.of(h1, h2)));
        pass();
    }

    private static void case26HardDepthExceeded() throws Exception {
        List<DelegationHop> hops = new ArrayList<>();
        String prior = "p0";
        for (int i = 1; i <= 17; i++) {
            String next = "p" + i;
            hops.add(new DelegationHop("g" + i, sha256("g" + i), prior, next));
            prior = next;
        }
        String actor = prior;
        expectIllegal(() -> ActorChain.create("p0", actor, hops));
        pass();
    }

    private static void case27PresentedActorMismatch() throws Exception {
        Fixture f = new Fixture();
        CapabilityGrant root = f.issueRoot("root-c27", true, 3);
        CapabilityUseRequest use = new CapabilityUseRequest(root.grantId(), root.grantDigest(), f.chainFor(root),
                "principal-other", "read", "resource:alpha", "purpose:learn", "audience:user", "target:one", f.now);
        expect(ErrorCode.DENIED, () -> f.service.validateUse(use));
        pass();
    }

    private static void case28UnknownGrantInHopFailsClosed() throws Exception {
        Fixture f = new Fixture();
        CapabilityGrant root = f.issueRoot("root-c28", true, 3);
        DelegationHop fake = new DelegationHop("grant-missing", sha256("missing"), "principal-user", "principal-agent");
        ActorChain chain = ActorChain.create("principal-user", "principal-agent", List.of(fake));
        CapabilityUseRequest use = new CapabilityUseRequest(root.grantId(), root.grantDigest(), chain,
                "principal-agent", "read", "resource:alpha", "purpose:learn", "audience:user", "target:one", f.now);
        expect(ErrorCode.NOT_FOUND, () -> f.service.validateUse(use));
        pass();
    }

    private static void case29WrongGrantDigestInHopFailsClosed() throws Exception {
        Fixture f = new Fixture();
        CapabilityGrant root = f.issueRoot("root-c29", true, 3);
        DelegationHop fake = new DelegationHop(root.grantId(), sha256("wrong"), root.delegatorPrincipalId(), root.delegatePrincipalId());
        ActorChain chain = ActorChain.create(root.subjectPrincipalId(), root.delegatePrincipalId(), List.of(fake));
        CapabilityUseRequest use = new CapabilityUseRequest(root.grantId(), root.grantDigest(), chain,
                root.delegatePrincipalId(), "read", "resource:alpha", "purpose:learn", "audience:user", "target:one", f.now);
        expect(ErrorCode.STALE_BASE, () -> f.service.validateUse(use));
        pass();
    }

    private static void case30RestartReplayEquivalent() throws Exception {
        Fixture f = new Fixture();
        CapabilityGrant root = f.issueRoot("root-c30", true, 3);
        DelegationState before = f.store.load();
        DelegationJournalStore reopened = new DelegationJournalStore(f.dir);
        DelegationState after = reopened.load();
        check(before.grants().equals(after.grants()), "grant replay differs");
        check(before.standings().equals(after.standings()), "standing replay differs");
        check(after.grants().containsKey(root.grantId()), "root missing after replay");
        pass();
    }

    private static void case31TruncatedJournalFailsClosed() throws Exception {
        Fixture f = new Fixture();
        f.issueRoot("root-c31", true, 3);
        Path journal = f.dir.resolve("delegation.journal");
        byte[] bytes = Files.readAllBytes(journal);
        Files.write(journal, java.util.Arrays.copyOf(bytes, bytes.length - 8));
        expect(ErrorCode.CORRUPT_STATE, () -> f.store.load());
        pass();
    }

    private static void case32HashCorruptJournalFailsClosed() throws Exception {
        Fixture f = new Fixture();
        f.issueRoot("root-c32", true, 3);
        Path journal = f.dir.resolve("delegation.journal");
        String line = Files.readString(journal, StandardCharsets.UTF_8);
        int idx = line.indexOf("GRANT_ISSUED");
        check(idx >= 0, "event missing");
        char replacement = line.charAt(idx) == 'G' ? 'X' : 'G';
        String corrupt = line.substring(0, idx) + replacement + line.substring(idx + 1);
        Files.writeString(journal, corrupt, StandardCharsets.UTF_8);
        expect(ErrorCode.CORRUPT_STATE, () -> f.store.load());
        pass();
    }

    private static void case33StaleConcurrentGenerationCannotIssue() throws Exception {
        Fixture f = new Fixture();
        CapabilityGrant parent = f.issueRoot("root-c33", true, 3);
        GrantBody child = f.validChildBody(parent, "grant-child-c33");
        f.service.advanceAuthorityGeneration(f.advance("advance-c33", 1));
        expect(ErrorCode.STALE_BASE, () -> f.issue("child-c33", child, f.chainFor(parent)));
        pass();
    }

    private static void case34JournalContainsNoRawCredentialPayload() throws Exception {
        Fixture f = new Fixture();
        f.issueRoot("root-c34", true, 3);
        String journal = Files.readString(f.dir.resolve("delegation.journal"), StandardCharsets.UTF_8);
        check(!journal.contains("Bearer "), "journal contains bearer credential");
        check(!journal.contains("secret-value"), "journal contains raw secret");
        check(!journal.contains("private-key"), "journal contains raw key");
        pass();
    }

    private static void case35ValidationDoesNotBecomeEffectPermission() throws Exception {
        Fixture f = new Fixture();
        CapabilityGrant root = f.issueRoot("root-c35", true, 3);
        CapabilityValidationReceipt receipt = f.service.validateUse(f.use(root, f.chainFor(root), f.now));
        String fields = java.util.Arrays.toString(receipt.getClass().getRecordComponents());
        check(!fields.toLowerCase().contains("effect"), "validation receipt absorbed Effect Authority");
        check(!fields.toLowerCase().contains("commitpermission"), "validation receipt grants commit permission");
        pass();
    }

    private static void case36GrantDoesNotOwnLeaseFenceTruth() throws Exception {
        Fixture f = new Fixture();
        CapabilityGrant root = f.issueRoot("root-c36", true, 3);
        String fields = java.util.Arrays.toString(root.getClass().getRecordComponents()).toLowerCase();
        check(!fields.contains("lease"), "grant absorbed runtime lease truth");
        check(!fields.contains("fence"), "grant absorbed runtime fence truth");
        pass();
    }

    private static final class Fixture {
        final Path dir = tempDir();
        final Instant now = Instant.now().truncatedTo(ChronoUnit.SECONDS);
        final Map<String, PrincipalStatus> statuses = new HashMap<>();
        final Map<String, ExternalAuthorizationReceipt> external = new HashMap<>();
        final Map<String, DelegationCeilingReceipt> ceilings = new HashMap<>();
        final DelegationJournalStore store;
        final DelegationService service;

        Fixture() throws IOException {
            statuses.put("principal-user", PrincipalStatus.ACTIVE);
            statuses.put("principal-agent", PrincipalStatus.ACTIVE);
            statuses.put("principal-worker", PrincipalStatus.ACTIVE);
            statuses.put("principal-other", PrincipalStatus.ACTIVE);
            store = new DelegationJournalStore(dir);
            PrincipalAuthority pa = id -> {
                PrincipalStatus status = statuses.get(id);
                if (status == null) throw new IdentityException(ErrorCode.NOT_FOUND, "principal absent");
                return new Principal(id, new PrincipalKind("SERVICE"), status, now.minusSeconds(3600), 1,
                        List.of("ref:authority/test"), List.of("ref:evidence/test"));
            };
            ReceiptAuthority ra = new ReceiptAuthority() {
                @Override public ExternalAuthorizationReceipt externalAuthorization(String ref) {
                    ExternalAuthorizationReceipt value = external.get(ref);
                    if (value == null) throw new IdentityException(ErrorCode.BLOCKED_DEPENDENCY, "external receipt absent");
                    return value;
                }
                @Override public DelegationCeilingReceipt delegationCeiling(String ref) {
                    DelegationCeilingReceipt value = ceilings.get(ref);
                    if (value == null) throw new IdentityException(ErrorCode.BLOCKED_DEPENDENCY, "ceiling receipt absent");
                    return value;
                }
            };
            service = new DelegationService(store, pa, ra, (context, action, target) -> {
                if (context.authorityEvidenceRefs().isEmpty()) throw new IdentityException(ErrorCode.DENIED, "missing mutation authority evidence");
            });
        }

        CapabilityGrant issueRoot(String suffix, boolean subdelegate, int depth) throws Exception {
            return issueRootWithTimes(suffix, now.minusSeconds(5), now.plusSeconds(600), subdelegate, depth);
        }

        CapabilityGrant issueRootWithTimes(String suffix, Instant from, Instant to) throws Exception {
            return issueRootWithTimes(suffix, from, to, true, 3);
        }

        CapabilityGrant issueRootWithTimes(String suffix, Instant from, Instant to, boolean subdelegate, int depth) throws Exception {
            GrantBody body = rootBody("grant-" + suffix, subdelegate, depth, from, to);
            return issue("cmd-" + suffix, body, ActorChain.create("principal-user", "principal-user", List.of()));
        }

        GrantBody rootBody(String grantId, boolean subdelegate, int depth, Instant from, Instant to) {
            ActorChain chain = ActorChain.create("principal-user", "principal-user", List.of());
            return new GrantBody(grantId, "principal-user", "principal-user", "principal-agent", null, null,
                    chain.chainDigest(), Set.of("read"), Set.of("resource:alpha"), Set.of("purpose:learn"),
                    Set.of("audience:user"), Set.of("target:one"), from, to, subdelegate, depth, 1,
                    "ref:keel/ceiling-1", sha256("ceiling-1"), List.of("ref:evidence/delegation"), now);
        }

        GrantBody validChildBody(CapabilityGrant parent, String grantId) {
            ActorChain chain = chainFor(parent);
            return new GrantBody(grantId, parent.subjectPrincipalId(), parent.delegatePrincipalId(), "principal-worker",
                    parent.grantId(), parent.grantDigest(), chain.chainDigest(), parent.allowedActions(),
                    parent.resourceRefs(), parent.purposeRefs(), parent.audienceRefs(), parent.targetRefs(),
                    parent.notBefore().plusSeconds(1), parent.expiresAt().minusSeconds(1), false,
                    Math.max(0, parent.remainingSubdelegationDepth() - 1), parent.authorityGeneration(),
                    parent.keelCeilingRef(), parent.keelCeilingDigest(), List.of("ref:evidence/child"), now);
        }

        CapabilityGrant issue(String commandId, GrantBody body, ActorChain chain) throws Exception {
            String digest = digestGrant(body);
            String externalRef = "ref:external/" + commandId;
            String ceilingRef = "ref:ceiling/" + commandId;
            external.put(externalRef, new ExternalAuthorizationReceipt(externalRef, digest, ReceiptStanding.CURRENT,
                    now.minusSeconds(1), now.plusSeconds(300)));
            ceilings.put(ceilingRef, new DelegationCeilingReceipt(ceilingRef, body.keelCeilingRef(),
                    body.keelCeilingDigest(), digest, ReceiptStanding.CURRENT, now.minusSeconds(1), now.plusSeconds(300)));
            MutationContext context = new MutationContext(commandId, body.delegatorPrincipalId(), List.of("ref:evidence/mutation"));
            return service.issue(new IssueGrantRequest(context, body, chain, externalRef, ceilingRef, body.authorityGeneration()));
        }

        ActorChain chainFor(CapabilityGrant grant) {
            try {
                List<DelegationHop> hops = new ArrayList<>();
                CapabilityGrant current = grant;
                while (true) {
                    hops.add(0, new DelegationHop(current.grantId(), current.grantDigest(),
                            current.delegatorPrincipalId(), current.delegatePrincipalId()));
                    if (current.parentGrantId() == null) break;
                    current = service.getGrant(current.parentGrantId());
                }
                return ActorChain.create(grant.subjectPrincipalId(), grant.delegatePrincipalId(), hops);
            } catch (IOException ex) {
                throw new RuntimeException(ex);
            }
        }

        StandingChangeRequest standing(String commandId, String grantId, long rev) {
            return new StandingChangeRequest(new MutationContext(commandId, "principal-user", List.of("ref:evidence/mutation")),
                    grantId, rev, "ref:reason/test", List.of("ref:evidence/test"));
        }

        AdvanceGenerationRequest advance(String commandId, long generation) {
            return new AdvanceGenerationRequest(new MutationContext(commandId, "principal-user", List.of("ref:evidence/mutation")),
                    generation, "ref:reason/security", List.of("ref:evidence/security"));
        }

        CapabilityUseRequest use(CapabilityGrant grant, ActorChain chain, Instant at) {
            return new CapabilityUseRequest(grant.grantId(), grant.grantDigest(), chain, grant.delegatePrincipalId(),
                    "read", "resource:alpha", "purpose:learn", "audience:user", "target:one", at);
        }

        GrantBody withScopes(GrantBody b, Set<String> a, Set<String> r, Set<String> p, Set<String> u, Set<String> t) {
            return copy(b, b.subjectPrincipalId(), b.delegatorPrincipalId(), b.delegatePrincipalId(), b.parentGrantId(),
                    b.parentGrantDigest(), a, r, p, u, t, b.notBefore(), b.expiresAt(), b.remainingSubdelegationDepth(),
                    b.keelCeilingRef(), b.keelCeilingDigest());
        }

        GrantBody withTimes(GrantBody b, Instant from, Instant to) {
            return copy(b, b.subjectPrincipalId(), b.delegatorPrincipalId(), b.delegatePrincipalId(), b.parentGrantId(),
                    b.parentGrantDigest(), b.allowedActions(), b.resourceRefs(), b.purposeRefs(), b.audienceRefs(),
                    b.targetRefs(), from, to, b.remainingSubdelegationDepth(), b.keelCeilingRef(), b.keelCeilingDigest());
        }

        GrantBody withDepth(GrantBody b, int depth) {
            return copy(b, b.subjectPrincipalId(), b.delegatorPrincipalId(), b.delegatePrincipalId(), b.parentGrantId(),
                    b.parentGrantDigest(), b.allowedActions(), b.resourceRefs(), b.purposeRefs(), b.audienceRefs(),
                    b.targetRefs(), b.notBefore(), b.expiresAt(), depth, b.keelCeilingRef(), b.keelCeilingDigest());
        }

        GrantBody withParent(GrantBody b, String id, String digest) {
            return copy(b, b.subjectPrincipalId(), b.delegatorPrincipalId(), b.delegatePrincipalId(), id, digest,
                    b.allowedActions(), b.resourceRefs(), b.purposeRefs(), b.audienceRefs(), b.targetRefs(),
                    b.notBefore(), b.expiresAt(), b.remainingSubdelegationDepth(), b.keelCeilingRef(), b.keelCeilingDigest());
        }

        GrantBody withPrincipals(GrantBody b, String subject, String delegator, String delegate) {
            return copy(b, subject, delegator, delegate, b.parentGrantId(), b.parentGrantDigest(), b.allowedActions(),
                    b.resourceRefs(), b.purposeRefs(), b.audienceRefs(), b.targetRefs(), b.notBefore(), b.expiresAt(),
                    b.remainingSubdelegationDepth(), b.keelCeilingRef(), b.keelCeilingDigest());
        }

        GrantBody withCeiling(GrantBody b, String ref, String digest) {
            return copy(b, b.subjectPrincipalId(), b.delegatorPrincipalId(), b.delegatePrincipalId(), b.parentGrantId(),
                    b.parentGrantDigest(), b.allowedActions(), b.resourceRefs(), b.purposeRefs(), b.audienceRefs(),
                    b.targetRefs(), b.notBefore(), b.expiresAt(), b.remainingSubdelegationDepth(), ref, digest);
        }

        private GrantBody copy(GrantBody b, String subject, String delegator, String delegate, String parentId,
                String parentDigest, Set<String> a, Set<String> r, Set<String> p, Set<String> u, Set<String> t,
                Instant from, Instant to, int depth, String ceilingRef, String ceilingDigest) {
            ActorChain chain;
            if (parentId == null) chain = ActorChain.create(subject, delegator, List.of());
            else {
                try { chain = chainFor(service.getGrant(parentId)); }
                catch (Exception ex) { chain = ActorChain.create(subject, delegator, List.of()); }
            }
            return new GrantBody(b.grantId(), subject, delegator, delegate, parentId, parentDigest,
                    chain.chainDigest(), a, r, p, u, t, from, to, b.maySubdelegate(), depth,
                    b.authorityGeneration(), ceilingRef, ceilingDigest, b.authorityEvidenceRefs(), b.issuedAt());
        }
    }

    @FunctionalInterface
    private interface ThrowingAction { void run() throws Exception; }

    private static void expect(ErrorCode code, ThrowingAction action) throws Exception {
        try {
            action.run();
            throw new AssertionError("expected " + code);
        } catch (IdentityException ex) {
            if (ex.code() != code) throw new AssertionError("expected " + code + " but got " + ex.code(), ex);
        }
    }

    private static void expectIllegal(ThrowingAction action) throws Exception {
        try {
            action.run();
            throw new AssertionError("expected IllegalArgumentException");
        } catch (IllegalArgumentException expected) {
            // expected
        }
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    private static void pass() { cases++; }

    private static Path tempDir() {
        try { return Files.createTempDirectory("delegation-q-"); }
        catch (IOException ex) { throw new RuntimeException(ex); }
    }
}
