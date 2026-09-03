# General Project Definition

Status: baseline definition, 2026-08-31

## 1. Identity

| Item                | Definition                              |
| ------------------- | --------------------------------------- |
| Product name        | Apple                                   |
| GitHub repository   | `ioBroker.apple`                        |
| npm package         | `iobroker.apple`                        |
| ioBroker adapter ID | `apple`                                 |
| Instance namespace  | `apple.<instance>`                      |
| Implementation      | TypeScript / Node.js                    |
| Project license     | MIT                                     |
| Initial target      | Local ioBroker installation on Linux    |
| Primary consumers   | ioBroker automations and visualizations |

The original working title `apple-media` is superseded by the repository and
adapter identifier `apple`.

## 2. Vision

The adapter is a central Apple-media layer for ioBroker. It combines discovery,
control, status, media-source selection, output routing, commands, and scenes
without exposing proprietary Apple protocol details to visualizations or
automations.

The design must allow further player backends, especially Echo/Echo Show, but
must not make those future integrations a dependency of the Apple-device core.

## 3. Goals

The project shall provide:

- automatic local discovery of supported Apple TV, HomePod, and AirPlay
  receivers;
- interactive Apple TV PIN pairing and secure persistent credentials;
- resilient device lifecycle handling across restart, standby, DHCP changes,
  partial protocol failure, and temporary network loss;
- capability-based remote control, playback, volume, application, account,
  power, metadata, artwork, and output control;
- AirPlay audio for supported files, URLs, radio, and TTS, subject to technical
  proof;
- configurable AirPlay output groups, subject to synchronization proof;
- a generic command API and a bounded scene/macro engine;
- a stable, device-independent MediaPlayer contract for ioBroker consumers;
- Apple Music catalog and personalized-data access through official Apple APIs;
- optional external media-provider modules for searchable channel and content
  catalogs, with playback only through verified app deep links or lawfully
  available streams and only after real-device validation of the concrete
  selection;
- a backend boundary through which other players can be added later.

## 4. Non-goals And Boundaries

The following are explicitly not assumptions of the architecture:

- The Apple Music API does not provide a reusable DRM-free MP3/PCM stream.
- Apple Music catalog access is not the same as playback on Apple TV, HomePod,
  AirPlay, or Alexa.
- Equal behavior across all device models and Apple software versions is not
  guaranteed.
- Polling is not the primary synchronization model when protocol events exist.
- Visualizations and automations do not contain Apple pairing, protocol,
  authentication, or backend-selection logic.
- A Python sidecar is not part of the default runtime.
- Alexa/Echo support is not part of version 1.0 unless a later ADR changes the
  scope.
- Video casting, screen mirroring, DRM circumvention, and extraction of Apple
  Music audio are outside the initial project scope.

## 5. Domain Model

The public model distinguishes:

- **Device**: a discovered physical or logical endpoint with stable identity and
  protocol services.
- **Source**: content or a content service, for example Apple Music, web radio,
  a local file, a URL, or TTS output.
- **Player**: a backend that can play or control media, for example Apple TV,
  HomePod, AirPlay receiver, or a future Echo backend.
- **Output**: an audio route selected by a player, for example a HomePod stereo
  pair connected to Apple TV.
- **Group**: a configured collection of compatible players or outputs.
- **Capability**: a runtime-discovered operation or status supported by a
  concrete backend.
- **Command**: one validated operation against one target.
- **Scene**: an ordered, bounded sequence of commands, delays, and simple
  conditions.

Sources and players are intentionally independent. A source may only be played
through a player when a compatible playback strategy exists.

## 6. Functional Scope

### Apple TV

Planned capabilities include discovery, PIN pairing, online status, power,
navigation, transport controls, seek/skip, volume, Now Playing, artwork, active
app, app listing/launch, account listing/switching, audio-output discovery, and
output selection.

Each capability remains hidden or read-only when the active protocol/app/device
does not support it.

### HomePod And AirPlay Receivers

Planned capabilities include discovery, online status, transient pairing,
transport controls where supported, volume, Now Playing, artwork, direct audio
streaming, and group participation. Support claims require a real-device test
for each model and software version.

The first HomePod preview implements strong AirPlay identity, automatic
transient pairing, connection state, push-driven Now Playing, playback, and
volume behind the accepted ADR 0014 contract. It remains explicitly unverified
on hardware. Artwork, streaming, stereo/multi-room semantics, alarms, Intercom,
Siri, and Home settings remain future work.

Strongly identified HomePods and generic AirPlay Receivers require explicit
local adoption before receiving an individual object tree. Active/passive and
delete management is durable and separate from transient discovery; deleting a
currently visible device returns it to the unmanaged candidate list. ADR 0015
defines this ownership contract.

### Commands And Scenes

Every operation has one internal typed command representation. Individual
ioBroker states and the generic JSON command endpoint both invoke the same
dispatcher, validation, capability checks, error mapping, and audit result.

Scenes may contain commands, bounded delays, and declarative conditions. They
must not execute arbitrary JavaScript. The engine requires cancellation,
timeouts, a maximum number of steps, one defined concurrency policy per target,
and a structured result.

### Apple Music

The Apple Music module uses official Apple Music API/MusicKit interfaces for
catalog search and, after user authorization, library, playlists, favorites,
recently played content, and recommendations where the API makes them
available.

Developer tokens, Music User Tokens, storefront, localization, pagination,
rate limits, token expiry, and authorization errors are service concerns. A
separate playback resolver decides whether a selected item can be handed to a
specific player backend.

