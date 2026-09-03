# Architecture Decision Records

Use ADRs for decisions that are expensive to reverse or affect the public
contract. Number records sequentially as `NNNN-short-title.md`.

Required topics before their implementation is considered stable include:

- adapter module format and minimum Node/js-controller versions;
- protocol SDK adoption and version policy;
- credential encryption/persistence;
- stable device identity and protocol-service correlation;
- public object tree and command schema;
- streaming/FFmpeg/resource policy;
- Apple Music authorization;
- Alexa as embedded backend versus separate adapter.

Project-wide release versioning is defined by
[ADR 0008](0008-semantic-versioning.md).
Generic AirPlay Receiver identity and its first read-only object contract are
defined by [ADR 0013](0013-airplay-receiver-identity-and-contract.md).
HomePod transient connection, capability-gated playback and volume, and the
public-test logging boundary are defined by
[ADR 0014](0014-homepod-transient-control-contract.md).
Explicit HomePod/AirPlay Receiver adoption, enablement, persistence, and local
deletion are defined by
[ADR 0015](0015-explicit-homepod-and-receiver-management.md).
The instance-local German/English Admin configuration choice is defined by
[ADR 0016](0016-instance-admin-language.md).
The migration of all custom configuration components to Admin 8 and GUI API
generation 2 is defined by
[ADR 0017](0017-admin-8-gui-api-generation-2.md).
Production timer ownership and the runtime-neutral scheduling boundary are
defined by [ADR 0018](0018-iobroker-owned-timer-scheduler.md).

## Template

```markdown
# ADR NNNN: Title

- Status: proposed | accepted | superseded | rejected
- Date: YYYY-MM-DD

## Context

What problem, evidence, and constraints require a decision?

## Decision

What is the chosen rule?

## Consequences

What becomes easier, harder, required, or excluded?

## Alternatives Considered

What credible options were rejected, and why?

## Validation

Which test, PoC, or measurement supports the decision?
```
