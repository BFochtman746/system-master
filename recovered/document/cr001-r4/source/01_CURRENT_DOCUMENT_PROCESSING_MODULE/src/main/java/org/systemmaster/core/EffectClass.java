package org.systemmaster.core;
public enum EffectClass {
 PURE(0), READ(1), DERIVED_WRITE(2), REVERSIBLE_WRITE(3), COMPENSATABLE_EXTERNAL_EFFECT(4), IRREVERSIBLE_EXTERNAL_EFFECT(5), SECURITY_SENSITIVE(6), PRIVILEGE_CHANGING(7);
 private final int rank; EffectClass(int rank){this.rank=rank;} public int rank(){return rank;}
 public boolean within(EffectClass ceiling){return this.rank<=ceiling.rank;}
}
