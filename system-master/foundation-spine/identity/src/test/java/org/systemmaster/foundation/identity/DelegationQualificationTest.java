package org.systemmaster.foundation.identity;

import static org.systemmaster.foundation.identity.DelegationRuntime.*;
import static org.systemmaster.foundation.identity.IdentityContracts.*;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Exact 36-case isolated denominator for CORE-IDENTITY-DELEGATION-BUILD-001. */
public final class DelegationQualificationTest {
    private static int cases;

    public static void main(String[] args) throws Exception {
        rootIssues();                                      // 1
        idempotentReplay();                                // 2
        commandConflict();                                 // 3
        wideningDenied(0);                                 // 4
        wideningDenied(1);                                 // 5
        wideningDenied(2);                                 // 6
        wideningDenied(3);                                 // 7
        wideningDenied(4);                                 // 8
        childStartBeforeParentDenied();                    // 9
        childExpiryAfterParentDenied();                    // 10
        parentForbidsSubdelegation();                      // 11
        depthIncreaseDenied();                             // 12
        parentDigestMismatch();                            // 13
        parentDelegateMismatch();                          // 14
        subjectChangeDenied();                             // 15
        keelCeilingChangeDenied();                         // 16
        staleGenerationFails();                            // 17
        parentSuspensionBlocksChild();                     // 18
        parentRevocationBlocksDescendantUse();             // 19
        expiredGrantFailsUse();                            // 20
        notYetValidGrantFailsUse();                        // 21
        disabledActorFailsClosed();                        // 22
        forgedActorChainDigestRejected();                  // 23
        nonContiguousActorChainRejected();                 // 24
        actorChainCycleRejected();                         // 25
        hardDepthExceeded();                               // 26
        presentedActorMismatch();                          // 27
        unknownGrantInHopFailsClosed();                    // 28
        wrongGrantDigestInHopFailsClosed();                // 29
        restartReplayEquivalent();                         // 30
        truncatedJournalFailsClosed();                     // 31
        hashCorruptJournalFailsClosed();                   // 32
        staleInterleavingCannotBypassGeneration();         // 33
        journalContainsNoRawCredentialPayload();           // 34
        validationDoesNotBecomeEffectPermission();         // 35
        grantDoesNotOwnLeaseFenceTruth();                  // 36
        if (cases != 36) throw new AssertionError("case denominator mismatch: " + cases);
        System.out.println("PASS FOUNDATION_IDENTITY_DELEGATION cases=36");
    }

    private static void rootIssues() throws Exception {
        Fixture f = new Fixture();
        CapabilityGrant g = f.issueRoot("c01", true, 3);
        check(g.grantId().equals("grant-c01"), "root id mismatch");
        check(f.service.getStanding(g.grantId()).standing() == GrantStanding.ACTIVE, "root not active");
        pass();
    }

    private static void idempotentReplay() throws Exception {
        Fixture f = new Fixture();
        GrantBody body = f.rootBody("grant-c02", true, 3, f.now.minusSeconds(5), f.now.plusSeconds(600), 1);
        ActorChain chain = f.rootChain();
        CapabilityGrant a = f.issue("same-command-c02", body, chain);
        CapabilityGrant b = f.issue("same-command-c02", body, chain);
        check(a.equals(b), "idempotent result differs");
        pass();
    }

    private static void commandConflict() throws Exception {
        Fixture f = new Fixture();
        GrantBody body = f.rootBody("grant-c03", true, 3, f.now.minusSeconds(5), f.now.plusSeconds(600), 1);
        f.issue("same-command-c03", body, f.rootChain());
        GrantBody changed = f.copy(body, body.subjectPrincipalId(), body.delegatorPrincipalId(), body.delegatePrincipalId(),
                body.parentGrantId(), body.parentGrantDigest(), body.actorChainDigest(), Set.of("read", "write"),
                body.resourceRefs(), body.purposeRefs(), body.audienceRefs(), body.targetRefs(), body.notBefore(),
                body.expiresAt(), body.maySubdelegate(), body.remainingSubdelegationDepth(), body.authorityGeneration(),
                body.keelCeilingRef(), body.keelCeilingDigest());
        expect(ErrorCode.CONFLICT, () -> f.issue("same-command-c03", changed, f.rootChain()));
        pass();
    }