### Automation And Visualization Integration

External consumers bind only to normalized adapter states. The contract includes
target, source, playback state, metadata, artwork, duration, position, volume,
capabilities, command status, and normalized browsing/search results.

The contract is versioned. Breaking state-tree or payload changes require a
migration plan and an ADR.

## 7. Public Object-Tree Direction

The final tree is defined after the Apple TV proof of concept. The following is
the architectural direction, not yet a frozen schema:

```text
apple.0
├── info
├── devices
│   ├── appletv
│   │   ├── info.deviceCount
│   │   └── <stableDeviceId>
│   │       ├── info
│   │       ├── connection
│   │       ├── capabilities
│   │       ├── power
│   │       ├── remote
│   │       ├── playback
│   │       ├── nowPlaying
│   │       ├── volume
│   │       ├── apps
│   │       └── lastCommand
│   ├── homepod
│   │   ├── info.deviceCount
│   │   └── <stableDeviceId>
│   │       ├── info
│   │       ├── discovery
│   │       ├── services
│   │       ├── connection
│   │       ├── pairing
│   │       ├── capabilities
│   │       ├── playback
│   │       ├── nowPlaying
│   │       ├── volume
│   │       └── lastCommand
│   └── airplayReceiver
│       ├── info.deviceCount
│       └── <stableDeviceId>
│           ├── info
│           ├── discovery
│           └── services
├── players.<playerId>
├── groups.<groupId>
├── commands
├── scenes.<sceneId>
├── music
└── player
```

Rules for the final schema:

- IDs are stable, sanitized technical identifiers; display names are values,
  not identity.
- Folders/devices/channels contain structure; states are leaves only.
- Every state has a meaningful type, role, read/write definition, unit, range,
  and default where applicable.
- Incoming commands use `ack=false`; adapter-confirmed state and command results
  use `ack=true`.
- Complex JSON payloads have documented, versioned schemas and bounded size.
- Frequently consumed player metadata is exposed as scalar states even when a
  complete JSON representation also exists.
- Capability and availability state determine which commands are valid.

## 8. Security And Privacy

- No secret is written to ordinary ioBroker states or logs.
- Pairing credentials, Apple private keys, developer tokens, Music User Tokens,
  and future Amazon cookies require protected/encrypted persistence appropriate
  to ioBroker. The exact mechanism must be accepted in an ADR before feature
  implementation.
- Logs redact PINs, tokens, cookies, keys, authorization headers, private URLs,
  and sensitive query values.
- Local file and URL sources are validated; redirects, protocols, size, time,
  and resource usage are bounded.
- Artwork and API caches have limits and cleanup.
- Scenes accept only known commands and validated declarative parameters.
- The public repository contains neutral fixtures and demo data only.

## 9. Reliability And Operations

The adapter must:

- aggregate multiple protocol services under one stable device identity;
- track protocol health independently so partial failures are visible;
- re-discover changing ports/addresses before reconnecting;
- use bounded exponential recovery and a slower background recovery mode;
- avoid overlapping connects and commands to the same protocol session;
- clean up sockets, event listeners, streams, timers, temporary files, and
  servers on unload;
- support ioBroker compact mode or explicitly document why it cannot;
- expose actionable connection and command errors without leaking secrets;
- preserve durable configuration and pairing across adapter restarts.

## 10. Compatibility Baseline

- Generate the adapter skeleton from the then-current
  `@iobroker/create-adapter`; do not copy an older adapter package.
- Initial development target: Node.js 22 and 24 with compatible supported
  ioBroker js-controller versions.
- The custom adapter configuration requires ioBroker Admin 8 and GUI API
  generation 2; Admin 7 is not a supported installation target.
- `@basmilius/apple-sdk` is ESM-only and therefore requires an explicit
  build/runtime interoperability test before adoption.
- CI must cover the declared Node.js range and Linux, which is the primary
  deployment environment.
- Device compatibility is recorded as an evidence matrix containing model,
  OS version, protocol services, tested operation, and result.

## 11. Definition Of Done

A feature is complete only when:

- behavior and boundaries are documented;
- capability, success, error, timeout, reconnect, restart, and unload paths are
  tested in proportion to risk;
- the object tree and `ack` behavior are verified;
- no credential or private installation data is exposed;
- supported and unsupported device/backend behavior is explicit;
- relevant documentation, ADRs, fixtures, and changelog entries are updated;
- format, lint, type, unit, package, and integration checks pass;
- hardware-dependent claims are backed by a named real-device test.

## 12. Release Direction

Public releases follow the ioBroker requirements for repository naming, English
README content, Admin configuration, valid state roles, GitHub Actions, npm
publication, Adapter Checker, `latest` repository testing, user feedback, and
eventually `stable` inclusion. Each release includes privacy, license,
documentation, history, and secret checks.

Releases follow Semantic Versioning 2.0.0. Backward-incompatible public
contract changes require a major version after `1.0.0`; compatible features use
minor versions and compatible fixes use patch versions. During `0.y.z`, patch
releases remain backward compatible and every unavoidable breaking change is
explicitly marked, justified by ADR, and accompanied by migration notes. ADR
0008 defines the complete versioning and release-metadata policy.

The project's original code and documentation are released under MIT. External
packages, APIs, trademarks, and reference implementations retain their own
licenses and terms. `THIRD_PARTY_NOTICES.md` and ADR 0003 define the provenance
and attribution rules.
