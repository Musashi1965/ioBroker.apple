# ADR 0009: Apple TV App Catalog And Launch Contract

- Status: accepted
- Date: 2026-08-31; amended 2026-09-02

## Context

ADR 0005 deliberately excluded application commands until capability evidence
existed. The pinned Apple protocol SDK exposes a Companion Link app controller
that can fetch the apps Apple TV reports as launchable and launch one by its
bundle identifier. An encrypted adapter pairing was used for an anonymized
real-device probe: the device returned a non-empty catalog, every item had a
valid bundle identifier and display name, and the temporary protocol session
was cleaned up.

The same SDK app controller also exposes a Companion Link URL-open operation
for universal links and application-specific URL schemes. This URL operation
is device-wide and is not reported as a capability of individual catalog apps.

The launchable catalog is not claimed to be a complete inventory of every
installed system component. It is the set the active Apple TV session reports
as remotely launchable.

## Decision

Add app catalog and launch support behind the detected Companion Link app
capability. This ADR supersedes only the app-related exclusion in ADR 0005; the
remaining v0.1 exclusions continue to apply. Feature work does not itself bump
the package version; release classification follows ADR 0008.

The additive states below live under each
`devices.appletv.<deviceId>` device as amended by ADR 0010:

| State suffix          | Type    | Role         | Read | Write |
| --------------------- | ------- | ------------ | ---- | ----- |
| `capabilities.apps`   | boolean | `indicator`  | yes  | no    |
| `nowPlaying.bundleId` | string  | `text`       | yes  | no    |
| `apps.count`          | number  | `value`      | yes  | no    |
| `apps.lastRefresh`    | number  | `value.time` | yes  | no    |
| `apps.refreshStatus`  | string  | `text`       | yes  | no    |
| `apps.lastError`      | string  | `text`       | yes  | no    |
| `apps.available`      | string  | `json`       | yes  | no    |
| `apps.openurl`        | string  | `text`       | no   | yes   |
| `apps.refresh`        | boolean | `button`     | no   | yes   |

`apps.available` is a deterministic JSON array of objects with exactly
`bundleId` and `name` string properties. A successful refresh replaces the
complete catalog, count, timestamp, and per-app projections. Catalogs are
bounded to 500 entries; malformed or unbounded protocol payloads fail with the
stable `protocol_error` code and do not replace the last successful catalog.

Each current catalog item also receives this dynamic projection:

```text
apps.entries.<safe-app-name>.name
apps.entries.<safe-app-name>.bundleId
apps.entries.<safe-app-name>.launch
```

The key is derived from the display name so the app is immediately recognizable
in the object tree. Unicode letters and numbers are retained, other character
runs become underscores, and the readable part is bounded to 80 characters.
When two apps produce the same key, both receive a deterministic eight-character
bundle-ID hash suffix. Bundle identifiers never become raw object-ID segments.
A successful refresh recursively removes obsolete adapter-owned app channels,
including the previous `app_<64-lowercase-hex>` development representation,
before projecting the current catalog.

Writable app controls exist only after the backend confirms app capability.
The adapter accepts only these `ack=false` writes:

- boolean `true` to `apps.refresh`;
- one non-empty URL string to `apps.openurl`;
- boolean `true` to a current per-app `launch` button.

`apps.openurl` accepts absolute HTTP(S) universal links and application-specific
URL schemes up to 2048 characters. It rejects malformed URLs, embedded URL
credentials, and local or executable-data schemes such as `file`, `data`, and
`javascript`. The adapter neither dereferences the URL nor claims that the
receiving app supports it. tvOS decides how a valid URL is routed.

Refresh, app launch, URL-open, and remote commands share one serialized queue per device.
The adapter records every result centrally below `lastCommand`; app refresh
also updates `apps.refreshStatus` and `apps.lastError`. It records `pending`,
then `success` or `error`, uses only stable error codes, and resets the affected
writable control with `ack=true`. `apps.openurl` is reset to an empty string.
The submitted URL is not copied to `lastCommand.target` or adapter logs because
its path or query may contain private information. The superseded `apps.command` channel and
free-form `apps.launch` state are removed. The adapter does not poll the
catalog. It performs one best-effort automatic refresh when a
paired backend first reports both an active Companion connection and app
capability, and repeats that one-shot refresh after a later Companion reconnect.
An explicit write remains available for retry or manual updates. Launch is
accepted only after a successful catalog load in the current process.

## Consequences

Automations and visualizations can consume one compact catalog or bind directly
to a readable per-app launch button. Because the app display name is
part of the public state ID, a vendor rename or locale change can change that
entry ID on the next refresh. Active-app display name and bundle identifier are
available independently. No SDK type crosses the project-owned backend boundary.

The catalog can omit installed apps that Apple TV does not report as
launchable. A successful launch means the protocol accepted the command; it
does not promise that an app will remain in the foreground or that its content
is controllable. Likewise, a successful URL-open result means only that the
Companion operation completed; it does not prove that a particular app opened
or started the requested content.

This additive public-contract feature is classified as a minor feature by ADR 0008.

## Validation

- Unit tests cover payload validation, bounds, deterministic sorting,
  de-duplication, object metadata, readable collision-safe entry IDs, migration
  cleanup, automatic refresh on connection,
  URL validation and redaction, write parsing, serialization, acknowledgement,
  and stable errors.
- Package, type, lint, build, and integration checks remain required.
- Real-device acceptance verifies catalog refresh, restart behavior, one direct
  launch, one per-app launch path, at least one known universal or app URL,
  pushed active-app state, and cleanup without exposing credentials or the
  submitted URL in logs or result states.