    private static void wideningDenied(int kind) throws Exception {
        Fixture f = new Fixture();
        CapabilityGrant parent = f.issueRoot("c0" + (4 + kind), true, 3);
        ActorChain chain = f.chainFor(parent);
        GrantBody child = f.childBody(parent, "grant-child-c0" + (4 + kind), chain, 2);
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
        GrantBody changed = f.copy(child, child.subjectPrincipalId(), child.delegatorPrincipalId(), child.delegatePrincipalId(),
                child.parentGrantId(), child.parentGrantDigest(), child.actorChainDigest(), a, r, p, u, t,
                child.notBefore(), child.expiresAt(), child.maySubdelegate(), child.remainingSubdelegationDepth(),
                child.authorityGeneration(), child.keelCeilingRef(), child.keelCeilingDigest());
        expect(ErrorCode.DENIED, () -> f.issue("command-widen-" + kind, changed, chain));
        pass();
    }

    private static void childStartBeforeParentDenied() throws Exception {
        Fixture f = new Fixture();
        CapabilityGrant p = f.issueRoot("c09", true, 3);
        ActorChain chain = f.chainFor(p);
        GrantBody c = f.childBody(p, "grant-child-c09", chain, 2);
        c = f.copy(c, c.subjectPrincipalId(), c.delegatorPrincipalId(), c.delegatePrincipalId(), c.parentGrantId(),
                c.parentGrantDigest(), c.actorChainDigest(), c.allowedActions(), c.resourceRefs(), c.purposeRefs(),
                c.audienceRefs(), c.targetRefs(), p.notBefore().minusSeconds(1), c.expiresAt(), c.maySubdelegate(),
                c.remainingSubdelegationDepth(), c.authorityGeneration(), c.keelCeilingRef(), c.keelCeilingDigest());
        GrantBody candidate = c;
        expect(ErrorCode.DENIED, () -> f.issue("command-c09", candidate, chain));
        pass();
    }

    private static void childExpiryAfterParentDenied() throws Exception {
        Fixture f = new Fixture();
        CapabilityGrant p = f.issueRoot("c10", true, 3);
        ActorChain chain = f.chainFor(p);
        GrantBody c = f.childBody(p, "grant-child-c10", chain, 2);
        c = f.copy(c, c.subjectPrincipalId(), c.delegatorPrincipalId(), c.delegatePrincipalId(), c.parentGrantId(),
                c.parentGrantDigest(), c.actorChainDigest(), c.allowedActions(), c.resourceRefs(), c.purposeRefs(),
                c.audienceRefs(), c.targetRefs(), c.notBefore(), p.expiresAt().plusSeconds(1), c.maySubdelegate(),
                c.remainingSubdelegationDepth(), c.authorityGeneration(), c.keelCeilingRef(), c.keelCeilingDigest());
        GrantBody candidate = c;
        expect(ErrorCode.DENIED, () -> f.issue("command-c10", candidate, chain));
        pass();
    }

    private static void parentForbidsSubdelegation() throws Exception {
        Fixture f = new Fixture();
        CapabilityGrant p = f.issueRoot("c11", false, 0);
        ActorChain chain = f.chainFor(p);
        GrantBody c = f.childBody(p, "grant-child-c11", chain, 0);
        expect(ErrorCode.DENIED, () -> f.issue("command-c11", c, chain));
        pass();
    }

