# Apple SDK Discovery PoC 0.13.4

- Checkpoint date: 2026-08-31
- Status: Apple TV vertical-slice pass; upstream high-level discovery rejected
- Host used for local discovery: macOS 26.6.2, arm64

## Scope

This checkpoint evaluates only the published SDK artifact, ESM/CommonJS
interoperability, bounded discovery execution, privacy-safe diagnostics, and
basic local mDNS discovery. It does not prove pairing, credentials, reconnect,
commands, events, streaming, adapter unload, Linux behavior, or stable device
identity.

The PoC is deliberately outside the adapter runtime. `@basmilius/apple-sdk` is
an exact, development-only dependency. The runner compiles to CommonJS and uses
dynamic `import()` inside a disposable worker process. The parent process owns a
timeout and escalates from `SIGTERM` to `SIGKILL` when a worker does not stop.
This process boundary is a PoC safety measure, not a decision to use a sidecar
in the adapter.

The worker discards device names, IDs, addresses, ports, and model strings before
sending results. The printable output contains only counts for recognized
device types, model-name availability, and protocol services.

## Published Artifact Review

| Item              | Result                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------- |
| Package           | `@basmilius/apple-sdk@0.13.4`                                                                     |
| Module format     | ESM-only package with `.mjs` runtime and `.d.mts` declarations                                    |
| Node engine       | Not declared by the package                                                                       |
| npm integrity     | `sha512-HxG4BC3psfQfI34ZjpgMjY7t4dbWTtJAnJTaTBtt3GROuM1pM+xtzzKCVAhYzgSsSWVNjlrxN+PbcEaElxLU4A==` |
| npm tarball SHA-1 | `c6775fa68b93c4480873f6ec17af265a247dc225`                                                        |
| License metadata  | MIT                                                                                               |
| License artifact  | SDK tarball has no `LICENSE` file despite its package `files` metadata                            |

All eight pulled `@basmilius/apple-*` packages declare MIT in their package
metadata. The installed `apple-sdk` and `apple-rtsp` artifacts omit a license
file; the other reviewed transitive artifacts include one. Because the SDK is
development-only and the PoC is excluded from the npm package, none of these
artifacts is distributed by the adapter at this checkpoint. Runtime adoption
requires a deliberate notice/distribution decision.

## Automated Compatibility Results

The same compiled CommonJS test suite passed on:

| Node runtime | Dynamic ESM import | Privacy aggregation | Forced-cleanup fallback |
| ------------ | ------------------ | ------------------- | ----------------------- |
| 22.23.2      | pass               | pass                | pass                    |
| 24.20.0      | pass               | pass                | pass                    |
| 26.7.0       | pass               | pass                | pass                    |

The forced-cleanup test uses a fixture that deliberately ignores `SIGTERM` and
confirms that the supervising process applies `SIGKILL` within the configured
bound. The upstream `discover()` API itself has no timeout or `AbortSignal`.
Its reviewed implementation performs two sequential, fixed four-second mDNS
queries, so direct in-process adapter unload cannot cancel an active scan.

## Local Discovery Results

Full discovery completed under both supported target runtimes:

| Node runtime | Duration | Candidates | Apple TV | Unknown | Model present | AirPlay | Companion | RAOP |
| ------------ | -------- | ---------- | -------- | ------- | ------------- | ------- | --------- | ---- |
| 22.23.2      | 8.176 s  | 11         | 1        | 10      | 6             | 7       | 8         | 0    |
| 24.20.0      | 8.161 s  | 12         | 1        | 11      | 4             | 7       | 9         | 0    |

Across five privacy-safe runs on the same host, candidate counts varied from 9
to 12. An Apple TV was classified in four of the five runs. Most candidates
remained `unknown`, including some with a non-empty model name. RAOP was always
zero because the high-level SDK implementation does not query RAOP discovery.

These figures prove that local multicast discovery executes, not that every
candidate is an Apple device or that the returned set is a stable inventory.
No installation-specific value was retained in the repository.

## Linux aarch64 Checkpoint

The exact clean source commit `b6f75186a0723167df1e6aad60c0b969bc82ff70`
was deployed through the project-owned PoC script to the isolated Linux test
workspace. The target ran Linux `6.12.96+rpt-rpi-v8` on `aarch64`, Node.js
22.23.2, and had ioBroker js-controller 7.2.2 available. No adapter package or
`apple.0` instance was installed by this test.

`npm ci` completed, and all three PoC tests passed: CommonJS-to-ESM loading,
privacy-safe aggregation, and forced cleanup of a non-cooperative worker. Three
consecutive local discovery runs produced:

| Run | Duration | Candidates | Apple TV | Unknown | Model present | AirPlay | Companion | RAOP |
| --- | -------- | ---------- | -------- | ------- | ------------- | ------- | --------- | ---- |
| 1   | 8.685 s  | 10         | 1        | 9       | 6             | 6       | 8         | 0    |
| 2   | 8.678 s  | 10         | 0        | 10      | 2             | 9       | 5         | 0    |
| 3   | 8.618 s  | 8          | 0        | 8       | 2             | 8       | 5         | 0    |

The worker completed after every run, and no process retained the deployed PoC
directory as its working directory afterward. This proves the isolated Linux
execution path, but not direct in-process socket cleanup. The changing candidate
set, service counts, and Apple TV classification reproduce the macOS discovery
instability and keep the high-level discovery result at partial pass.

## Low-Level Discovery Correction

