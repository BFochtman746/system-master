import benchmark.RequestKey;

public class VisibleRequestKey {
    public static void main(String[] args) {
        String a = RequestKey.canonical(" r1 ", "  alpha\t beta\r\n gamma  ");
        if (!a.equals("r1:alpha beta gamma")) throw new AssertionError(a);
        String h1 = RequestKey.sha256("r1", "alpha beta");
        String h2 = RequestKey.sha256(" r1 ", " alpha\n\tbeta ");
        if (!h1.equals(h2) || !h1.matches("[0-9a-f]{64}")) throw new AssertionError("hash mismatch");
    }
}