    private static void depthIncreaseDenied() throws Exception {
        Fixture f = new Fixture();
        CapabilityGrant p = f.issueRoot("c12", true, 1);
        ActorChain chain = f.chainFor(p);
        GrantBody c = f.childBody(p, "grant-child-c12", chain, 1);
        expect(ErrorCode.DENIED, () -> f.issue("command-c12", c, chain));
        pass();
    }

    private static void parentDigestMismatch() throws Exception {
        Fixture f = new Fixture();
        CapabilityGrant p = f.issueRoot("c13", true, 3);
        ActorChain chain = f.chainFor(p);
        GrantBody c = f.childBody(p, "grant-child-c13", chain, 2);
        c = f.copy(c, c.subjectPrincipalId(), c.delegatorPrincipalId(), c.delegatePrincipalId(), c.parentGrantId(),
                "0".repeat(64), c.actorChainDigest(), c.allowedActions(), c.resourceRefs(), c.purposeRefs(),
                c.audienceRefs(), c.targetRefs(), c.notBefore(), c.expiresAt(), c.maySubdelegate(),
                c.remainingSubdelegationDepth(), c.authorityGeneration(), c.keelCeilingRef(), c.keelCeilingDigest());
        GrantBody candidate = c;
        expect(ErrorCode.STALE_BASE, () -> f.issue("command-c13", candidate, chain));
        pass();
    }

    private static void parentDelegateMismatch() throws Exception {
        Fixture f = new Fixture();
        CapabilityGrant p = f.issueRoot("c14", true, 3);
        DelegationHop fakeHop = new DelegationHop(p.grantId(), p.grantDigest(), p.delegatorPrincipalId(), "principal-other");
        ActorChain fakeChain = ActorChain.create(p.subjectPrincipalId(), "principal-other", List.of(fakeHop));
        GrantBody c = f.childBody(p, "grant-child-c14", fakeChain, 2);
        c = f.copy(c, c.subjectPrincipalId(), "principal-other", c.delegatePrincipalId(), c.parentGrantId(),
                c.parentGrantDigest(), fakeChain.chainDigest(), c.allowedActions(), c.resourceRefs(), c.purposeRefs(),
                c.audienceRefs(), c.targetRefs(), c.notBefore(), c.expiresAt(), c.maySubdelegate(),
                c.remainingSubdelegationDepth(), c.authorityGeneration(), c.keelCeilingRef(), c.keelCeilingDigest());
        GrantBody candidate = c;
        expect(ErrorCode.DENIED, () -> f.issue("command-c14", candidate, fakeChain));
        pass();
    }

    private static void subjectChangeDenied() throws Exception {
        Fixture f = new Fixture();
        CapabilityGrant p = f.issueRoot("c15", true, 3);
        DelegationHop fakeHop = new DelegationHop(p.grantId(), p.grantDigest(), "principal-other", p.delegatePrincipalId());
        ActorChain fakeChain = ActorChain.create("principal-other", p.delegatePrincipalId(), List.of(fakeHop));
        GrantBody c = f.childBody(p, "grant-child-c15", fakeChain, 2);
        c = f.copy(c, "principal-other", c.delegatorPrincipalId(), c.delegatePrincipalId(), c.parentGrantId(),
                c.parentGrantDigest(), fakeChain.chainDigest(), c.allowedActions(), c.resourceRefs(), c.purposeRefs(),
                c.audienceRefs(), c.targetRefs(), c.notBefore(), c.expiresAt(), c.maySubdelegate(),
                c.remainingSubdelegationDepth(), c.authorityGeneration(), c.keelCeilingRef(), c.keelCeilingDigest());
        GrantBody candidate = c;
        expect(ErrorCode.DENIED, () -> f.issue("command-c15", candidate, fakeChain));
        pass();
    }

