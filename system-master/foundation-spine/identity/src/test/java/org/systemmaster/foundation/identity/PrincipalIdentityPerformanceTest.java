package org.systemmaster.foundation.identity;

import static org.systemmaster.foundation.identity.IdentityContracts.*;
import java.nio.file.Files;
import java.util.List;
import java.util.Map;

public final class PrincipalIdentityPerformanceTest {
    public static void main(String[] args) throws Exception {
        var path=Files.createTempDirectory("identity-perf-").resolve("journal");
        var store=new IdentityJournalStore(path);
        var registry=new PrincipalRegistry(store,IdentityMutationGate.exactBootstrapActor("admin"));
        long start=System.nanoTime();
        int count=400;
        for(int i=0;i<count;i++){
            var ctx=new MutationContext("cmd-"+i,"admin",List.of("ref:perf-authority"));
            registry.registerPrincipal(new RegisterPrincipalRequest(ctx,"p"+i,new PrincipalKind("WORKLOAD"),PrincipalStatus.CANDIDATE,Map.of(),List.of("ref:root"),List.of("ref:perf-evidence")));
        }
        long elapsed=System.nanoTime()-start;
        var snapshot=store.load();
        if(snapshot.principals().size()!=count)throw new AssertionError("principal count mismatch");
        if(snapshot.journalRevision()!=count)throw new AssertionError("journal revision mismatch");
        double ms=elapsed/1_000_000.0;
        if(ms>20_000)throw new AssertionError("portable performance ceiling exceeded: "+ms+"ms");
        System.out.printf("PASS FOUNDATION_IDENTITY_OWP001_PERFORMANCE principals=%d elapsed_ms=%.3f journal_bytes=%d%n",count,ms,store.sizeBytes());
    }
}
