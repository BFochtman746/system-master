package org.systemmaster.foundation.root;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import java.util.regex.Pattern;

/**
 * Canonical in-memory state machine for the Foundation & Spine System Root.
 *
 * This registry owns only authority identity/topology, owner mapping, lifecycle,
 * aliases and current version pointers. It deliberately does not own product
 * semantics, user intent, jobs, policy decisions, resource grants or evidence.
 */
public final class AuthorityRegistry {
    private static final Pattern ID = Pattern.compile("[A-Z][A-Z0-9_]{1,95}");
    private static final Pattern POINTER = Pattern.compile("[a-z][a-z0-9._-]{0,63}");

    public enum AuthorityKind {
        PRODUCT_ROOT_BINDING,
        SHARED_SYSTEM,
        FEDERATED_OVERLAY
    }

    public enum Lifecycle {
        ACTIVE,
        RETIRED
    }

    public record AuthorityRecord(
            String authorityId,
            String canonicalName,
            AuthorityKind kind,
            String ownerPath,
            String parentAuthorityId,
            Lifecycle lifecycle,
            Set<String> aliases,
            Map<String, String> currentPointers,
            String admissionAuthorityRef,
            long admittedRevision,
            Long retiredRevision) {
        public AuthorityRecord {
            authorityId = requireId(authorityId);
            canonicalName = requireText(canonicalName, "canonicalName");
            Objects.requireNonNull(kind, "kind");
            ownerPath = requireOwnerPath(ownerPath);
            parentAuthorityId = parentAuthorityId == null ? null : requireId(parentAuthorityId);
            Objects.requireNonNull(lifecycle, "lifecycle");
            aliases = Set.copyOf(normalizeAliases(aliases));
            currentPointers = Map.copyOf(normalizePointers(currentPointers));
            admissionAuthorityRef = requireText(admissionAuthorityRef, "admissionAuthorityRef");
            if (admittedRevision <= 0) throw new IllegalArgumentException("admittedRevision must be positive");
            if (lifecycle == Lifecycle.ACTIVE && retiredRevision != null) {
                throw new IllegalArgumentException("active authority cannot have retiredRevision");
            }
            if (lifecycle == Lifecycle.RETIRED && (retiredRevision == null || retiredRevision < admittedRevision)) {
                throw new IllegalArgumentException("retired authority requires valid retiredRevision");
            }
        }

        AuthorityRecord withPointer(String name, String value) {
            Map<String, String> next = new LinkedHashMap<>(currentPointers);
            next.put(requirePointerName(name), requireText(value, "pointerValue"));
            return new AuthorityRecord(authorityId, canonicalName, kind, ownerPath, parentAuthorityId,
                    lifecycle, aliases, next, admissionAuthorityRef, admittedRevision, retiredRevision);
        }

        AuthorityRecord withAlias(String alias) {
            Set<String> next = new LinkedHashSet<>(aliases);
            next.add(requireAlias(alias));
            return new AuthorityRecord(authorityId, canonicalName, kind, ownerPath, parentAuthorityId,
                    lifecycle, next, currentPointers, admissionAuthorityRef, admittedRevision, retiredRevision);
        }

        AuthorityRecord retired(long atRevision) {
            return new AuthorityRecord(authorityId, canonicalName, kind, ownerPath, parentAuthorityId,
                    Lifecycle.RETIRED, aliases, currentPointers, admissionAuthorityRef, admittedRevision, atRevision);
        }
    }

    public record Snapshot(long revision, Map<String, AuthorityRecord> authorities, Map<String, String> aliasIndex) {
        public Snapshot {
            if (revision < 0) throw new IllegalArgumentException("revision must be non-negative");
            authorities = Map.copyOf(authorities);
            aliasIndex = Map.copyOf(aliasIndex);
        }

        public Optional<AuthorityRecord> resolve(String token) {
            Objects.requireNonNull(token, "token");
            String trimmed = token.trim();
            if (trimmed.isEmpty()) return Optional.empty();
            String id = normalizePossibleId(trimmed);
            AuthorityRecord direct = id == null ? null : authorities.get(id);
            if (direct != null) return Optional.of(direct);
            String target = aliasIndex.get(normalizeAliasKey(trimmed));
            return target == null ? Optional.empty() : Optional.ofNullable(authorities.get(target));
        }

        public List<AuthorityRecord> active() {
            return authorities.values().stream()
                    .filter(a -> a.lifecycle() == Lifecycle.ACTIVE)
                    .sorted(Comparator.comparing(AuthorityRecord::authorityId))
                    .toList();
        }