    private static void keelCeilingChangeDenied() throws Exception {
        Fixture f = new Fixture();
        CapabilityGrant p = f.issueRoot("c16", true, 3);
        ActorChain chain = f.chainFor(p);
        GrantBody c = f.childBody(p, "grant-child-c16", chain, 2);
        c = f.copy(c, c.subjectPrincipalId(), c.delegatorPrincipalId(), c.delegatePrincipalId(), c.parentGrantId(),
                c.parentGrantDigest(), c.actorChainDigest(), c.allowedActions(), c.resourceRefs(), c.purposeRefs(),
                c.audienceRefs(), c.targetRefs(), c.notBefore(), c.expiresAt(), c.maySubdelegate(),
                c.remainingSubdelegationDepth(), c.authorityGeneration(), "ref:keel/other", sha256("other"));
        GrantBody candidate = c;
        expect(ErrorCode.STALE_BASE, () -> f.issue("command-c16", candidate, chain));
        pass();
    }

    private static void staleGenerationFails() throws Exception {
        Fixture f = new Fixture();
        f.service.advanceAuthorityGeneration(f.advance("command-advance-c17", 1));
        GrantBody b = f.rootBody("grant-c17", true, 3, f.now.minusSeconds(5), f.now.plusSeconds(600), 1);
        expect(ErrorCode.STALE_BASE, () -> f.issue("command-c17", b, f.rootChain()));
        pass();
    }

    private static void parentSuspensionBlocksChild() throws Exception {
        Fixture f = new Fixture();
        CapabilityGrant p = f.issueRoot("c18", true, 3);
        f.service.suspend(f.standing("command-suspend-c18", p.grantId(), 1));
        ActorChain chain = f.chainFor(p);
        GrantBody c = f.childBody(p, "grant-child-c18", chain, 2);
        expect(ErrorCode.DENIED, () -> f.issue("command-c18", c, chain));
        pass();
    }

    private static void parentRevocationBlocksDescendantUse() throws Exception {
        Fixture f = new Fixture();
        CapabilityGrant p = f.issueRoot("c19", true, 3);
        ActorChain pc = f.chainFor(p);
        CapabilityGrant child = f.issue("command-child-c19", f.childBody(p, "grant-child-c19", pc, 2), pc);
        f.service.revoke(f.standing("command-revoke-c19", p.grantId(), 1));
        expect(ErrorCode.REVOKED, () -> f.service.validateUse(f.use(child, f.chainFor(child), f.now)));
        pass();
    }

    private static void expiredGrantFailsUse() throws Exception {
        Fixture f = new Fixture();
        CapabilityGrant g = f.issueRootWithTimes("c20", f.now.minusSeconds(20), f.now.minusSeconds(10));
        expect(ErrorCode.EXPIRED, () -> f.service.validateUse(f.use(g, f.chainFor(g), f.now)));
        pass();
    }

    private static void notYetValidGrantFailsUse() throws Exception {
        Fixture f = new Fixture();
        CapabilityGrant g = f.issueRootWithTimes("c21", f.now.plusSeconds(100), f.now.plusSeconds(200));
        expect(ErrorCode.EXPIRED, () -> f.service.validateUse(f.use(g, f.chainFor(g), f.now)));
        pass();
    }

    private static void disabledActorFailsClosed() throws Exception {
        Fixture f = new Fixture();
        CapabilityGrant g = f.issueRoot("c22", true, 3);
        f.statuses.put(g.delegatePrincipalId(), PrincipalStatus.DISABLED);
        expect(ErrorCode.DENIED, () -> f.service.validateUse(f.use(g, f.chainFor(g), f.now)));
        pass();
    }

    private static void forgedActorChainDigestRejected() throws Exception {
        expectIllegal(() -> new ActorChain("principal-user", "principal-user", List.of(), "0".repeat(64)));
        pass();
    }

    private static void nonContiguousActorChainRejected() throws Exception {
        DelegationHop h1 = new DelegationHop("g24a", sha256("g24a"), "p24a", "p24b");
        DelegationHop h2 = new DelegationHop("g24b", sha256("g24b"), "p24x", "p24c");
        expectIllegal(() -> ActorChain.create("p24a", "p24c", List.of(h1, h2)));
        pass();
    }

