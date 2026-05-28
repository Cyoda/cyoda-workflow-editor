# Simple Criterion — Specification for the Workflow Editor UI

> **Status**: Updated against cyoda-go source. Open-question section §10 now resolved.
> **Sources**: `cyoda help workflows`, `cyoda help search`, `cyoda help errors`, `cyoda help models`, OpenAPI 3.1 spec served at `http://localhost:8080/openapi.json`, **cyoda-go source tree at `/Users/patrick/dev/cyoda-go` (this is the binary running locally at v0.7.1)**.
> **Cyoda backend**: cyoda-go **v0.7.1** (commit 39e3266, built 2026-05-06), local sqlite backend, HTTP `:8080`, gRPC `:9090`, admin `127.0.0.1:9091`
> **OpenAPI spec version**: `info.version = "1.0"` (fixed spec format version, not binary version)
>
> **REALITY-FILTER labels**: Statements derived directly from CLI help text, the served OpenAPI document, or the cyoda-go source are unlabelled. Statements based on cross-source reconciliation are tagged `[Inference]`. Statements that could not be verified are tagged `[Unverified]` and grouped in §10.

---

## 1. Purpose

A **simple criterion** is one variant of the Cyoda `Condition` DSL used inside a workflow definition. It evaluates a single JSONPath expression against an entity's JSON payload, applies an operator, and compares it to a value. It is used in two places inside a workflow:

1. **Workflow-level** — `WorkflowDefinition.criterion`. Evaluated at entity creation to select which workflow attaches to the entity. `null` matches all entities.
2. **Transition-level** — `TransitionDefinition.criterion`. Evaluated before a transition runs (automated or manual). `null` matches unconditionally.

The simple criterion is the most common building block; it can also appear nested inside `group` and `array` conditions.

This document specifies the data shape, validation rules, operator catalogue, evaluation semantics, and known gaps that the editor UI must surface or guard against.

---

## 2. JSON Schema (wire format)

### 2.1 Required fields (per OpenAPI `SimpleConditionDto`)

```json
{
  "type": "simple",
  "jsonPath": "$.category",
  "operatorType": "EQUALS",
  "value": "physics"
}
```

OpenAPI `SimpleConditionDto.required = ["jsonPath", "operatorType", "type", "value"]`.

| Field          | JSON type             | Notes                                                                                                                                                                             |
|----------------|-----------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `type`         | string, constant      | Must equal `"simple"` (discriminator for the `oneOf` in `TransitionDefinitionDto.criterion` and `WorkflowConfigurationDto.criterion`).                                            |
| `jsonPath`     | string                | A JSONPath expression evaluated against the entity payload. Examples from docs: `"$.category"`, `"$.year"`, `"$.laureates[0].firstname"`.                                         |
| `operatorType` | string enum           | One of the operator strings in §3. The `cyoda help search` text also states the keys `operator` and `operation` are accepted as aliases on inbound JSON.                          |
| `value`        | `JsonNode` (any JSON) | Per OpenAPI, `value` has schema `JsonNode = { "type": "object" }` with no further constraints; per `cyoda help search`, the *documented* shape is "any JSON scalar". See §4.       |

### 2.2 Position inside the workflow document

```
WorkflowImportRequestDto
└── workflows: WorkflowConfigurationDto[]
    ├── criterion: oneOf[ Array | Function | Group | Lifecycle | Simple ]ConditionDto    ← workflow-level
    └── states: { [stateCode]: StateDefinitionDto }
        └── transitions: TransitionDefinitionDto[]
            └── criterion: oneOf[ Array | Function | Group | Lifecycle | Simple ]ConditionDto    ← transition-level
```

`SimpleConditionDto` may also appear nested under a `GroupConditionDto.conditions` array. Maximum nesting depth across the whole condition tree is **50** (rejected on import otherwise).

---

## 3. Operator catalogue

