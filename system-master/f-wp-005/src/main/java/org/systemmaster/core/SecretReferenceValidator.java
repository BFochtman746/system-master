package org.systemmaster.core;

import java.util.List;
import java.util.Objects;
import java.util.regex.Pattern;
import static org.systemmaster.core.GovernanceAuthorizationContracts.*;

public final class SecretReferenceValidator {
    private static final Pattern REF = Pattern.compile("^secretref://[A-Za-z0-9._/-]+$");
    private static final List<Pattern> PLAINTEXT_PATTERNS = List.of(
            Pattern.compile("(?i)(password|passwd|pwd)\\s*[:=]\\s*\\S+"),
            Pattern.compile("(?i)(api[_-]?key|secret|token)\\s*[:=]\\s*[A-Za-z0-9_\\-]{8,}"),
            Pattern.compile("-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----"));

    public SecretRef requireUsableReference(SecretRef ref) {
        Objects.requireNonNull(ref, "ref");
        if (ref.reference() == null || !REF.matcher(ref.reference()).matches()) {
            throw new SecurityException("INVALID_SECRET_REFERENCE");
        }
        if (ref.standing() != Standing.CURRENT) throw new SecurityException("SECRET_REFERENCE_NOT_CURRENT:" + ref.standing());
        if (blank(ref.secretClass()) || blank(ref.providerRef()) || blank(ref.versionRef())) {
            throw new SecurityException("INCOMPLETE_SECRET_REFERENCE_METADATA");
        }
        return ref;
    }

    public void rejectPlaintextSecrets(String... fields) {
        for (String field : fields) {
            if (field == null) continue;
            for (Pattern p : PLAINTEXT_PATTERNS) {
                if (p.matcher(field).find()) throw new SecurityException("PLAINTEXT_SECRET_REJECTED");
            }
        }
    }

    private static boolean blank(String value) { return value == null || value.isBlank(); }
}