    private static void actorChainCycleRejected() throws Exception {
        DelegationHop h1 = new DelegationHop("g25a", sha256("g25a"), "p25a", "p25b");
        DelegationHop h2 = new DelegationHop("g25b", sha256("g25b"), "p25b", "p25a");
        expectIllegal(() -> ActorChain.create("p25a", "p25a", List.of(h1, h2)));
        pass();
    }

    private static void hardDepthExceeded() throws Exception {
        List<DelegationHop> hops = new ArrayList<>();
        String prior = "p26-0";
        for (int i = 1; i <= 17; i++) {
            String next = "p26-" + i;
            hops.add(new DelegationHop("g26-" + i, sha256("g26-" + i), prior, next));
            prior = next;
        }
        String actor = prior;
        expectIllegal(() -> ActorChain.create("p26-0", actor, hops));
        pass();
    }

    private static void presentedActorMismatch() throws Exception {
        Fixture f = new Fixture();
        CapabilityGrant g = f.issueRoot("c27", true, 3);
        CapabilityUseRequest request = new CapabilityUseRequest(g.grantId(), g.grantDigest(), f.chainFor(g),
                "principal-other", "read", "resource:alpha", "purpose:learn", "audience:user", "target:one", f.now);
        expect(ErrorCode.DENIED, () -> f.service.validateUse(request));
        pass();
    }

    private static void unknownGrantInHopFailsClosed() throws Exception {
        Fixture f = new Fixture();
        CapabilityGrant g = f.issueRoot("c28", true, 3);
        DelegationHop fake = new DelegationHop("grant-missing", sha256("missing"), g.delegatorPrincipalId(), g.delegatePrincipalId());
        ActorChain chain = ActorChain.create(g.subjectPrincipalId(), g.delegatePrincipalId(), List.of(fake));
        expect(ErrorCode.NOT_FOUND, () -> f.service.validateUse(f.use(g, chain, f.now)));
        pass();
    }

    private static void wrongGrantDigestInHopFailsClosed() throws Exception {
        Fixture f = new Fixture();
        CapabilityGrant g = f.issueRoot("c29", true, 3);
        DelegationHop fake = new DelegationHop(g.grantId(), sha256("wrong"), g.delegatorPrincipalId(), g.delegatePrincipalId());
        ActorChain chain = ActorChain.create(g.subjectPrincipalId(), g.delegatePrincipalId(), List.of(fake));
        expect(ErrorCode.STALE_BASE, () -> f.service.validateUse(f.use(g, chain, f.now)));
        pass();
    }

    private static void restartReplayEquivalent() throws Exception {
        Fixture f = new Fixture();
        f.issueRoot("c30", true, 3);
        DelegationState before = f.store.load();
        DelegationState after = new DelegationJournalStore(f.dir).load();
        check(before.grants().equals(after.grants()), "grant replay differs");
        check(before.standings().equals(after.standings()), "standing replay differs");
        check(before.authorityGeneration() == after.authorityGeneration(), "generation replay differs");
        pass();
    }

    private static void truncatedJournalFailsClosed() throws Exception {
        Fixture f = new Fixture();
        f.issueRoot("c31", true, 3);
        Path journal = f.dir.resolve("delegation.journal");
        byte[] bytes = Files.readAllBytes(journal);
        Files.write(journal, java.util.Arrays.copyOf(bytes, bytes.length - 8));
        expect(ErrorCode.CORRUPT_STATE, f.store::load);
        pass();
    }

    private static void hashCorruptJournalFailsClosed() throws Exception {
        Fixture f = new Fixture();
        f.issueRoot("c32", true, 3);
        Path journal = f.dir.resolve("delegation.journal");
        String text = Files.readString(journal, StandardCharsets.UTF_8);
        int index = text.indexOf("GRANT_ISSUED");
        check(index >= 0, "event missing");
        Files.writeString(journal, text.substring(0, index) + "XRANT_ISSUED" + text.substring(index + "GRANT_ISSUED".length()), StandardCharsets.UTF_8);
        expect(ErrorCode.CORRUPT_STATE, f.store::load);
        pass();
    }