> **Discrepancy resolved against source.**
> The CLI help and the OpenAPI document disagreed on the operator catalogue. The cyoda-go source confirms the engine implements exactly **26 operators** in a canonical map at [`internal/domain/search/operators.go:33-60`](file:///Users/patrick/dev/cyoda-go/internal/domain/search/operators.go). The dispatch switch is at [`internal/match/operators.go:14-81`](file:///Users/patrick/dev/cyoda-go/internal/match/operators.go).
> The CLI help text says "27 operators" but actually lists 26 — the prose count is off by one; the list itself matches the source.
> The OpenAPI `SimpleConditionDto.operatorType` enum lists **66 values** (a superset that includes group operators, an `*_FIELD` family, an `*_PATTERN` family, and several legacy/aspirational operators) — 40 of these are **not implemented** at runtime. See §3.2.
> Unknown operators submitted to the HTTP search API are rejected at request time with `400 BAD_REQUEST` ([`internal/domain/search/handler.go:116-118`](file:///Users/patrick/dev/cyoda-go/internal/domain/search/handler.go); test [`handler_unknown_operator_test.go:18-41`](file:///Users/patrick/dev/cyoda-go/internal/domain/search/handler_unknown_operator_test.go)) — the error detail includes the canonical list.
> **For workflow criteria, operator validation happens at *evaluation time*, not at workflow-import time.** An invalid operator in a workflow criterion is persisted on import and only surfaces as an error when the entity hits that transition or workflow-selection step ([`internal/domain/workflow/engine.go:308-316`](file:///Users/patrick/dev/cyoda-go/internal/domain/workflow/engine.go)). The editor must therefore guard against bad operators client-side; the server will not catch them at import.

### 3.1 Operators verified by source (canonical, 26)

Operators in the order presented in `cyoda help search`. Behaviour text quoted from the CLI; semantics column expanded from the matcher source at [`internal/match/operators.go`](file:///Users/patrick/dev/cyoda-go/internal/match/operators.go).

| Operator             | Documented behaviour                                                                  | `value` shape (from CLI)            |
|----------------------|---------------------------------------------------------------------------------------|-------------------------------------|
| `EQUALS`             | exact equality; numeric-aware (JSON number vs string representation)                  | scalar                              |
| `NOT_EQUAL`          | inequality; inverse of `EQUALS`                                                       | scalar                              |
| `GREATER_THAN`       | numeric or lexicographic greater-than                                                 | scalar                              |
| `LESS_THAN`          | numeric or lexicographic less-than                                                    | scalar                              |
| `GREATER_OR_EQUAL`   | greater-than or equal                                                                 | scalar                              |
| `LESS_OR_EQUAL`      | less-than or equal                                                                    | scalar                              |
| `CONTAINS`           | substring or array-element containment                                                | scalar                              |
| `NOT_CONTAINS`       | inverse of `CONTAINS`                                                                 | scalar                              |
| `STARTS_WITH`        | string prefix match                                                                   | string scalar                       |
| `NOT_STARTS_WITH`    | inverse of `STARTS_WITH`                                                              | string scalar                       |
| `ENDS_WITH`          | string suffix match                                                                   | string scalar                       |
| `NOT_ENDS_WITH`      | inverse of `ENDS_WITH`                                                                | string scalar                       |
| `LIKE`               | SQL-style LIKE; `%` → `.*`, `_` → `.`, all other chars `regexp.QuoteMeta`-escaped, pattern wrapped with `^…$`. **No escape mechanism** — `\%` is not literal. | string scalar                       |
| `IS_NULL`            | field is absent **or** JSON `null` (`!result.Exists() \|\| result.Type == gjson.Null`)| irrelevant — value ignored, see §4.4|
| `NOT_NULL`           | inverse of `IS_NULL`                                                                  | irrelevant — value ignored, see §4.4|
| `BETWEEN`            | range check, **exclusive** bounds                                                     | two-element array `[low, high]`     |
| `BETWEEN_INCLUSIVE`  | range check, **inclusive** bounds                                                     | two-element array `[low, high]`     |
| `MATCHES_PATTERN`    | regex match via Go `regexp.MatchString` (**RE2** dialect). **No implicit anchoring** — user must include `^` / `$` themselves. | string scalar (regex)               |
| `IEQUALS`            | case-insensitive `EQUALS`                                                             | string scalar                       |
| `INOT_EQUAL`         | case-insensitive `NOT_EQUAL`                                                          | string scalar                       |
| `ICONTAINS`          | case-insensitive `CONTAINS`                                                           | string scalar                       |
| `INOT_CONTAINS`      | case-insensitive `NOT_CONTAINS`                                                       | string scalar                       |
| `ISTARTS_WITH`       | case-insensitive `STARTS_WITH`                                                        | string scalar                       |
| `INOT_STARTS_WITH`   | case-insensitive `NOT_STARTS_WITH`                                                    | string scalar                       |
| `IENDS_WITH`         | case-insensitive `ENDS_WITH`                                                          | string scalar                       |
| `INOT_ENDS_WITH`     | case-insensitive `NOT_ENDS_WITH`                                                      | string scalar                       |

### 3.2 Operators present in OpenAPI only — **VERIFIED NOT IMPLEMENTED**

These appear in the `SimpleConditionDto.operatorType` enum served at `/openapi.json` but the cyoda-go source confirms **none of them is implemented**. All produce a runtime error when reached:
- `IS_CHANGED` / `IS_UNCHANGED` — explicitly rejected with `"operator %s not implemented"` at [`internal/match/operators.go:75-76`](file:///Users/patrick/dev/cyoda-go/internal/match/operators.go).
- All others — fall through the dispatch switch to the default branch and return `"unknown operator"` ([`internal/match/operators.go:79`](file:///Users/patrick/dev/cyoda-go/internal/match/operators.go)).

The editor **must not** offer any of these:

```
OBJECT_EQUALS,
IBETWEEN_INCLUSIVE,
IMATCHES_PATTERN,
CONTAINS_PATTERN,    STARTS_WITH_PATTERN,    ENDS_WITH_PATTERN,
ICONTAINS_PATTERN,   ISTARTS_WITH_PATTERN,   IENDS_WITH_PATTERN,
REGEXP,              IREGEXP,
IN_SET,              NOT_IN_SET,
EQUALS_FIELD,        NOT_EQUAL_FIELD,        IEQUALS_FIELD,        INOT_EQUAL_FIELD,
GREATER_THAN_FIELD,  LESS_THAN_FIELD,        GREATER_OR_EQUAL_FIELD, LESS_OR_EQUAL_FIELD,
CONTAINS_FIELD,      STARTS_WITH_FIELD,      ENDS_WITH_FIELD,
ICONTAINS_FIELD,     ISTARTS_WITH_FIELD,     IENDS_WITH_FIELD,
NOT_CONTAINS_FIELD,  NOT_STARTS_WITH_FIELD,  NOT_ENDS_WITH_FIELD,
INOT_CONTAINS_FIELD, INOT_STARTS_WITH_FIELD, INOT_ENDS_WITH_FIELD,
AND, NOT, OR,
EQUAL_BY_ATTRIBUTES,
INSTANCE_OF,
IS_UNCHANGED, IS_CHANGED
```

Notes about the OpenAPI-only set:

- `AND`, `OR`, `NOT` are leaked group-operator strings. `AND` and `OR` are valid on `GroupCondition.operator` (not on simple). `NOT` is **not implemented anywhere** in the engine — neither for `SimpleCondition` nor for `GroupCondition` (the group dispatcher at [`internal/match/match.go:119-147`](file:///Users/patrick/dev/cyoda-go/internal/match/match.go) handles AND and OR only).
- `*_FIELD` family — not implemented; would have compared two field paths against each other had it been built.
- `IS_UNCHANGED` / `IS_CHANGED` — explicitly stubbed-out with a "not implemented" error; the engine has no mechanism for previous-version comparison exposed to criteria.
- `IN_SET` / `NOT_IN_SET`, `OBJECT_EQUALS`, `IBETWEEN_INCLUSIVE`, `IMATCHES_PATTERN`, the `*_PATTERN` family, `REGEXP`, `IREGEXP`, `EQUAL_BY_ATTRIBUTES`, `INSTANCE_OF` — none implemented.

---

## 4. `value` field — type rules

### 4.1 Wire-format type

OpenAPI: `value` ⇒ `JsonNode` ⇒ `{ "type": "object" }`. The generated Go type at [`api/generated.go`](file:///Users/patrick/dev/cyoda-go/api/generated.go) is `JsonNode = map[string]interface{}`. **However, the evaluators accept any JSON value (scalar, array, object) in practice** because the predicate parser deserialises into `interface{}` and the evaluator converts with `fmt.Sprintf("%v", expected)` / `toFloat64()` ([`internal/match/operators.go:87-261`](file:///Users/patrick/dev/cyoda-go/internal/match/operators.go)). The OpenAPI schema is therefore loose-but-misleading: editors must not constrain `value` to an object.

CLI: documents `value` as "any JSON scalar" for `SimpleCondition`. Two exceptions are documented:

- `BETWEEN`, `BETWEEN_INCLUSIVE` — `value` MUST be a two-element JSON array `[low, high]`.
- `IS_NULL`, `NOT_NULL` — `value` is irrelevant to the predicate; per CONDITION_TYPE_MISMATCH doc, these operators **bypass type checking entirely**.

### 4.2 Type compatibility with the locked model schema

When the criterion is evaluated against an entity of a `LOCKED` model, each field in the model has an inferred `DataType` (CLI lists examples `INTEGER`, `DOUBLE`, `BOOLEAN`, `STRING`). The `value` must be type-compatible:

- Numeric or boolean field + incompatible `value` type ⇒ `400 CONDITION_TYPE_MISMATCH`.
- String fields are **not** strictly enforced — any comparison value (numeric or string) is accepted to support lexicographic and coerced comparisons.
- `IS_NULL` / `NOT_NULL` ⇒ null values are compatible with any field type; type-checker bypassed.

### 4.3 Field-path validation

The `jsonPath` must resolve against the target model's locked schema (data-field paths only). Before execution, the server validates every data-field path; unknown paths produce `400 INVALID_FIELD_PATH` with the offending paths in the response detail. Lifecycle paths (`state`, `previousTransition`, etc.) and meta paths (`$._meta.*`) bypass this check — but those belong on a `LifecycleCondition`, not a `SimpleCondition`. **[Unverified]** whether a `SimpleCondition` referencing `$._meta.*` is accepted or rerouted.

### 4.4 Null / absent `value` for `IS_NULL` / `NOT_NULL`

OpenAPI marks `value` as required on `SimpleConditionDto`. The cyoda-go evaluator at [`internal/match/operators.go:83-85`](file:///Users/patrick/dev/cyoda-go/internal/match/operators.go) ignores `value` entirely for these operators (it only checks `actual.Exists()` / `actual.Type == gjson.Null`). The condition-type validator at [`internal/domain/search/condition_type_validate.go:15-18`](file:///Users/patrick/dev/cyoda-go/internal/domain/search/condition_type_validate.go) lists `IS_NULL` and `NOT_NULL` in `skipTypeCheckOperators`, so the `value` is not type-checked against the model schema either.

**Editor recommendation:** emit `"value": null` to satisfy the OpenAPI `required` constraint. The engine accepts any JSON value here and discards it.

---

## 5. `jsonPath` field — semantics

The cyoda-go engine **does not run a full JSONPath parser**. It uses [`tidwall/gjson`](https://github.com/tidwall/gjson) with a thin translation layer.

**Translation** ([`internal/match/match.go:40-59`](file:///Users/patrick/dev/cyoda-go/internal/match/match.go)):
- `$.` prefix is stripped (e.g. `$.year` → `year`).
- Bare `$` becomes the empty string and addresses the root.
- `[*]` array wildcards are rewritten to gjson's `#` notation (e.g. `$.items[*].name` → `items.#.name`).
- Repeated dots are collapsed to prevent corrupted paths.

**Evaluation semantics** ([`internal/match/match.go:67-69`](file:///Users/patrick/dev/cyoda-go/internal/match/match.go)):
- Resolved value: a `gjson.Result`. Operators consume `.String()`, `.Float()`, `.Type`, `.Exists()`.
- Array wildcards iterate elements and combine results with **OR** semantics (the condition is true if *any* element matches) via `matchArrayWildcard()`.
- Missing paths produce `result.Exists() == false`. `IS_NULL` is true; most other operators return false.

| Feature                       | Status                                                                                                |
|-------------------------------|-------------------------------------------------------------------------------------------------------|
| `$.field`, `$.a.b.c`          | Supported (verified)                                                                                  |
| Array index `$.list[0].x`     | Supported (verified)                                                                                  |
| Array wildcard `$.list[*].x`  | Supported, OR semantics across elements (verified)                                                    |
| Bare `$` root                 | Supported (verified)                                                                                  |
| Filter `$.list[?(@.x==1)]`    | **Not** documented or tested. `[Inference]` gjson supports a similar query syntax (`#(x==1)`) but the `$.` translation does not rewrite filter expressions, so JSONPath-style filters likely fail silently. Do **not** offer in the editor. |
| Recursive descent `$..x`      | **Not** documented or tested. The translator does not rewrite `..` (it collapses repeated dots), so this almost certainly does not work as JSONPath. Do **not** offer in the editor. |
| Schema validation of path     | At search time only — workflow import does **not** validate paths against the model schema. The locked-model path check (`INVALID_FIELD_PATH`) runs in the search path; for workflow criteria the path is only "validated" by whether it resolves at evaluation time. |
| Lifecycle paths in SimpleCondition | Strict separation. SimpleCondition data path resolution treats `$._meta.state` as a literal field named `_meta` in entity data; lifecycle metadata is only accessible via `LifecycleCondition` ([`internal/match/match.go:18-19` vs `:98-117`](file:///Users/patrick/dev/cyoda-go/internal/match/match.go)). |

The editor should:
- Validate path syntax with a permissive JSONPath parser, but only allow the **supported subset** above when building the path (no filter / recursive-descent UI controls).
- Surface server-side `INVALID_FIELD_PATH` errors back into the form for the search use case.
- For workflow-criterion use, warn users that path typos will not be caught at import — they will only surface at runtime as criterion-evaluation failures.

---

## 6. Evaluation semantics (workflow context)

From `cyoda help workflows`:

| Context                            | Empty / `null` criterion         | Multiple criteria                                                          |
|------------------------------------|----------------------------------|----------------------------------------------------------------------------|
| `WorkflowDefinition.criterion`     | `null` matches every entity      | Engine picks the **first** workflow whose criterion matches; if none, the built-in default workflow is used. |
| `TransitionDefinition.criterion`   | `null` ⇒ always available (manual) or always fires (automated)         | Engine selects the **first** automated transition (by declaration order) whose criterion matches.            |

Important authoring rule (verified): *"A `null`-criterion automated transition must be the last automated transition in declaration order; any automated transitions declared after a `null`-criterion transition are unreachable."* The editor should warn when a non-null criterion follows a null-criterion automated transition within the same state.

Static cycle detection at import time can reject the whole workflow (`400 VALIDATION_FAILED`). This is a workflow-level concern but the editor should be aware: simple-criterion changes that flip a guarded automated transition to always-fire may convert a previously valid workflow into a cyclic one.

---

## 7. Validation behaviour and error model

### 7.1 Validation timing — important asymmetry

There are **two different validation regimes** depending on where the criterion is submitted:

| Submission path                                    | Operator name check | jsonPath schema check | Value type check    | When errors surface |
|----------------------------------------------------|---------------------|-----------------------|---------------------|---------------------|
| `POST /search/direct` & `POST /search/async`       | At request time     | At request time       | At request time     | HTTP response       |
| Workflow import (`POST /model/.../workflow/import`)| **None**            | **None**              | **None**            | Only at evaluation time — when an entity hits the criterion |

The search handler calls `ValidateCondition()` ([`internal/domain/search/handler.go:116`](file:///Users/patrick/dev/cyoda-go/internal/domain/search/handler.go)) before execution. The workflow importer ([`internal/domain/workflow/import.go`](file:///Users/patrick/dev/cyoda-go/internal/domain/workflow/import.go)) does **not** call this — the only static check at import is cycle detection.

The editor must therefore enforce the operator-name and path-syntax constraints **client-side** for workflow criteria, since the server will accept a workflow with an invalid criterion and silently store it. Failures will only show up later as runtime workflow errors, far from the authoring action.

### 7.2 Errors the editor must handle

| HTTP / `errorCode`              | Cause                                                                    | UI handling                                                              |
|---------------------------------|--------------------------------------------------------------------------|--------------------------------------------------------------------------|
| `400 BAD_REQUEST`               | Malformed JSON, missing required field, unsupported `operatorType` (search path)   | Show the response `detail`; engine includes canonical operator list. |
| `400 INVALID_FIELD_PATH`        | `jsonPath` not present in locked schema (search path)                    | Highlight the `jsonPath` field; show offending paths from response.      |
| `400 CONDITION_TYPE_MISMATCH`   | `value` JSON type incompatible with locked field DataType (search path)  | Highlight the `value` field; show the expected DataType.                 |
| `400 VALIDATION_FAILED`         | Workflow-import static analysis (cycle detection only)                   | Workflow-level error, not criterion-level — surface at workflow scope.   |
| Runtime workflow error          | Unknown operator / unresolvable path in a workflow criterion             | No HTTP error at import time; appears in audit log / entity creation/transition response when triggered. |

Error responses follow RFC 9457 Problem Details (`application/problem+json`). Error code is in `properties.errorCode`. Programmatic clients should branch on `errorCode`, not on HTTP `400`, to distinguish these cases.

### 7.3 Operator-name case sensitivity

The dispatcher at [`internal/match/operators.go:14-81`](file:///Users/patrick/dev/cyoda-go/internal/match/operators.go) uses a Go `switch` over the raw string with **uppercase keys** and **no `strings.ToUpper`** normalisation. Lowercase or mixed-case operator names are rejected as unknown. The editor must always emit uppercase.

---

## 8. Worked examples

### 8.1 Workflow-level selection

```json
{
  "version": "1",
  "name": "physics-prizes",
  "initialState": "NEW",
  "active": true,
  "criterion": {
    "type": "simple",
    "jsonPath": "$.category",
    "operatorType": "EQUALS",
    "value": "physics"
  },
  "states": { "NEW": { "transitions": [] } }
}
```

### 8.2 Automated transition guard

```json
{
  "name": "AUTO_VALIDATE",
  "next": "VALIDATED",
  "manual": false,
  "disabled": false,
  "criterion": {
    "type": "simple",
    "jsonPath": "$.year",
    "operatorType": "EQUALS",
    "value": "2024"
  },
  "processors": []
}
```

### 8.3 Range check (verified shape)

```json
{
  "type": "simple",
  "jsonPath": "$.score",
  "operatorType": "BETWEEN_INCLUSIVE",
  "value": [0, 100]
}
```

### 8.4 Null check

```json
{
  "type": "simple",
  "jsonPath": "$.archived_at",
  "operatorType": "IS_NULL",
  "value": null
}
```

(`value: null` chosen to satisfy the OpenAPI `required` constraint; see §4.4.)

---

## 9. Editor UI implications

The simple-criterion editor must capture three fields:

1. **JSONPath input.** Free-text with a JSONPath syntax check. Provide an autocompletion source if a model schema is available — paths can be discovered from `GET /api/model/{name}/{version}` and from the SAMPLE_DATA export under `dataTypes`. **[Unverified]** how the workflow editor obtains the active `(entityName, modelVersion)` context — assumes the workflow editor already knows the target model.

2. **Operator selector.** A dropdown sourced from §3.1 (27 operators). Group visually:
   - Equality: `EQUALS`, `NOT_EQUAL`, `IEQUALS`, `INOT_EQUAL`
   - Ordering: `GREATER_THAN`, `LESS_THAN`, `GREATER_OR_EQUAL`, `LESS_OR_EQUAL`
   - Range: `BETWEEN`, `BETWEEN_INCLUSIVE`
   - Substring: `CONTAINS`, `NOT_CONTAINS`, `STARTS_WITH`, `NOT_STARTS_WITH`, `ENDS_WITH`, `NOT_ENDS_WITH` (plus case-insensitive `I…` variants)
   - Pattern: `LIKE`, `MATCHES_PATTERN`
   - Null: `IS_NULL`, `NOT_NULL`

3. **Value input.** Driven by the operator:
   - For `BETWEEN` / `BETWEEN_INCLUSIVE` ⇒ two inputs (low, high) producing a two-element JSON array.
   - For `IS_NULL` / `NOT_NULL` ⇒ hide the value input; emit `"value": null` to satisfy the OpenAPI `required` constraint (the engine ignores the value).
   - For `LIKE` ⇒ string input; surface help text describing `%` (any sequence) and `_` (any single char). **Warn explicitly that there is no escape mechanism** — a literal `%` or `_` in the pattern will be treated as a wildcard. Pattern is anchored `^…$` server-side.
   - For `MATCHES_PATTERN` ⇒ string input; this is Go's **RE2** dialect (no backreferences, no lookaround). **No implicit anchoring** — if the user wants whole-string matching, they must include `^…$` themselves.
   - For `CONTAINS` / `NOT_CONTAINS` and case-insensitive variants ⇒ string input; note that on object-typed fields the match is against the JSON serialisation, which is rarely what users intend.
   - For all others ⇒ a typed input. If the locked-model DataType is known for the chosen `jsonPath`, render an appropriate widget (number, boolean, string); otherwise render a generic JSON-scalar input.

Additional editor concerns:

- **Client-side validation is the only safety net for workflow criteria.** The server does **not** validate operator names or JSON paths in workflow criteria at import time (§7.1). The editor must validate the operator (against §3.1), the path syntax, and — where the model schema is available — the value type before allowing save. Failing this, malformed criteria persist silently and only surface as runtime errors when an entity hits the transition.
- **Workflow-context warning.** When a criterion is attached to a non-final automated transition that previously had `null`, warn that downstream null-criterion automated transitions become reachable only via this criterion.
- **Cross-source warnings.** If a workflow export contains an `operatorType` outside §3.1, surface it read-only and warn (don't silently drop or rewrite — preserve round-trip integrity for editing existing workflows that may pre-date this validation).
- **Operator-name casing.** Always emit uppercase; the dispatcher rejects mixed-case (§7.3).
- **Surface server errors.** Run client-side checks first, then for search-context use surface server `errorCode` (`BAD_REQUEST`, `INVALID_FIELD_PATH`, `CONDITION_TYPE_MISMATCH`). For workflow-context use, also tail the workflow audit log when criteria evaluate at runtime — that is where workflow-criterion failures appear.

---

## 10. Open questions — resolved against cyoda-go source

The original draft listed 15 open questions. After analysing `/Users/patrick/dev/cyoda-go` they resolve as follows. Items that remain `[Unverified]` are flagged at the end.

| # | Original question                                  | Resolution |
|---|----------------------------------------------------|------------|
| 1 | Authoritative operator list (CLI 27 vs OpenAPI 65) | **Resolved.** 26 operators implemented; canonical map at [`internal/domain/search/operators.go:33-60`](file:///Users/patrick/dev/cyoda-go/internal/domain/search/operators.go). All OpenAPI-only operators verified as not implemented. CLI text mis-counts (says 27, lists 26). |
| 2 | Case sensitivity of `operatorType`                 | **Resolved.** Case-sensitive; uppercase only. No `ToUpper` in the dispatcher. |
| 3 | `operator` / `operation` aliases                   | **Partially resolved.** The CLI docs assert the alias; the alias is handled by `predicate.ParseCondition()` in the external `cyoda-go-spi` package (not in the cyoda-go tree). `[Inference]` accepted by deserialisation but not separately verified end-to-end. |
| 4 | JSONPath dialect                                   | **Resolved.** Custom translation to `tidwall/gjson` ([`internal/match/match.go:40-59`](file:///Users/patrick/dev/cyoda-go/internal/match/match.go)). Supported: dot access, index, `[*]` wildcard, bare `$`. Filters and recursive descent **not supported** in the translation layer. |
| 5 | `MATCHES_PATTERN` regex flavour                    | **Resolved.** Go `regexp` package — RE2 dialect. No implicit anchoring ([`internal/match/operators.go:210-216`](file:///Users/patrick/dev/cyoda-go/internal/match/operators.go)). |
| 6 | `LIKE` escaping                                    | **Resolved.** No escape mechanism. `%` → `.*`, `_` → `.`, all other chars literal via `regexp.QuoteMeta`, pattern wrapped `^…$` ([`internal/match/operators.go:218-241`](file:///Users/patrick/dev/cyoda-go/internal/match/operators.go)). Editor should warn that `%` and `_` cannot appear literally. |
| 7 | `CONTAINS` on objects                              | **Resolved.** Implemented by serialising the gjson result to its JSON string form and doing substring containment ([`internal/match/operators.go:171-182`](file:///Users/patrick/dev/cyoda-go/internal/match/operators.go)). Surprising but well-defined. |
| 8 | `EQUALS` numeric coercion                          | **Resolved.** If the entity field is `gjson.Number` and `value` is convertible via `toFloat64` (handles float64/float32/int/int64/json.Number/string), compares as float64. Otherwise string equality ([`internal/match/operators.go:87-102, 244-261`](file:///Users/patrick/dev/cyoda-go/internal/match/operators.go)). Note: `"2024" EQUALS 2024` will compare as floats (true); `"02024" EQUALS 2024` will also compare as floats (true) — leading-zero coercion is *not* preserved. |
| 9 | `value` required for `IS_NULL` / `NOT_NULL`        | **Resolved.** Evaluator ignores `value`; type-validator skips it. OpenAPI marks it required — emit `"value": null` to satisfy schema. |
| 10 | `*_FIELD` operator semantics                      | **Resolved.** Not implemented. |
| 11 | `IS_UNCHANGED` / `IS_CHANGED` semantics           | **Resolved.** Stubbed-out with explicit "not implemented" error. |
| 12 | `SimpleCondition` on lifecycle fields             | **Resolved.** Strict separation — lifecycle metadata is only accessible via `LifecycleCondition`. SimpleCondition resolves `$._meta.state` as a literal data field named `_meta` (which doesn't exist) and fails to match. |
| 13 | `JsonNode` loose typing in OpenAPI                | **Resolved.** Generated Go type is `map[string]interface{}` but the predicate parser deserialises into `interface{}`, so scalars work at runtime. The OpenAPI schema is loose-but-misleading. Editor must not constrain `value` to an object. |
| 14 | `oneOf` discriminator on criterion field          | **Partially resolved.** The OpenAPI `oneOf` has no `discriminator` block; the `type` discriminator lives on the abstract base. Runtime discrimination is by the `type` field via the predicate parser. Editor-side code-gen tools that ignore allOf discriminators will need a manual switch. `[Inference]` no further runtime probe performed. |
| 15 | Editor integration for model schema autocompletion | **Unresolved — outside cyoda-go scope.** The model schema is available via `GET /api/model/{entityName}/{modelVersion}/export` (SAMPLE_DATA or JSON_SCHEMA converter). Wiring this into the existing `workflow-react` package is a UI-architecture decision; this spec leaves it as a UI implementation task. |

### 10.1 Remaining `[Unverified]` items

- **Q3 alias handling** — Live confirmation that `operator` and `operation` are accepted by the predicate parser would require either reading the `cyoda-go-spi` source (separate module) or an end-to-end probe. Editor should always emit `operatorType` and not rely on the aliases.
- **Q14 oneOf discriminator** — OpenAPI code generators may produce clients that do not correctly serialise the polymorphic `criterion` field. Verify the `workflow-react` generated client handles `"type": "simple"` discrimination before relying on it.
- **`NOT` group operator** — verified not implemented for either simple or group conditions in this codebase. If a future cyoda-go version adds NOT, the editor will need to surface it; today, do not offer it.

### 10.2 New facts discovered while answering the open questions

- **Workflow import does not validate criteria.** This is the biggest behavioural surprise. Operator names, JSONPath, and value types in workflow criteria are validated **only** at evaluation time. Static checks at import are limited to cycle detection. The editor is the only safety net before runtime; it must do all the validation that the server would do for a search.
- **Operator name dispatching is two-tiered.** The search handler runs `ValidateCondition()` against the canonical map *before* dispatching to the matcher. The workflow engine skips this step and goes straight to the matcher. Both paths use the same `match.Match()` function, so behaviour is otherwise identical.
- **Group `NOT` is firmly not supported.** The group dispatcher at [`internal/match/match.go:119-147`](file:///Users/patrick/dev/cyoda-go/internal/match/match.go) handles AND and OR only — confirming the CLI docs even though the OpenAPI enum mentions NOT.

---

## 11. References used

### 11.1 Documentation sources
- `cyoda help workflows` (local, v0.7.1) — workflow definition, criterion fields, transition rules
- `cyoda help search` (local, v0.7.1) — Condition DSL, operator canonical list, value semantics
- `cyoda help errors BAD_REQUEST` / `INVALID_FIELD_PATH` / `CONDITION_TYPE_MISMATCH` (local, v0.7.1)
- `cyoda help models` (local, v0.7.1) — locked-schema lifecycle, DataType inference, JSON_SCHEMA export
- `GET http://localhost:8080/openapi.json` (running v0.7.1 service) — `SimpleConditionDto`, `TransitionDefinitionDto`, `WorkflowConfigurationDto`, `WorkflowImportRequestDto`, `JsonNode`
- Web documentation index: https://docs.cyoda.net/llms.txt — *not fetched*; the local CLI plus source tree were authoritative for this draft.

### 11.2 cyoda-go source (the binary running locally at v0.7.1)

The following files are the ground truth for every "verified" claim in this document:

- [`internal/domain/search/operators.go:33-60`](file:///Users/patrick/dev/cyoda-go/internal/domain/search/operators.go) — canonical operator map (the authoritative list of 26).
- [`internal/match/operators.go`](file:///Users/patrick/dev/cyoda-go/internal/match/operators.go) — operator dispatcher (`:14-81`) and per-operator evaluators (`opEquals`, `opMatchesPattern`, `opLike`, etc.).
- [`internal/match/match.go`](file:///Users/patrick/dev/cyoda-go/internal/match/match.go) — top-level matcher, JSONPath→gjson translation (`:40-59`), simple/lifecycle/group dispatch (`:18-19, :98-117, :119-147`), array-wildcard handling (`:67-69`).
- [`internal/domain/search/condition_type_validate.go:15-18`](file:///Users/patrick/dev/cyoda-go/internal/domain/search/condition_type_validate.go) — `skipTypeCheckOperators` (IS_NULL, NOT_NULL).
- [`internal/domain/search/handler.go:116-118`](file:///Users/patrick/dev/cyoda-go/internal/domain/search/handler.go) — search-time `ValidateCondition()` call site that returns BAD_REQUEST with the canonical list.
- [`internal/domain/search/handler_unknown_operator_test.go`](file:///Users/patrick/dev/cyoda-go/internal/domain/search/handler_unknown_operator_test.go) — test verifying unknown-operator BAD_REQUEST behaviour and IS_NULL with null value.
- [`internal/domain/workflow/import.go`](file:///Users/patrick/dev/cyoda-go/internal/domain/workflow/import.go) — workflow importer (does **not** call ValidateCondition).
- [`internal/domain/workflow/engine.go:308-316`](file:///Users/patrick/dev/cyoda-go/internal/domain/workflow/engine.go) — `evaluateCriterion()`: parses and matches at runtime, no static check.
- [`api/generated.go`](file:///Users/patrick/dev/cyoda-go/api/generated.go) — generated DTOs including `SimpleConditionDtoOperatorType` (66-value enum) and `JsonNode = map[string]interface{}`.

### 11.3 Out-of-tree dependency
- `cyoda-go-spi.predicate.ParseCondition()` — handles JSON aliasing (`operator`, `operation`). Lives in a separate module; not analysed here.
