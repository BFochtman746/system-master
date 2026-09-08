package org.systemmaster.continuity;

import java.util.List;

public final class LegacyRecoveryMigrationQualificationTest {
    private static int assertions=0;
    private static void ok(boolean v,String m){assertions++;if(!v)throw new AssertionError(m);}
    private static void eq(Object a,Object b,String m){assertions++;if(!java.util.Objects.equals(a,b))throw new AssertionError(m+" expected="+a+" actual="+b);}
    private static void throwsIt(Runnable r,String m){assertions++;try{r.run();throw new AssertionError(m);}catch(IllegalStateException|IllegalArgumentException expected){}}
    public static void main(String[] args){
        var svc=new LegacyRecoveryMigrationService((sys,id)->id.equals("amb")?new LegacyRecoveryMigrationService.Mapping(LegacyRecoveryMigrationService.MappingStanding.AMBIGUOUS,null,"two matches"):new LegacyRecoveryMigrationService.Mapping(LegacyRecoveryMigrationService.MappingStanding.MAPPED,"w-canonical","one match"));
        var imported=svc.importLegacyRecoveryState(new LegacyRecoveryMigrationService.LegacyBinding("legacy","old-1","hist-digest","archive:1"));
        ok(imported.imported(),"legacy crosswalk imports binding");eq("CROSSWALK_ONLY_NO_DUPLICATE_TRUTH",imported.disposition(),"no duplicate truth store");eq("hist-digest",imported.sourceDigest(),"legacy history immutable digest retained");
        var amb=svc.importLegacyRecoveryState(new LegacyRecoveryMigrationService.LegacyBinding("legacy","amb","hist-digest-2","archive:2"));eq("QUARANTINE_MANUAL_BINDING",amb.disposition(),"ambiguous migration quarantined");
        var ex=svc.exportRecoveryHistory("w-canonical",List.of(new LegacyRecoveryMigrationService.ExportEntry("event:1","ed1","AUDIT","prov:1")),"MINIMUM_NECESSARY");
        ok(ex.exportDigest()!=null&&!ex.exportDigest().isBlank(),"export integrity digest");eq("MINIMUM_NECESSARY",ex.minimizationPolicy(),"export minimization explicit");
        throwsIt(()->svc.exportRecoveryHistory("w-canonical",List.of(new LegacyRecoveryMigrationService.ExportEntry("event:1","ed1","AUDIT","secret=value")),"MINIMUM_NECESSARY"),"sensitive export rejected");
        System.out.println("ASSERTIONS="+assertions);
        System.out.println("PASS CONTINUITY-LEGACY-MIGRATION-EXPORT requirements=3");
    }
}
