# ADR 0012: Apple TV Admin Tables

- Status: superseded by ADR 0017 for the Admin compatibility and build boundary;
  table behavior remains accepted
- Date: 2026-09-01

## Context

The standard JSON Config controls can list runtime-provided devices or invoke
one adapter message, but they cannot compose transient discovery data, a
non-persisted PIN field, and several row-specific actions into one dynamic
table. The previous Apple TV selectors therefore consumed substantial vertical
space and showed invalid placeholder icons for action names not supported by
the standard `sendTo` component.

The current test and deployment baseline uses ioBroker Admin 7.8.23. Admin 8
uses a different shared React and GUI-component generation and intentionally
refuses legacy-generation custom components.

## Decision

Render Apple TV pairing and paired-device management with one custom JSON
Config component built from source in `src-admin/`. The component uses the
official Admin 7 Module Federation interface and imports its controls and icons
from the Admin 7 React/MUI libraries. Generated production assets live below
`admin/custom/` and are included in the adapter package.

ADRs 0015 and 0016 later reuse this source/build boundary for HomePod and
AirPlay Receiver management tables and the two-language instance selector. They
do not change the accepted Admin-generation or package boundary.

The component consumes the existing adapter message boundary. The candidate
and paired-device list responses add non-secret structured fields alongside
their existing `label` and `value` fields. `getPairingStatus` adds the stable
device ID only while a pairing session is active, allowing the browser to bind
the global one-session pairing coordinator to the correct table row.

The PIN is held only in component state, filtered to four digits, sent once to
`finishPairing`, and removed after completion or cancellation. It is never
written through the JSON Config `onChange` path and never becomes native adapter
configuration.

The component keeps the existing one-pairing-session-per-instance rule. It
serializes visible actions while a request is in progress, refreshes inventory
after every action, and performs a quiet ten-second refresh for connection and
discovery status. Passive and forget operations retain their explicit browser
confirmation.

This generation targets Admin 7.8.23 through the remaining Admin 7 line. The
declared global Admin dependency is narrowed to `>=7.8.23 <8.0.0`. Supporting
Admin 8 requires rebuilding or adding a GUI API generation 2 component and
testing both generations before widening that range. This compatibility change
belongs to a future pre-1.0 minor release.

## Consequences

Each discovered Apple TV has one compact row with name/model, pairing status,
start, transient PIN, finish, and cancel controls. Each paired Apple TV has one
row with connection/enablement status and active, passive, and forget actions.
All actions use bundled MUI icons, avoiding the limited string-icon vocabulary
of the standard `sendTo` control.

The source build adds pinned Admin-only development dependencies and generated
frontend assets. Protocol behavior, credentials, persistence format, and public
object IDs remain unchanged. The additive message fields remain non-secret and
backward compatible with the earlier selectors.

## Alternatives Considered

- Persisting runtime rows in a standard JSON Config `table` was rejected
  because discovery results and PINs are not durable adapter configuration.
- Rendering HTML through `textSendTo` was rejected because it has no supported
  row-action or transient-input message boundary.
- Keeping compact selectors was rejected because it would not provide the
  requested per-device workflow.
- Building only for Admin 8 was rejected because the tested ioBroker host runs
  Admin 7.8.23.

## Validation

Type checking and the production component build must pass in addition to the
full adapter gate. Contract tests verify the custom-component reference,
generated entry point, PIN-row actions, and active pairing device ID. The
Devices tab must load on a representative Linux aarch64 ioBroker host under
Admin 7.8.23 without console or component-loader errors.
