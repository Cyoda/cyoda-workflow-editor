---
"@cyoda/workflow-core": patch
---

Fix: a workflow file containing a very large array (from ~125k elements, about
260 KB — well under the 5 MB input cap) failed to load with a misleading
`operator-alias-conflict: Maximum call stack size exceeded` error, a regression
in 0.7.0. The legacy array-`value` scan, the schema-feature check and the
semantic validator's issue aggregation no longer spread input-sized arrays into
`push(...)` calls.
