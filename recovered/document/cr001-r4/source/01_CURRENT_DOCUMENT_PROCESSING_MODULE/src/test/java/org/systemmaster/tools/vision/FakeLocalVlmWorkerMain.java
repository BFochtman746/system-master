package org.systemmaster.tools.vision;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Base64;

public final class FakeLocalVlmWorkerMain {
    private FakeLocalVlmWorkerMain() {
    }

    public static void main(String[] args) throws Exception {
        if (args.length == 0 || !args[0].equals("adjudicate")) System.exit(2);
        Path output = null;
        for (int i = 1; i + 1 < args.length; i += 2) {
            if (args[i].equals("--output")) output = Path.of(args[i + 1]);
        }
        if (output == null) System.exit(3);
        String diag = Base64.getEncoder().encodeToString("FAKE_LOCAL_PROCESS_WORKER".getBytes(StandardCharsets.UTF_8));
        Files.writeString(output, "SELECT\t1\nCONFIDENCE\t0.91\nDIAG\t" + diag + "\n", StandardCharsets.UTF_8);
    }
}
