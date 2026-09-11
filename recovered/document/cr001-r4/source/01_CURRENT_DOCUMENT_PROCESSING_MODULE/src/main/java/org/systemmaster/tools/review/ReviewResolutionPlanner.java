package org.systemmaster.tools.review;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/** Derives an application plan from append-only decisions without mutating review history. */
public final class ReviewResolutionPlanner {
    public record Plan(List<ReviewChange> accepted, List<ReviewChange> rejected, List<ReviewChange> unresolved, boolean finalizable) {
        public Plan { accepted=List.copyOf(accepted); rejected=List.copyOf(rejected); unresolved=List.copyOf(unresolved); }
    }

    public Plan plan(DocumentReviewGraph graph, ReviewDecisionLedger ledger) {
        Objects.requireNonNull(graph); Objects.requireNonNull(ledger);
        Map<String,ReviewDecisionLedger.State> states=ledger.states(); ArrayList<ReviewChange>a=new ArrayList<>(),r=new ArrayList<>(),u=new ArrayList<>();
        for(ReviewChange c:graph.changes()) switch(states.get(c.changeId())) {case ACCEPTED->a.add(c);case REJECTED->r.add(c);case OPEN,DEFERRED->u.add(c);}
        return new Plan(a,r,u,u.isEmpty());
    }
}
