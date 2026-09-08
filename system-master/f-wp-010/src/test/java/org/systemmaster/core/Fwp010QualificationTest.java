package org.systemmaster.core;

import static org.systemmaster.core.CrossDomainContracts.*;
import java.time.Instant;
import java.util.EnumMap;

public final class Fwp010QualificationTest {
    private static int tests=0;
    private static final String D1="1111111111111111111111111111111111111111111111111111111111111111";
    private static final String D2="2222222222222222222222222222222222222222222222222222222222222222";
    private static final String D3="3333333333333333333333333333333333333333333333333333333333333333";
    private static final String D4="4444444444444444444444444444444444444444444444444444444444444444";
    private static final String D5="5555555555555555555555555555555555555555555555555555555555555555";
    private static final String D6="6666666666666666666666666666666666666666666666666666666666666666";
    private static final Instant T=Instant.parse("2026-09-08T04:30:00Z");

    public static void main(String[] args){
        ChangeSubject c=new ChangeSubject("CHG-10",10,D1,D2);
        ChangeCoordinatorAdapter a=new ChangeCoordinatorAdapter();
        ChangeCoordinatorAdapter.AdapterDecision dep=a.authorizeDeployment(c,D3,D4,"021S");
        yes(dep.allowed(),"021S deployment authorized"); eq("AUTHORIZED_FOR_021S_EXECUTION_ONLY",dep.disposition(),"deployment disposition"); eq(c.digest(),dep.subjectDigest(),"deployment change bound"); yes(dep.decisionDigest().matches("[0-9a-f]{64}"),"deployment decision digest");
        ChangeCoordinatorAdapter.AdapterDecision ownerMismatch=a.authorizeDeployment(c,D3,D4,"021F"); no(ownerMismatch.allowed(),"021F cannot own deployment mechanics"); eq("DEPLOYMENT_OWNER_MISMATCH",ownerMismatch.disposition(),"owner mismatch blocks");

        ProviderImpact pOk=new ProviderImpact("prov",Standing.ELIGIBLE,D1,D2,D3,T);
        yes(a.evaluateProviderImpact(c,pOk).allowed(),"provider eligible");
        eq("PROVIDER_RESTRICTED_REPLAN",a.evaluateProviderImpact(c,new ProviderImpact("prov",Standing.RESTRICTED,D1,D2,D3,T)).disposition(),"provider restricted");
        eq("PROVIDER_PROHIBITED",a.evaluateProviderImpact(c,new ProviderImpact("prov",Standing.PROHIBITED,D1,D2,D3,T)).disposition(),"provider prohibited");
        eq("PROVIDER_UNKNOWN_FAIL_CLOSED",a.evaluateProviderImpact(c,new ProviderImpact("prov",Standing.UNKNOWN,D1,D2,D3,T)).disposition(),"provider unknown");
        eq(D2,pOk.exitPlanDigest(),"provider exit implication retained"); eq(D3,pOk.concentrationDigest(),"provider concentration implication retained");

        ResourceAdmission admitted=new ResourceAdmission("adm",Admission.ADMITTED,D4,D5,T.plusSeconds(60));
        yes(a.evaluateResourceAdmission(c,admitted,T).allowed(),"resource admission current");
        eq("RESOURCE_DEFERRED_WAIT",a.evaluateResourceAdmission(c,new ResourceAdmission("adm2",Admission.DEFERRED,D4,D5,T.plusSeconds(60)),T).disposition(),"resource deferred");
        eq("RESOURCE_REJECTED",a.evaluateResourceAdmission(c,new ResourceAdmission("adm3",Admission.REJECTED,D4,D5,T.plusSeconds(60)),T).disposition(),"resource rejected");
        eq("RESOURCE_UNKNOWN_FAIL_CLOSED",a.evaluateResourceAdmission(c,new ResourceAdmission("adm4",Admission.UNKNOWN,D4,D5,T.plusSeconds(60)),T).disposition(),"resource unknown");
        eq("RESOURCE_ADMISSION_STALE",a.evaluateResourceAdmission(c,new ResourceAdmission("adm5",Admission.ADMITTED,D4,D5,T),T).disposition(),"resource expiry");

        ChangeIncidentCorrelator ic=new ChangeIncidentCorrelator();
        IncidentStanding none=new IncidentStanding("INC-1",IncidentCommand.NONE,"021U",D5,T);
        eq(ChangeIncidentCorrelator.ProgressDisposition.CONTINUE,ic.incidentPrecedence(none,false),"no incident command");
        eq(ChangeIncidentCorrelator.ProgressDisposition.MONITOR,ic.incidentPrecedence(new IncidentStanding("INC-1",IncidentCommand.MONITOR,"021U",D5,T),false),"monitor");
        eq(ChangeIncidentCorrelator.ProgressDisposition.HALT_FOR_CONTAINMENT,ic.incidentPrecedence(new IncidentStanding("INC-1",IncidentCommand.CONTAIN,"021U",D5,T),false),"contain precedence");
        eq(ChangeIncidentCorrelator.ProgressDisposition.HALT_FOR_FREEZE,ic.incidentPrecedence(new IncidentStanding("INC-1",IncidentCommand.FREEZE,"021U",D5,T),false),"freeze precedence");
        eq(ChangeIncidentCorrelator.ProgressDisposition.HALT_FOR_QUARANTINE,ic.incidentPrecedence(new IncidentStanding("INC-1",IncidentCommand.QUARANTINE,"021U",D5,T),true),"quarantine dominates emergency");
        eq(ChangeIncidentCorrelator.ProgressDisposition.MONITOR,ic.incidentPrecedence(new IncidentStanding("INC-1",IncidentCommand.CONTAIN,"021U",D5,T),true),"bounded emergency can continue under monitor");

        ChangeIncidentLink link=ic.correlate(c,new IncidentStanding("INC-9",IncidentCommand.MONITOR,"021U",D5,T));
        eq("INC-9",link.incidentId(),"incident id linked"); eq(c.digest(),link.changeDigest(),"exact change revision linked"); eq(D2,link.timelineDigest(),"execution timeline linked"); yes(link.correlationOnly(),"correlation only"); yes(link.linkDigest().matches("[0-9a-f]{64}"),"link digest");
        expect(() -> new ChangeIncidentLink("I",c.digest(),D2,D5,false,D6),"causation flag rejected");

        PostChangeReviewRef failed=ic.requestPostChangeReview(c,true,false,"INC-9","CA-1");
        eq("FAILED",failed.triggerClass(),"failed review trigger"); yes(failed.openObligation(),"failed review stays open"); eq("021U/021Z",failed.authorityOwner(),"review authority preserved");
        PostChangeReviewRef emergency=ic.requestPostChangeReview(c,false,true,null,null); eq("EMERGENCY",emergency.triggerClass(),"emergency review trigger");
        PostChangeReviewRef both=ic.requestPostChangeReview(c,true,true,"INC-9","CA-2"); eq("FAILED_EMERGENCY",both.triggerClass(),"failed emergency trigger");
        expect(() -> ic.requestPostChangeReview(c,false,false,null,null),"non-material review not fabricated");

        ChangeMetricsAdapter m=new ChangeMetricsAdapter("F-METRICS-1");
        MetricObservation lead=m.observed(MetricKind.LEAD_TIME,100,c,D6,T); eq(MetricKind.LEAD_TIME,lead.kind(),"lead time distinct"); eq(MetricStanding.OBSERVED,lead.standing(),"lead observed");
        MetricObservation exec=m.observed(MetricKind.EXECUTION_DURATION,200,c,D6,T); eq(MetricKind.EXECUTION_DURATION,exec.kind(),"execution duration distinct");
        MetricObservation fail=m.observed(MetricKind.CHANGE_ASSOCIATED_FAILURE,1,c,D6,T); eq(MetricKind.CHANGE_ASSOCIATED_FAILURE,fail.kind(),"failure association distinct"); no(m.mayAssertCausation(fail),"failure association not causation");
        MetricObservation recovery=m.observed(MetricKind.RECOVERY_TIME,300,c,D6,T); eq(MetricKind.RECOVERY_TIME,recovery.kind(),"recovery distinct");
        MetricObservation rework=m.observed(MetricKind.REWORK,2,c,D6,T); eq(MetricKind.REWORK,rework.kind(),"rework distinct");
        MetricObservation gap=m.gap(MetricKind.EXECUTION_DURATION,c,T); eq(MetricStanding.GAP,gap.standing(),"telemetry gap explicit"); eq(0L,gap.valueMillis(),"gap not fabricated value");
        EnumMap<MetricKind,MetricObservation> map=new EnumMap<>(MetricKind.class); map.put(lead.kind(),lead); map.put(exec.kind(),exec); map.put(fail.kind(),fail); map.put(recovery.kind(),recovery); map.put(rework.kind(),rework);
        eq(5,m.requireDistinctFamilies(map).size(),"five metric families retained");
        expect(() -> m.observed(MetricKind.LEAD_TIME,1,c,"bad",T),"bad telemetry digest rejected");
        expect(() -> new DeploymentBinding("B",c.digest(),D3,D4,"021S",-1),"invalid deployment revision rejected");

        if(tests!=47) throw new AssertionError("TEST_COUNT expected=47 actual="+tests);
        System.out.println("PASS F-WP-010 tests=47 requirements=7");
    }
    private static void eq(Object e,Object a,String m){tests++;if(!java.util.Objects.equals(e,a))throw new AssertionError(m+" expected="+e+" actual="+a);}
    private static void yes(boolean v,String m){tests++;if(!v)throw new AssertionError(m);}
    private static void no(boolean v,String m){tests++;if(v)throw new AssertionError(m);}
    private static void expect(Runnable r,String m){tests++;try{r.run();throw new AssertionError(m+" expected throw");}catch(AssertionError e){throw e;}catch(RuntimeException ok){}}
}