A private, non-persisted diagnostic run explained the high-level instability:
the upstream mDNS collector returned unrelated HAP and Companion services, and
the high-level discovery exposed them as Apple-device candidates. No private
name, address, or identifier from that diagnostic is recorded here.

The project-owned PoC correction uses `@basmilius/apple-common@0.13.4` directly
as an exact development dependency and:

- requests AirPlay, Companion Link, and RAOP together in one four-second scan;
- accepts a result only when its actual DNS-SD type matches the protocol slot;
- correlates services through normalized protocol identity evidence rather
  than IP address or display name;
- recognizes only explicit Apple TV and HomePod model patterns for the current
  Apple-device result;
- sends only minimized booleans and normalized device types to the parent
  process.

Neutral unit fixtures prove three-service correlation, rejection of unrelated
HAP results, non-correlation without stable evidence, Apple TV and HomePod
classification, and the absence of name/address identity inputs. The first
privacy-safe macOS run returned exactly one Apple TV with AirPlay, Companion,
and RAOP correlated in 4.087 seconds.

The exact correction commit `5cf206c50236` was then deployed to the Linux
aarch64 test host. All nine tests passed there. Five consecutive scans with one active Apple TV
each returned exactly one Apple TV with AirPlay, Companion, and RAOP. After a
second Apple TV was switched on, another five consecutive scans each returned
exactly two Apple TVs, both with all three services. A third available Apple TV
could not be included in this checkpoint and remains explicitly untested.

This 10-run checkpoint accepts project-owned low-level discovery and service
correlation for the two tested Apple TVs. It does not accept the upstream
high-level inventory or prove address-change recovery, pairing, commands,
events, or in-process adapter cleanup.

## Pairing Checkpoint

The next PoC step uses `PairingSession` directly against one low-level AirPlay
result. A temporary display name may select the requested device for that one
run, but durable identity and stored lookup use only the normalized protocol
device ID. Names and addresses are not persisted or printed.

Disposable credentials are written outside the deployed source tree according
to ADR 0004. The file is owner-only and unencrypted, so this mechanism is valid
only for the isolated PoC. A successful pairing is not accepted until a new
process can reload the file, rediscover the same device, connect, report
AirPlay and Companion health separately, and disconnect cleanly.

The Linux aarch64 test host completed that gate against one of the two
discovered Apple TVs. The pairing session accepted the on-screen PIN without printing or storing it,
wrote a `0600` credential file owned by `iobroker`, and exited. A separate
process then reloaded the file, rediscovered the device by its protocol ID, and
reported both AirPlay and Companion Link connected before disconnecting. No
installation-specific name, address, identifier, PIN, or credential was added
to the repository or test output.

The control probe reads only minimized status/capability booleans, counts push
events without recording event payloads, sends one bounded remote `up` command,
and disconnects. On the Linux aarch64 test host it connected successfully, read
the device in screensaver state with remote-control capability available, completed the
command, observed one pushed power-state event, and disconnected. Now Playing,
active-app, and supported-command event counts remained zero while the device
was idle; those event types therefore remain unverified on changing media.

Five subsequent fresh processes each reloaded the same credentials, rediscovered
the target, connected both AirPlay and Companion Link, and disconnected. No
pairing or control probe process remained afterward, and the credential file
still had owner-only `0600` permissions. This accepts repeated credential
reload/reconnect and disposable-process cleanup. It does not yet prove
in-process adapter unload, recovery from an unexpected connection loss, or a
real address/port change.

A final active-device event window received two Now Playing and two active-app
push events without retaining their payloads. Playback-state,
supported-command, artwork, and volume changes were not generated during that
short window and remain part of feature-level integration testing.

On the same Linux `aarch64` target, Node.js 24 passed all 17 PoC tests and a
real-device credential reload with both AirPlay and Companion Link connected.

## Decision At This Checkpoint

The module-format gate for Node 22 and 24 passes. Project-owned low-level
discovery and correlation pass for the two tested Apple TVs. High-level
discovery remains unsuitable as the adapter's persistent inventory. The
adapter-facing implementation still needs a project-owned layer that:

- discovers AirPlay, Companion Link, and RAOP in parallel or with an explicitly
  bounded schedule;
- correlates services using stable evidence instead of IP address alone;
- classifies unknown and partially described devices conservatively;
- supports adapter-controlled cancellation and deterministic cleanup;
- separates protocol health per device and records no private diagnostics by
  default.

ADR 0002 is accepted for the narrow Apple TV vertical slice behind the
project-owned interface. Runtime integration must preserve the low-level
discovery/correlation correction and complete the adapter-specific credential,
unexpected-loss recovery, address-change, unload, and compatibility-matrix
gates before release.

## Reproduction

```sh
npm run poc:test
npm run poc:discovery
npm run poc:discovery:low-level
npm run poc:pair
npm run poc:verify-pairing
npm run poc:probe-control
npm run poc:monitor-events
```

`poc:discovery` accesses the local multicast network. Its output is intentionally
limited to the aggregate schema described above.

On a compatible Linux test host, deploy the exact clean Git commit with:

```sh
scripts/deploy_poc_workspace.sh <ssh-target>
```

The script creates a new commit-specific directory below
`/opt/iobroker-apple-poc`, installs dependencies as the remote `iobroker` user,
creates the owner-only `/opt/iobroker-apple-poc-private` credential directory,
and runs the PoC tests followed by one privacy-safe discovery. It refuses a
dirty local worktree and an existing remote commit directory. It does not
install an ioBroker adapter instance or publish a package. Pairing must be
started separately with runtime-only target selection and an explicit
`APPLE_POC_CREDENTIALS_PATH` below that private directory.