    private static void staleInterleavingCannotBypassGeneration() throws Exception {
        Fixture f = new Fixture();
        CapabilityGrant p = f.issueRoot("c33", true, 3);
        ActorChain chain = f.chainFor(p);
        GrantBody staleChild = f.childBody(p, "grant-child-c33", chain, 2);
        f.service.advanceAuthorityGeneration(f.advance("command-advance-c33", 1));
        expect(ErrorCode.STALE_BASE, () -> f.issue("command-child-c33", staleChild, chain));
        pass();
    }

    private static void journalContainsNoRawCredentialPayload() throws Exception {
        Fixture f = new Fixture();
        f.issueRoot("c34", true, 3);
        String journal = Files.readString(f.dir.resolve("delegation.journal"), StandardCharsets.UTF_8).toLowerCase();
        check(!journal.contains("bearer "), "bearer token persisted");
        check(!journal.contains("secret-value"), "secret persisted");
        check(!journal.contains("private-key"), "private key persisted");
        pass();
    }

    private static void validationDoesNotBecomeEffectPermission() throws Exception {
        Fixture f = new Fixture();
        CapabilityGrant g = f.issueRoot("c35", true, 3);
        CapabilityValidationReceipt receipt = f.service.validateUse(f.use(g, f.chainFor(g), f.now));
        String fields = java.util.Arrays.toString(receipt.getClass().getRecordComponents()).toLowerCase();
        check(!fields.contains("effect") && !fields.contains("commitpermission"), "Effect Authority absorbed");
        pass();
    }

    private static void grantDoesNotOwnLeaseFenceTruth() throws Exception {
        Fixture f = new Fixture();
        CapabilityGrant g = f.issueRoot("c36", true, 3);
        String fields = java.util.Arrays.toString(g.getClass().getRecordComponents()).toLowerCase();
        check(!fields.contains("lease") && !fields.contains("fence"), "runtime lease/fence absorbed");
        pass();
    }

    private static final class Fixture {
        final Path dir;
        final Instant now = Instant.now().minusSeconds(2);
        final Map<String, PrincipalStatus> statuses = new HashMap<>();
        final Map<String, ExternalAuthorizationReceipt> external = new HashMap<>();
        final Map<String, DelegationCeilingReceipt> ceilings = new HashMap<>();
        final DelegationJournalStore store;
        final DelegationService service;

