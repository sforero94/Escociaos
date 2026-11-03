# Route B — offline boundary preparation

2026-11-03. Scope: independent local synthetic work only. Coordination reports that the real snapshot is blocked because its promised isolation and retention could not be verified. Do not unblock it by copying data, trying another destination, reading credentials or calling a provider. M2/M2.5 remain gated and route acceptance remains explicit.

`analysis/esco2-design/direct_boundary.py` is a disposable design probe, not production code. It builds a fixed read request from the operation registry after synthetic session, current profile, conversation owner and scope checks. It emits and returns only frozen `SolicitudLectura`; any output from the spy port is discarded, never treated as source evidence. It has no JWT parser, service client, SQL, HTTP, database connection, environment-variable access or persistence. The application does not import it.

Run:

```sh
python analysis/esco2-design/check_contracts.py
python analysis/esco2-design/check_direct_boundary.py
```

The second suite checks policy requirements using fake authorities and a spy read port. Rejection must leave the read count unchanged. It covers invalid session/channel/operation, absent/inactive/non-Gerencia profile, foreign conversation, client-supplied identity/table/projection/write method, unauthorized lots, empty authorized scope, explicit permission for unassigned records, revocation between operations, owner/scope changes immediately before a read, and two concurrent actors with disjoint scope. A missing ownership check or an empty-filter interpretation of “all lots” causes these cases to fail.

Verification after independent review: 4 registry checks and 15 boundary checks passed locally (19 total). New cases cover argument mutation after validation, registry mutation during authorization, malformed authority types and rejection of spy-output propagation. These failed against the reviewed revision before correction. The emitter captures its registry as an immutable serialization/hash, uses a private validated argument snapshot, validates authority types strictly and returns only the request. An earlier in-memory mutation removed ownership enforcement; the owner-change test failed as required. This discriminates the proposed guards; it is not a live authorization test. See [review and baseline reconciliation](review-and-baseline.md).

The probe closes a design ambiguity: `lotes=[]` resolves to the current actor's authorized set, never an unrestricted filter. Unassigned records require a separate server authorization flag. An explicit lot filter excludes unassigned records. A SQL/Data API adapter must implement exactly the conjunction of user RLS AND this scope. The proposal does not assert that current production RLS has a farm/lot policy or that the current authorization schema already supplies that set.

Limitations: fake authorities cannot prove JWT signature/expiry/issuer/audience validation, live profile semantics, RLS, grants, column protection, SQL side effects, transport headers, provider retention or database transaction consistency. Revocation between the final application check and the database read is still a race; the authorized database implementation must enforce current role/scope in the read transaction. No offline test substitutes that evidence. There is no planner/composer, model evaluation, web endpoint or capture regression claim.

Next required evidence, with owners to confirm in coordination:

| Dependency | Required before |
| --- | --- |
| E2-18: verified isolation, access and retention for the authorized snapshot | Any real snapshot read/copy or reference recalculation |
| M1: qualified schema/date/cost relationships and authorization-scope source | Binding proposed registry fields to an executable reader |
| E2-03: reviewed technical block, budget, date/limit contracts and route decision | Product integration or M2.5 start |
| E2-06: authorized project/model/data handling and spend cap | Any model/provider call |
| E2-13: actual user-JWT/RLS negative tests and capture isolation review | Treating B access or no-regression as verified |

Continue offline cases and contract review while blocked. Do not create an aggregate RPC, grants, account or gateway as a workaround. The earlier standard-tool A failure does not itself prove B secure or accepted.
