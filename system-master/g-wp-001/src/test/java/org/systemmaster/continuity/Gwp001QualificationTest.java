package org.systemmaster.continuity;

import java.time.Instant;
import java.util.*;
import static org.systemmaster.continuity.ContinuityPolicyRegistry.*;

public final class Gwp001QualificationTest {
    static int n;
    public static void main(String[] args) {
        ContinuityPolicyRegistry r=new ContinuityPolicyRegistry();
        PolicyBody a=new PolicyBody("DOCUMENT","RESUMABLE","MILESTONE",3,4,"OWNER_HANDOFF","KEEP_30D");
        Instant t1=Instant.parse("2026-09-08T00:00:00Z"),t2=t1.plusSeconds(3600);
        var x=r.registerContinuityPolicy("CP-1",0,a,t1,"REQ-1"); e(1L,x.policy().version()); f(x.idempotentReplay()); e(CONTRACT_VERSION,x.policy().contractVersion()); t(x.policy().digest().matches("[0-9a-f]{64}"));
        var replay=r.registerContinuityPolicy("CP-1",0,a,t1,"REQ-1"); t(replay.idempotentReplay()); e(x.policy(),replay.policy());
        throwsRun(()->r.registerContinuityPolicy("CP-1",0,a,t2,"REQ-2"));
        throwsRun(()->r.registerContinuityPolicy("CP-1",1,new PolicyBody("DOCUMENT","RESUMABLE","OTHER",3,4,"OWNER_HANDOFF","KEEP_30D"),t2,"REQ-1"));
        PolicyBody b=new PolicyBody("DOCUMENT","RESUMABLE","MILESTONE_V2",2,2,"OWNER_HANDOFF","KEEP_60D"); var y=r.registerContinuityPolicy("CP-1",1,b,t2,"REQ-2");e(2L,y.policy().version());
        var current=r.getContinuityPolicy("DOCUMENT",null);e(Freshness.CURRENT,current.freshness());e(2L,current.version());e(y.policy().digest(),current.digest());
        var hist=r.getContinuityPolicy("DOCUMENT",t1.plusSeconds(1));e(Freshness.HISTORICAL,hist.freshness());e(1L,hist.version());e(x.policy().digest(),hist.digest());
        var unavailable=r.getContinuityPolicy("CODE",null);e(Freshness.UNAVAILABLE,unavailable.freshness());e(0L,unavailable.version());e(null,unavailable.policy());e(null,unavailable.digest());
        e(x.policy(),r.getPolicyVersion("CP-1",1));e(y.policy(),r.getPolicyVersion("CP-1",2));e(null,r.getPolicyVersion("CP-X",1));
        throwsRun(()->new PolicyBody("", "R","C",0,0,"H","R"));throwsRun(()->new PolicyBody("D","R","C",-1,0,"H","R"));throwsRun(()->new PolicyBody("D","R","C",0,-1,"H","R"));

        List<ContinuityGovernanceValidator.RequirementTrace> traces=new ArrayList<>();
        for(int i=1;i<=76;i++)traces.add(new ContinuityGovernanceValidator.RequirementTrace("G-RQ-"+String.format("%03d",i),List.of("G-RSCH-001"),"DD-G-001","021G","C","D","A","I","F","T","G-WP-001"));
        ContinuityGovernanceValidator.validateTraceability(traces,76); pass();
        var duplicate=new ArrayList<>(traces);duplicate.set(75,traces.get(0));throwsRun(()->ContinuityGovernanceValidator.validateTraceability(duplicate,76));
        throwsRun(()->ContinuityGovernanceValidator.validateTraceability(traces.subList(0,75),76));
        throwsRun(()->new ContinuityGovernanceValidator.RequirementTrace("G-X",List.of(),"D","O","C","S","A","I","F","T","W"));
        ContinuityGovernanceValidator.validateArchitectureClosureClaim(new ContinuityGovernanceValidator.StatusAxes(true,false,false,false,false));pass();
        throwsRun(()->ContinuityGovernanceValidator.validateArchitectureClosureClaim(new ContinuityGovernanceValidator.StatusAxes(true,true,false,false,false)));
        throwsRun(()->ContinuityGovernanceValidator.validateArchitectureClosureClaim(new ContinuityGovernanceValidator.StatusAxes(true,false,true,false,false)));
        throwsRun(()->ContinuityGovernanceValidator.validateArchitectureClosureClaim(new ContinuityGovernanceValidator.StatusAxes(true,false,false,true,false)));
        throwsRun(()->ContinuityGovernanceValidator.validateArchitectureClosureClaim(new ContinuityGovernanceValidator.StatusAxes(true,false,false,false,true)));
        throwsRun(()->ContinuityGovernanceValidator.validateArchitectureClosureClaim(new ContinuityGovernanceValidator.StatusAxes(false,false,false,false,false)));
        if(n!=35)throw new AssertionError("TEST_COUNT="+n);System.out.println("PASS G-WP-001 tests=35 requirements=2 trace_requirements=76");
    }
    static void e(Object a,Object b){n++;if(!Objects.equals(a,b))throw new AssertionError(a+" != "+b);} static void t(boolean v){n++;if(!v)throw new AssertionError();}static void f(boolean v){t(!v);}static void pass(){n++;}static void throwsRun(Runnable q){n++;try{q.run();throw new AssertionError("expected throw");}catch(AssertionError e){throw e;}catch(RuntimeException ok){}}
}