        public List<AuthorityRecord> retired() {
            return authorities.values().stream()
                    .filter(a -> a.lifecycle() == Lifecycle.RETIRED)
                    .sorted(Comparator.comparing(AuthorityRecord::authorityId))
                    .toList();
        }

        public List<AuthorityRecord> childrenOf(String authorityId) {
            String parent = requireId(authorityId);
            return authorities.values().stream()
                    .filter(a -> parent.equals(a.parentAuthorityId()))
                    .sorted(Comparator.comparing(AuthorityRecord::authorityId))
                    .toList();
        }

        public Optional<AuthorityRecord> owner(String ownerPath) {
            String normalized = requireOwnerPath(ownerPath);
            return authorities.values().stream().filter(a -> a.ownerPath().equals(normalized)).findFirst();
        }
    }

    public sealed interface Command permits AdmitAuthority, AdvancePointer, AddAlias, RetireAuthority {
        String commandId();
        long expectedRevision();
        String canonicalMaterial();
    }

    public record AdmitAuthority(
            String commandId,
            long expectedRevision,
            String authorityId,
            String canonicalName,
            AuthorityKind kind,
            String ownerPath,
            String parentAuthorityId,
            Set<String> aliases,
            Map<String, String> initialPointers,
            String admissionAuthorityRef) implements Command {
        public AdmitAuthority {
            commandId = requireCommandId(commandId);
            requireExpectedRevision(expectedRevision);
            authorityId = requireId(authorityId);
            canonicalName = requireText(canonicalName, "canonicalName");
            Objects.requireNonNull(kind, "kind");
            ownerPath = requireOwnerPath(ownerPath);
            parentAuthorityId = parentAuthorityId == null ? null : requireId(parentAuthorityId);
            aliases = Set.copyOf(normalizeAliases(aliases));
            initialPointers = Map.copyOf(normalizePointers(initialPointers));
            admissionAuthorityRef = requireText(admissionAuthorityRef, "admissionAuthorityRef");
        }

        @Override public String canonicalMaterial() {
            return "ADMIT|" + authorityId + "|" + canonicalName + "|" + kind + "|" + ownerPath + "|"
                    + nullSafe(parentAuthorityId) + "|" + canonicalSet(aliases) + "|" + canonicalMap(initialPointers)
                    + "|" + admissionAuthorityRef;
        }
    }

    public record AdvancePointer(
            String commandId,
            long expectedRevision,
            String authorityId,
            String pointerName,
            String pointerValue) implements Command {
        public AdvancePointer {
            commandId = requireCommandId(commandId);
            requireExpectedRevision(expectedRevision);
            authorityId = requireId(authorityId);
            pointerName = requirePointerName(pointerName);
            pointerValue = requireText(pointerValue, "pointerValue");
        }

        @Override public String canonicalMaterial() {
            return "POINTER|" + authorityId + "|" + pointerName + "|" + pointerValue;
        }
    }

    public record AddAlias(
            String commandId,
            long expectedRevision,
            String authorityId,
            String alias) implements Command {
        public AddAlias {
            commandId = requireCommandId(commandId);
            requireExpectedRevision(expectedRevision);
            authorityId = requireId(authorityId);
            alias = requireAlias(alias);
        }

        @Override public String canonicalMaterial() {
            return "ALIAS|" + authorityId + "|" + alias;
        }
    }

    public record RetireAuthority(
            String commandId,
            long expectedRevision,
            String authorityId,
            String retirementAuthorityRef) implements Command {
        public RetireAuthority {
            commandId = requireCommandId(commandId);
            requireExpectedRevision(expectedRevision);
            authorityId = requireId(authorityId);
            retirementAuthorityRef = requireText(retirementAuthorityRef, "retirementAuthorityRef");
        }

        @Override public String canonicalMaterial() {
            return "RETIRE|" + authorityId + "|" + retirementAuthorityRef;
        }
    }

    public record ApplyResult(Snapshot snapshot, boolean changed, long appliedRevision) {}

    private final LinkedHashMap<String, AuthorityRecord> byId = new LinkedHashMap<>();
    private final LinkedHashMap<String, String> aliasToId = new LinkedHashMap<>();
    private final LinkedHashMap<String, String> ownerToId = new LinkedHashMap<>();
    private final LinkedHashMap<String, String> commandFingerprints = new LinkedHashMap<>();
    private long revision;

    public synchronized Snapshot snapshot() {
        return new Snapshot(revision, byId, aliasToId);
    }

    public synchronized Optional<AuthorityRecord> resolve(String token) {
        return snapshot().resolve(token);
    }

