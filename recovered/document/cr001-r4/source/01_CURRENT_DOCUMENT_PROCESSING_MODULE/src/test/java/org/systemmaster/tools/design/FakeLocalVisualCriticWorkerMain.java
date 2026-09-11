package org.systemmaster.tools.design;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;

public final class FakeLocalVisualCriticWorkerMain {
    public static void main(String[] args) {
        if (args.length != 2 || !args[0].equals("--image") || !Files.isRegularFile(Path.of(args[1]))) {
            System.err.println("invalid image argument");
            System.exit(2);
        }
        System.out.println("SCORES\t0.910000,0.920000,0.930000,0.940000,0.900000");
        System.out.println("FINDING\t" + Base64.getEncoder().encodeToString("SEMANTIC_IMAGE_CHECK_REQUIRED".getBytes(java.nio.charset.StandardCharsets.UTF_8)));
    }
}
