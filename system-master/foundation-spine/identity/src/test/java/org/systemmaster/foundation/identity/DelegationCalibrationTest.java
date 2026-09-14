package org.systemmaster.foundation.identity;

import static org.systemmaster.foundation.identity.DelegationRuntime.*;
import static org.systemmaster.foundation.identity.IdentityContracts.*;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

/** Pre-frozen hosted calibration: 128 grants, 512 canonical validations. */
public final class DelegationCalibrationTest {
    private static final int GRANTS = 128;
    private static final int VALIDATIONS = 512;
    private static final long REPLAY_LIMIT_MS = 15_000L;
    private static final long VALIDATION_LIMIT_MS = 15_000L;

    public static void main(String[] args) throws Exception {
        Path dir = Files.createTempDirectory("delegation-cal-");
        DelegationJournalStore store = new DelegationJournalStore(dir);
        Instant now = Instant.now();
        PrincipalAuthority principals = id -> new Principal(id, new PrincipalKind("SERVICE"), PrincipalStatus.ACTIVE,
                now.minusSeconds(3600), 1, List.of("ref:authority/cal"), List.of("ref:evidence/cal"));
        ReceiptAuthority receipts = new ReceiptAuthority() {
            @Override public ExternalAuthorizationReceipt externalAuthorization(String ref) {
                String digest = ref.substring(ref.lastIndexOf('/') + 1);
                return new ExternalAuthorizationReceipt(ref, digest, ReceiptStanding.CURRENT,
                        now.minusSeconds(1), now.plusSeconds(3600));
            }
            @Override public DelegationCeilingReceipt delegationCeiling(String ref) {
                String digest = ref.substring(ref.lastIndexOf('/') + 1);
                return new DelegationCeilingReceipt(ref, "ref:keel/calibration", sha256("keel-calibration"), digest,
                        ReceiptStanding.CURRENT, now.minusSeconds(1), now.plusSeconds(3600));
            }
        };
        DelegationService service = new DelegationService(store, principals, receipts, (context, action, target) -> { });
        ActorChain rootChain = ActorChain.create("principal-user", "principal-user", List.of());
        List<CapabilityGrant> grants = new ArrayList<>();
        for (int i = 0; i < GRANTS; i++) {
            String id = "grant-cal-" + i;
            GrantBody body = new GrantBody(id, "principal-user", "principal-user", "agent-" + i, null, null,
                    rootChain.chainDigest(), Set.of("read"), Set.of("resource:alpha"), Set.of("purpose:cal"),
                    Set.of("audience:cal"), Set.of("target:cal"), now.minusSeconds(5), now.plusSeconds(3600),
                    false, 0, 1, "ref:keel/calibration", sha256("keel-calibration"),
                    List.of("ref:evidence/cal"), now);
            String digest = digestGrant(body);
            String receiptRef = "ref:receipt/" + digest;
            MutationContext context = new MutationContext("command-cal-" + i, "principal-user", List.of("ref:evidence/cal"));
            grants.add(service.issue(new IssueGrantRequest(context, body, rootChain, receiptRef, receiptRef, 1)));
        }

        long replayStart = System.nanoTime();
        DelegationState replayed = new DelegationJournalStore(dir).load();
        long replayMs = (System.nanoTime() - replayStart) / 1_000_000L;
        if (replayed.grants().size() != GRANTS) throw new AssertionError("calibration replay grant count mismatch");
        if (replayMs > REPLAY_LIMIT_MS) throw new AssertionError("replay calibration exceeded " + REPLAY_LIMIT_MS + "ms: " + replayMs);

        long validationStart = System.nanoTime();
        for (int i = 0; i < VALIDATIONS; i++) {
            CapabilityGrant grant = grants.get(i % grants.size());
            DelegationHop hop = new DelegationHop(grant.grantId(), grant.grantDigest(), grant.delegatorPrincipalId(), grant.delegatePrincipalId());
            ActorChain chain = ActorChain.create(grant.subjectPrincipalId(), grant.delegatePrincipalId(), List.of(hop));
            service.validateUse(new CapabilityUseRequest(grant.grantId(), grant.grantDigest(), chain,
                    grant.delegatePrincipalId(), "read", "resource:alpha", "purpose:cal", "audience:cal", "target:cal", now));
        }
        long validationMs = (System.nanoTime() - validationStart) / 1_000_000L;
        if (validationMs > VALIDATION_LIMIT_MS) throw new AssertionError("validation calibration exceeded " + VALIDATION_LIMIT_MS + "ms: " + validationMs);

        System.out.println("PASS FOUNDATION_IDENTITY_DELEGATION_CALIBRATION grants=" + GRANTS
                + " validations=" + VALIDATIONS + " replay_ms=" + replayMs + " validation_ms=" + validationMs
                + " replay_limit_ms=" + REPLAY_LIMIT_MS + " validation_limit_ms=" + VALIDATION_LIMIT_MS);
    }
}