    public synchronized ApplyResult apply(Command command) {
        Objects.requireNonNull(command, "command");
        String fingerprint = commandFingerprint(command);
        String priorFingerprint = commandFingerprints.get(command.commandId());
        if (priorFingerprint != null) {
            if (!priorFingerprint.equals(fingerprint)) {
                throw new IllegalStateException("COMMAND_IDENTITY_COLLISION:" + command.commandId());
            }
            return new ApplyResult(snapshot(), false, revision);
        }
        if (command.expectedRevision() != revision) {
            throw new IllegalStateException("REVISION_CONFLICT:expected=" + command.expectedRevision() + ":actual=" + revision);
        }

        long nextRevision = revision + 1;
        if (command instanceof AdmitAuthority admit) {
            applyAdmit(admit, nextRevision);
        } else if (command instanceof AdvancePointer pointer) {
            applyPointer(pointer);
        } else if (command instanceof AddAlias alias) {
            applyAlias(alias);
        } else if (command instanceof RetireAuthority retire) {
            applyRetire(retire, nextRevision);
        } else {
            throw new IllegalArgumentException("unsupported command " + command.getClass().getName());
        }

        revision = nextRevision;
        commandFingerprints.put(command.commandId(), fingerprint);
        validateState();
        return new ApplyResult(snapshot(), true, revision);
    }

    synchronized void replay(Command command, long expectedAppliedRevision) {
        ApplyResult result = apply(command);
        if (!result.changed()) {
            throw new IllegalStateException("JOURNAL_DUPLICATE_COMMAND:" + command.commandId());
        }
        if (result.appliedRevision() != expectedAppliedRevision) {
            throw new IllegalStateException("JOURNAL_REVISION_MISMATCH:expected=" + expectedAppliedRevision
                    + ":actual=" + result.appliedRevision());
        }
    }

    private void applyAdmit(AdmitAuthority command, long nextRevision) {
        if (byId.containsKey(command.authorityId())) {
            throw new IllegalStateException("AUTHORITY_ALREADY_EXISTS:" + command.authorityId());
        }
        String idAsAlias = normalizeAliasKey(command.authorityId());
        if (aliasToId.containsKey(idAsAlias)) {
            throw new IllegalStateException("AUTHORITY_ID_COLLIDES_WITH_ALIAS:" + command.authorityId());
        }
        if (ownerToId.containsKey(command.ownerPath())) {
            throw new IllegalStateException("OWNER_ALREADY_BOUND:" + command.ownerPath());
        }

        if (command.kind() == AuthorityKind.PRODUCT_ROOT_BINDING) {
            if (command.parentAuthorityId() != null) {
                throw new IllegalStateException("PRODUCT_ROOT_BINDING_CANNOT_HAVE_PARENT");
            }
            boolean existingRoot = byId.values().stream().anyMatch(a -> a.kind() == AuthorityKind.PRODUCT_ROOT_BINDING);
            if (existingRoot) throw new IllegalStateException("PRODUCT_ROOT_BINDING_ALREADY_EXISTS");
        } else {
            if (command.parentAuthorityId() == null) {
                throw new IllegalStateException("NON_ROOT_AUTHORITY_REQUIRES_PARENT:" + command.authorityId());
            }
            AuthorityRecord parent = byId.get(command.parentAuthorityId());
            if (parent == null) throw new IllegalStateException("PARENT_AUTHORITY_MISSING:" + command.parentAuthorityId());
            if (parent.lifecycle() != Lifecycle.ACTIVE) {
                throw new IllegalStateException("PARENT_AUTHORITY_RETIRED:" + command.parentAuthorityId());
            }
        }

        for (String alias : command.aliases()) ensureAliasAvailable(alias, command.authorityId());
        AuthorityRecord record = new AuthorityRecord(command.authorityId(), command.canonicalName(), command.kind(),
                command.ownerPath(), command.parentAuthorityId(), Lifecycle.ACTIVE, command.aliases(),
                command.initialPointers(), command.admissionAuthorityRef(), nextRevision, null);
        byId.put(record.authorityId(), record);
        ownerToId.put(record.ownerPath(), record.authorityId());
        for (String alias : record.aliases()) aliasToId.put(normalizeAliasKey(alias), record.authorityId());
    }

    private void applyPointer(AdvancePointer command) {
        AuthorityRecord record = requireActive(command.authorityId());
        String existing = record.currentPointers().get(command.pointerName());
        if (command.pointerValue().equals(existing)) {
            throw new IllegalStateException("POINTER_ALREADY_CURRENT:" + command.authorityId() + ":" + command.pointerName());
        }
        byId.put(record.authorityId(), record.withPointer(command.pointerName(), command.pointerValue()));
    }

