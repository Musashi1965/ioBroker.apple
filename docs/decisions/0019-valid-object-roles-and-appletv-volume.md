# ADR 0019: Valid Object Roles And Apple TV Volume Control

- Status: accepted
- Date: 2026-09-10

## Context

The ioBroker object-structure checker rejects `info.type` as an unknown role.
It also requires every state with role `level.volume` to be writable. The
adapter used `info.type` for device-class constants and used `level.volume` for
read-only Apple TV volume status before the absolute volume command path was
wired through the runtime.

The product direction remains that Apple TV and HomePod volume should be
controllable only when the active backend reports the matching capability.

## Decision

Use role `text` for `*.info.type` states. These states remain read-only string
constants such as `appletv`, `homepod`, and `airplayReceiver`.

Use `value.volume` for read-only volume observations. Use `level.volume` only
when `common.write` is `true` and the current backend reports volume control.

For Apple TV, `devices.appletv.<deviceId>.volume.level` starts as read-only
`value.volume` with percent range 0 through 100. After the backend reports
volume capability, the projection reconciles the same state as writable
`level.volume`. Unacknowledged writes with finite values from 0 through 100 are
serialized per device, validated against pairing, connection, and current
capability, mapped to the SDK absolute volume range 0 through 1, and
acknowledged with `ack=true`.

On command failure, the adapter records the stable command error and restores
the last known volume value with `ack=true`. The PIN, credentials, raw protocol
state, network endpoints, and installation-specific names remain outside this
contract.

HomePod keeps the same role split: read-only unavailable/default state uses
`value.volume`; capability-confirmed volume control uses writable
`level.volume`.

## Consequences

The object tree satisfies the ioBroker role checker while preserving the
intended capability-gated volume control. Existing external bindings to
`volume.level` keep the same state ID; only the role/write metadata changes
when the capability becomes available.

Apple TV volume control still requires real-device verification before it is
described as hardware-validated in release notes or user-facing documentation.

## Validation

Contract tests cover `info.type` role replacement, the read-only versus
writable volume-role split, bounded Apple TV volume write parsing, per-device
command serialization, success acknowledgement, and failure restoration. The
full quality gate is required because the public object contract and command
semantics change.
