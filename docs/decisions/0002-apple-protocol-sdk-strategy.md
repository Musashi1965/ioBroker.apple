# ADR 0002: Apple Protocol SDK Strategy

- Status: accepted
- Date: 2026-08-31

## Context

The adapter needs reverse-engineered AirPlay, RAOP, and Companion Link support.
`basmilius/apple-protocols` provides a modular MIT-licensed TypeScript
implementation and a high-level SDK, while `pyatv` is a mature Python reference.
The published Apple SDK is ESM-only and the reviewed high-level flow does not
fully own durable credential persistence, stable cross-service identity, or
end-to-end reconnect behavior.

## Decision

Adopt `@basmilius/apple-sdk` as the preferred PoC candidate behind a project-owned
backend interface. Do not allow SDK types or protocol objects to become the
public ioBroker contract.

Do not use the SDK's high-level `discover()` result as the persistent device
inventory. For the discovery PoC, use the published low-level discovery API
from `@basmilius/apple-common` behind the same project-owned boundary, validate
the actual DNS-SD service type, and correlate services only through protocol
identity evidence. This does not permit low-level protocol types to spread
through the adapter.

The disposable Apple TV PoC is accepted for the narrow vertical slice proven in
the validation section. Implementation remains behind the project-owned backend
interface; SDK types and PoC credential storage do not enter the published
adapter, and untested device or recovery paths are not described as supported.

Before a public release, the actual adapter integration must still prove direct
unload/compact-mode cleanup, unexpected-loss recovery, re-discovery after an
address or port change, protected ioBroker credential persistence, and the
declared real-device compatibility matrix.

Use `pyatv` as a behavior and test reference. Do not introduce a Python sidecar
without a new accepted ADR demonstrating that a required feature cannot be
delivered reliably in TypeScript.

## Consequences

The project remains native TypeScript and insulated from upstream API churn.
The adapter must implement service correlation, credential-store integration,
recovery orchestration, normalized errors, and capability projection itself.

## Alternatives Considered

- direct use of low-level protocol packages throughout the adapter: rejected
  because it spreads proprietary protocol coupling.
- Python sidecar using `pyatv`: deferred because it adds runtime, IPC,
  installation, security, and lifecycle complexity.
- copy/adapt `homey-apple`: rejected because that reference implementation is
  GPL-3.0 and this project is MIT-licensed.

## Validation

See `docs/UPSTREAM_RESEARCH.md` and
`docs/poc/apple-sdk-discovery-0.13.4.md`. The first checkpoint proved dynamic ESM
loading and bounded process-isolated discovery on Node.js 22 and 24. It also
exposed unstable high-level candidate sets, incomplete classification, missing
high-level RAOP discovery, and no SDK cancellation API.

The follow-up low-level checkpoint filters unrelated HAP responses and joins
AirPlay, Companion Link, and RAOP through neutralized equivalents of the
AirPlay device ID, Companion pairing identity, RAOP instance prefix, and public
key. Unit tests prove that names and addresses are not identity inputs. On a
Linux aarch64 test host, ten consecutive scans passed across one- and two-device
configurations. One Apple TV then passed PIN pairing, owner-only credential
serialization, new-process reload, five fresh reconnects with independent
AirPlay and Companion Link health, minimized status/capability reads, a remote
HID command, pushed power/Now Playing/active-app events, and process cleanup.
The same 17-test suite and real credential reload passed on Linux `aarch64`
under Node.js 24. These results accept the narrow SDK strategy while leaving
the adapter/release gates in the Decision section mandatory.