    private void applyAlias(AddAlias command) {
        AuthorityRecord record = requireActive(command.authorityId());
        String key = normalizeAliasKey(command.alias());
        String existingTarget = aliasToId.get(key);
        if (record.authorityId().equals(existingTarget)) {
            throw new IllegalStateException("ALIAS_ALREADY_BOUND:" + command.alias());
        }
        ensureAliasAvailable(command.alias(), command.authorityId());
        byId.put(record.authorityId(), record.withAlias(command.alias()));
        aliasToId.put(key, record.authorityId());
    }

    private void applyRetire(RetireAuthority command, long nextRevision) {
        AuthorityRecord record = requireActive(command.authorityId());
        List<String> activeChildren = byId.values().stream()
                .filter(a -> record.authorityId().equals(a.parentAuthorityId()))
                .filter(a -> a.lifecycle() == Lifecycle.ACTIVE)
                .map(AuthorityRecord::authorityId)
                .sorted()
                .toList();
        if (!activeChildren.isEmpty()) {
            throw new IllegalStateException("ACTIVE_CHILDREN_PREVENT_RETIREMENT:" + String.join(",", activeChildren));
        }
        byId.put(record.authorityId(), record.retired(nextRevision));
    }

    private AuthorityRecord requireActive(String authorityId) {
        AuthorityRecord record = byId.get(authorityId);
        if (record == null) throw new IllegalStateException("AUTHORITY_NOT_FOUND:" + authorityId);
        if (record.lifecycle() != Lifecycle.ACTIVE) throw new IllegalStateException("AUTHORITY_RETIRED:" + authorityId);
        return record;
    }

    private void ensureAliasAvailable(String alias, String targetId) {
        String key = normalizeAliasKey(alias);
        String possibleId = normalizePossibleId(alias);
        if (possibleId != null && byId.containsKey(possibleId) && !possibleId.equals(targetId)) {
            throw new IllegalStateException("ALIAS_COLLIDES_WITH_AUTHORITY_ID:" + alias);
        }
        String prior = aliasToId.get(key);
        if (prior != null && !prior.equals(targetId)) {
            throw new IllegalStateException("ALIAS_ALREADY_BOUND_TO_OTHER_AUTHORITY:" + alias + ":" + prior);
        }
    }

    public synchronized void validateState() {
        long rootCount = byId.values().stream().filter(a -> a.kind() == AuthorityKind.PRODUCT_ROOT_BINDING).count();
        if (byId.isEmpty()) {
            if (rootCount != 0) throw new IllegalStateException("EMPTY_REGISTRY_ROOT_INVARIANT");
            return;
        }
        if (rootCount != 1) throw new IllegalStateException("REGISTRY_REQUIRES_EXACTLY_ONE_PRODUCT_ROOT_BINDING:" + rootCount);

        Set<String> visitedOwners = new LinkedHashSet<>();
        for (AuthorityRecord record : byId.values()) {
            if (!visitedOwners.add(record.ownerPath())) {
                throw new IllegalStateException("DUPLICATE_OWNER_PATH:" + record.ownerPath());
            }
            if (record.kind() != AuthorityKind.PRODUCT_ROOT_BINDING) {
                AuthorityRecord parent = byId.get(record.parentAuthorityId());
                if (parent == null) throw new IllegalStateException("MISSING_PARENT:" + record.authorityId());
                if (record.lifecycle() == Lifecycle.ACTIVE && parent.lifecycle() == Lifecycle.RETIRED) {
                    throw new IllegalStateException("ACTIVE_CHILD_OF_RETIRED_PARENT:" + record.authorityId());
                }
            }
            for (String alias : record.aliases()) {
                String mapped = aliasToId.get(normalizeAliasKey(alias));
                if (!record.authorityId().equals(mapped)) {
                    throw new IllegalStateException("ALIAS_INDEX_MISMATCH:" + alias);
                }
            }
            assertNoParentCycle(record.authorityId());
        }
        for (Map.Entry<String, String> entry : ownerToId.entrySet()) {
            AuthorityRecord record = byId.get(entry.getValue());
            if (record == null || !record.ownerPath().equals(entry.getKey())) {
                throw new IllegalStateException("OWNER_INDEX_MISMATCH:" + entry.getKey());
            }
        }
    }

