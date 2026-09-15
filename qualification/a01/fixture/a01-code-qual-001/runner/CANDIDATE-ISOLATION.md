# Candidate Isolation

The measured A-01 coding job must receive only the generated candidate package and candidate-visible metadata. It must not checkout the System Master repository and must not receive the hidden-evaluator artifact.

The hosted evaluator job receives the hidden evaluator only after the candidate artifact is frozen. The exact hidden inputs/outputs are generated per run with run-local randomness and do not exist in the repository before the run.
