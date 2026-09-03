# ADR 0010: Device Class Hierarchy And Apple Music Namespace

- Status: accepted; device objects and explicit management amended by ADRs 0013–0015
- Date: 2026-08-31

## Context

The first Apple TV slice projected devices directly as
`devices.appletv_<deviceId>`. Adding HomePod and generic AirPlay receivers to
that flat pattern would obscure device classes and make later navigation and
capability ownership harder to understand. The project also plans Apple Music,
but Apple Music is a content service rather than a local network endpoint.

The adapter remains in its initial pre-1.0 development phase. Changing the
hierarchy now is less costly than migrating established automations and
visualizations later.

## Decision

Reserve this public hierarchy:

```text
apple.<instance>
├── info
├── devices
│   ├── appletv.<stableDeviceId>
│   ├── homepod.<stableDeviceId>
│   └── airplayReceiver.<stableDeviceId>
├── players
├── groups
├── commands
├── scenes
└── music
```

Object IDs use stable technical class keys and device identifiers. Human-readable
device names remain `common.name` values and do not determine identity. The
three device-class folders are created at runtime. Each class exposes
`info.deviceCount`; ADR 0013 later adds individual read-only objects for strongly
identified generic AirPlay Receivers. `music` remains reserved without an empty
placeholder until its contract exists.

Classification is exclusive and ordered: Apple TV, then HomePod, then generic
AirPlay receiver. HomePod mini is a HomePod model, not a separate class. Macs in
AirPlay Receiver mode, AirPort Express, compatible speakers, smart TVs, and AV
receivers use the generic receiver class unless later protocol evidence supports
a more specific project-owned backend. Stereo pairs and multi-room constructs
are logical players, outputs, or groups rather than new physical device classes.

Apple Music owns the top-level `music` namespace for future authorization
status, catalog, library, playlists, recommendations, and search projections.
It never appears below `devices`. Developer tokens, Music User Tokens, and other
secrets never enter public objects.

## Migration

This is a `BREAKING` pre-1.0 public object-path change:

```text
devices.appletv_<deviceId>  ->  devices.appletv.<deviceId>
```

The development installation completed this one-time migration before the
contract was released. The temporary runtime compatibility code was therefore
removed: current builds recognize and manage only
`devices.appletv.<deviceId>`. Explicitly forgetting a device removes that
current root.

Automations and visualizations that already bind to the development path must
be changed to the new path. Per ADR 0008, the change belongs to a `0.MINOR.0`
feature release.

## Consequences

New device backends have stable, readable class locations without duplicating
AirPlay-capable Apple TV or HomePod endpoints. Apple Music remains cleanly
separated from physical devices and player backends. The one-time Apple TV path
migration is intentionally accepted before the public contract becomes widely
consumed.

## Alternatives Considered

- Keeping the flat `appletv_<deviceId>` pattern was rejected because every new
  device class would remain mixed directly below `devices`.
- Using display names as object IDs was rejected because renames, localization,
  and duplicate names would break stable identity and existing bindings.
- Creating speculative per-device HomePod or AirPlay Receiver objects was
  rejected. ADRs 0013 and 0014 later add narrow per-device contracts after
  defining strong identity and capability boundaries. Class folders retain an
  observed discovery count for weakly identified observations.
- Placing Apple Music below a device was rejected because content sources and
  playback endpoints have independent lifecycles and credentials.

## Validation

Contract tests verify the hierarchy, stable device ID, readable `common.name`,
exclusive class counts, new writable-state parsing, unpaired current-tree
cleanup, and explicit current-device removal.
Full package, build, integration, and supported-Node checks remain mandatory.
