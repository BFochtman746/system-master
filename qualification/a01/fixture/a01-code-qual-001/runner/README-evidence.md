# Evidence Bundle

A valid A01-CODE-QUAL-001 evaluation preserves, at minimum:

- seal metadata and exact SHA-256 identities;
- candidate start record;
- candidate freeze record;
- final Git diff and status;
- candidate runner log/event stream when available;
- visible-test output;
- hidden functional-evidence JSON;
- scope-discipline JSON;
- Java/Python/JavaScript coverage reports;
- Lizard complexity output;
- jscpd duplication output;
- machine-readable qualification receipt;
- SHA-256 digest over the raw evidence bundle.

Missing evidence does not silently become zero. It must be represented as unavailable/error evidence, and any field required by the qualification contract makes the run invalid until captured.