    private void assertNoParentCycle(String start) {
        Set<String> seen = new LinkedHashSet<>();
        String current = start;
        while (current != null) {
            if (!seen.add(current)) throw new IllegalStateException("AUTHORITY_PARENT_CYCLE:" + start);
            AuthorityRecord record = byId.get(current);
            current = record == null ? null : record.parentAuthorityId();
        }
    }

    public static String commandFingerprint(Command command) {
        Objects.requireNonNull(command, "command");
        String material = command.getClass().getSimpleName() + "|" + command.commandId() + "|"
                + command.expectedRevision() + "|" + command.canonicalMaterial();
        return sha256(material.getBytes(StandardCharsets.UTF_8));
    }

    private static String sha256(byte[] bytes) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
            StringBuilder out = new StringBuilder(digest.length * 2);
            for (byte b : digest) out.append(String.format("%02x", b));
            return out.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    private static String requireId(String value) {
        String normalized = requireText(value, "authorityId").toUpperCase(Locale.ROOT);
        if (!ID.matcher(normalized).matches()) throw new IllegalArgumentException("invalid authorityId: " + value);
        return normalized;
    }

    private static String normalizePossibleId(String value) {
        String normalized = value.trim().toUpperCase(Locale.ROOT);
        return ID.matcher(normalized).matches() ? normalized : null;
    }

    private static String requireOwnerPath(String value) {
        String normalized = requireText(value, "ownerPath");
        if (!normalized.equals("SYSTEM_MASTER") && !normalized.startsWith("SYSTEM_MASTER/")) {
            throw new IllegalArgumentException("ownerPath must remain under SYSTEM_MASTER: " + normalized);
        }
        if (normalized.contains("//") || normalized.endsWith("/")) {
            throw new IllegalArgumentException("invalid ownerPath: " + normalized);
        }
        return normalized;
    }

    private static String requireCommandId(String value) {
        String normalized = requireText(value, "commandId");
        if (normalized.length() > 160) throw new IllegalArgumentException("commandId too long");
        return normalized;
    }

    private static void requireExpectedRevision(long value) {
        if (value < 0) throw new IllegalArgumentException("expectedRevision must be non-negative");
    }

    private static String requirePointerName(String value) {
        String normalized = requireText(value, "pointerName").toLowerCase(Locale.ROOT);
        if (!POINTER.matcher(normalized).matches()) throw new IllegalArgumentException("invalid pointerName: " + value);
        return normalized;
    }

    private static String requireAlias(String value) {
        String alias = requireText(value, "alias");
        if (alias.length() > 160) throw new IllegalArgumentException("alias too long");
        return alias;
    }

    private static String normalizeAliasKey(String value) {
        return requireAlias(value).toLowerCase(Locale.ROOT);
    }

    private static Set<String> normalizeAliases(Set<String> aliases) {
        Objects.requireNonNull(aliases, "aliases");
        TreeMap<String, String> byKey = new TreeMap<>();
        for (String alias : aliases) {
            String normalized = requireAlias(alias);
            String prior = byKey.putIfAbsent(normalizeAliasKey(normalized), normalized);
            if (prior != null && !prior.equals(normalized)) {
                throw new IllegalArgumentException("duplicate alias ignoring case: " + alias);
            }
        }
        return new LinkedHashSet<>(byKey.values());
    }

    private static Map<String, String> normalizePointers(Map<String, String> pointers) {
        Objects.requireNonNull(pointers, "pointers");
        TreeMap<String, String> sorted = new TreeMap<>();
        for (Map.Entry<String, String> entry : pointers.entrySet()) {
            String name = requirePointerName(entry.getKey());
            String value = requireText(entry.getValue(), "pointerValue");
            if (sorted.putIfAbsent(name, value) != null) throw new IllegalArgumentException("duplicate pointer: " + name);
        }
        return sorted;
    }

    private static String requireText(String value, String field) {
        Objects.requireNonNull(value, field);
        String normalized = value.trim();
        if (normalized.isEmpty()) throw new IllegalArgumentException(field + " must not be blank");
        if (normalized.indexOf('\0') >= 0) throw new IllegalArgumentException(field + " contains NUL");
        return normalized;
    }

    private static String canonicalSet(Set<String> values) {
        return values.stream().sorted().reduce((a, b) -> a + "," + b).orElse("");
    }

    private static String canonicalMap(Map<String, String> values) {
        List<String> parts = new ArrayList<>();
        values.entrySet().stream().sorted(Map.Entry.comparingByKey())
                .forEach(e -> parts.add(e.getKey() + "=" + e.getValue()));
        return String.join(",", parts);
    }

    private static String nullSafe(String value) {
        return value == null ? "" : value;
    }
}