        Fixture() throws IOException {
            dir = Files.createTempDirectory("delegation-q-");
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
                if (context.authorityEvidenceRefs().isEmpty()) throw new IdentityException(ErrorCode.DENIED, "missing mutation authority");
            });
        }

        ActorChain rootChain() { return ActorChain.create("principal-user", "principal-user", List.of()); }

        CapabilityGrant issueRoot(String suffix, boolean subdelegate, int depth) throws Exception {
            return issue("root-command-" + suffix,
                    rootBody("grant-" + suffix, subdelegate, depth, now.minusSeconds(5), now.plusSeconds(600), 1),
                    rootChain());
        }

        CapabilityGrant issueRootWithTimes(String suffix, Instant from, Instant to) throws Exception {
            return issue("root-command-" + suffix, rootBody("grant-" + suffix, true, 3, from, to, 1), rootChain());
        }

        GrantBody rootBody(String grantId, boolean subdelegate, int depth, Instant from, Instant to, long generation) {
            return new GrantBody(grantId, "principal-user", "principal-user", "principal-agent", null, null,
                    rootChain().chainDigest(), Set.of("read"), Set.of("resource:alpha"), Set.of("purpose:learn"),
                    Set.of("audience:user"), Set.of("target:one"), from, to, subdelegate, depth, generation,
                    "ref:keel/ceiling-1", sha256("ceiling-1"), List.of("ref:evidence/delegation"), now);
        }

        GrantBody childBody(CapabilityGrant parent, String grantId, ActorChain chain, int depth) {
            return new GrantBody(grantId, parent.subjectPrincipalId(), parent.delegatePrincipalId(), "principal-worker",
                    parent.grantId(), parent.grantDigest(), chain.chainDigest(), parent.allowedActions(), parent.resourceRefs(),
                    parent.purposeRefs(), parent.audienceRefs(), parent.targetRefs(), parent.notBefore().plusSeconds(1),
                    parent.expiresAt().minusSeconds(1), false, depth, parent.authorityGeneration(), parent.keelCeilingRef(),
                    parent.keelCeilingDigest(), List.of("ref:evidence/child"), now);
        }

        CapabilityGrant issue(String commandId, GrantBody body, ActorChain chain) throws Exception {
            String digest = digestGrant(body);
            String extRef = "ref:external/" + commandId;
            String ceilRef = "ref:ceiling/" + commandId;
            external.put(extRef, new ExternalAuthorizationReceipt(extRef, digest, ReceiptStanding.CURRENT,
                    now.minusSeconds(60), now.plusSeconds(600)));
            ceilings.put(ceilRef, new DelegationCeilingReceipt(ceilRef, body.keelCeilingRef(), body.keelCeilingDigest(),
                    digest, ReceiptStanding.CURRENT, now.minusSeconds(60), now.plusSeconds(600)));
            MutationContext context = new MutationContext(commandId, body.delegatorPrincipalId(), List.of("ref:evidence/mutation"));
            return service.issue(new IssueGrantRequest(context, body, chain, extRef, ceilRef, body.authorityGeneration()));
        }

        ActorChain chainFor(CapabilityGrant grant) throws IOException {
            List<DelegationHop> hops = new ArrayList<>();
            CapabilityGrant current = grant;
            while (true) {
                hops.add(0, new DelegationHop(current.grantId(), current.grantDigest(),
                        current.delegatorPrincipalId(), current.delegatePrincipalId()));
                if (current.parentGrantId() == null) break;
                current = service.getGrant(current.parentGrantId());
            }
            return ActorChain.create(grant.subjectPrincipalId(), grant.delegatePrincipalId(), hops);
        }

        StandingChangeRequest standing(String commandId, String grantId, long revision) {
            return new StandingChangeRequest(new MutationContext(commandId, "principal-user", List.of("ref:evidence/mutation")),
                    grantId, revision, "ref:reason/test", List.of("ref:evidence/test"));
        }

        AdvanceGenerationRequest advance(String commandId, long generation) {
            return new AdvanceGenerationRequest(new MutationContext(commandId, "principal-user", List.of("ref:evidence/mutation")),
                    generation, "ref:reason/security", List.of("ref:evidence/security"));
        }

        CapabilityUseRequest use(CapabilityGrant grant, ActorChain chain, Instant at) {
            return new CapabilityUseRequest(grant.grantId(), grant.grantDigest(), chain, grant.delegatePrincipalId(),
                    "read", "resource:alpha", "purpose:learn", "audience:user", "target:one", at);
        }

        GrantBody copy(GrantBody b, String subject, String delegator, String delegate, String parentId, String parentDigest,
                String chainDigest, Set<String> actions, Set<String> resources, Set<String> purposes, Set<String> audiences,
                Set<String> targets, Instant from, Instant to, boolean maySubdelegate, int depth, long generation,
                String ceilingRef, String ceilingDigest) {
            return new GrantBody(b.grantId(), subject, delegator, delegate, parentId, parentDigest, chainDigest, actions,
                    resources, purposes, audiences, targets, from, to, maySubdelegate, depth, generation, ceilingRef,
                    ceilingDigest, b.authorityEvidenceRefs(), b.issuedAt());
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
}
