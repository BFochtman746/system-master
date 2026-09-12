package org.systemmaster.core;

import java.security.SecureRandom;
import java.time.InstantSource;
import java.util.Objects;
import java.util.UUID;
import java.util.regex.Pattern;

/** RFC 9562 UUIDv7 generation and canonical validation. */
public final class UuidV7 {
    private static final long MAX_EPOCH_MILLIS = 0xFFFFFFFFFFFFL;
    private static final long RAND_B_MASK = 0x3FFFFFFFFFFFFFFFL;
    private static final int MAX_RAND_A = 0x0FFF;
    private static final Pattern CANONICAL_TEXT = Pattern.compile(
            "^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$");
    private static final Generator SYSTEM_GENERATOR = new Generator(InstantSource.system(), new SecureRandom());

    private UuidV7() {
    }

    /** Creates a process-monotonic UUIDv7 using the system instant source. */
    public static UUID create() {
        return SYSTEM_GENERATOR.create();
    }

    /** Returns the embedded Unix epoch millisecond timestamp. */
    public static long epochMillis(UUID value) {
        requireVersionAndVariant(Objects.requireNonNull(value, "value"));
        return value.getMostSignificantBits() >>> 16;
    }

    /** Parses and validates the system's lowercase canonical UUIDv7 text representation. */
    public static UUID parseCanonical(String value) {
        Objects.requireNonNull(value, "value");
        if (!CANONICAL_TEXT.matcher(value).matches()) {
            throw new IllegalArgumentException("value must be canonical lowercase UUIDv7 text");
        }
        UUID parsed = UUID.fromString(value);
        requireVersionAndVariant(parsed);
        return parsed;
    }

    /** Validates and returns canonical lowercase UUIDv7 text. */
    public static String requireCanonical(String value, String name) {
        Objects.requireNonNull(name, "name");
        try {
            return parseCanonical(value).toString();
        } catch (IllegalArgumentException | NullPointerException exception) {
            throw new IllegalArgumentException(name + " must be canonical lowercase UUIDv7 text", exception);
        }
    }

    /** Creates an independently stateful generator for injected clocks and deterministic testing. */
    public static Generator generator(InstantSource instantSource) {
        return new Generator(instantSource, new SecureRandom());
    }

    static Generator generator(InstantSource instantSource, SecureRandom random) {
        return new Generator(instantSource, random);
    }

    private static void requireVersionAndVariant(UUID value) {
        if (value.version() != 7 || value.variant() != 2) {
            throw new IllegalArgumentException("not an RFC 9562 UUIDv7");
        }
    }

    private static UUID compose(long epochMillis, int randA, long randB) {
        if (epochMillis < 0 || epochMillis > MAX_EPOCH_MILLIS) {
            throw new IllegalArgumentException("epochMillis outside UUIDv7 48-bit range");
        }
        if (randA < 0 || randA > MAX_RAND_A) {
            throw new IllegalArgumentException("randA outside 12-bit range");
        }
        long msb = (epochMillis << 16) | (0x7L << 12) | randA;
        long lsb = 0x8000000000000000L | (randB & RAND_B_MASK);
        return new UUID(msb, lsb);
    }

    /** Stateful UUIDv7 generator with same-millisecond and clock-rollback monotonicity. */
    public static final class Generator {
        private final InstantSource instantSource;
        private final SecureRandom random;
        private long lastEpochMillis = -1;
        private int randA;

        private Generator(InstantSource instantSource, SecureRandom random) {
            this.instantSource = Objects.requireNonNull(instantSource, "instantSource");
            this.random = Objects.requireNonNull(random, "random");
        }

        /**
         * Generates a UUIDv7. Within this generator instance each returned UUID is strictly greater than the
         * previous UUID in byte/string order, including when multiple values are generated in one millisecond or
         * the observed clock moves backwards. Counter exhaustion advances the logical timestamp by one millisecond.
         */
        public synchronized UUID create() {
            long observedMillis = instantSource.instant().toEpochMilli();
            if (observedMillis < 0 || observedMillis > MAX_EPOCH_MILLIS) {
                throw new IllegalStateException("instant source outside UUIDv7 48-bit range");
            }

            if (lastEpochMillis < 0 || observedMillis > lastEpochMillis) {
                lastEpochMillis = observedMillis;
                randA = random.nextInt(MAX_RAND_A + 1);
            } else if (randA < MAX_RAND_A) {
                randA++;
            } else {
                if (lastEpochMillis == MAX_EPOCH_MILLIS) {
                    throw new IllegalStateException("UUIDv7 timestamp/counter space exhausted");
                }
                lastEpochMillis++;
                randA = random.nextInt(MAX_RAND_A + 1);
            }
            return compose(lastEpochMillis, randA, random.nextLong());
        }
    }
}
