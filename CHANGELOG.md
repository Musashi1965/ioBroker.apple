# Changelog

All notable changes to this project are documented in this file.

## Unreleased

### BREAKING

- Require ioBroker Admin 8 and migrate all custom configuration components to
  GUI API generation 2. Admin 7 cannot load the React 19/MUI 9 component build.

### Added

- Add the capability-gated Apple TV `apps.openurl` command for validated
  universal links and application-specific URL schemes.
- Add strongly identified HomePod/HomePod mini device objects with automatic
  transient AirPlay pairing and no stored HomePod credentials.
- Add capability-gated HomePod play, pause, Play/Pause, stop, next, previous,
  absolute volume, and mute controls with pushed Now Playing and volume state.
- Add privacy-preserving HomePod debug diagnostics and a public hardware-test
  checklist. Real-device compatibility remains explicitly unverified.
- Add explicit HomePod and AirPlay Receiver adoption, active/passive
  management, local deletion, durable offline inventory, and candidate-list
  return after deletion.
- Add a per-instance German/English switch for the adapter configuration.

## 0.2.0 - 2026-09-01

### BREAKING

- Group Apple TVs below `devices.appletv.<deviceId>` and remove the temporary
  flat `devices.appletv_<deviceId>` compatibility path.
- Replace per-device `command` and `apps.command` with the centralized
  `lastCommand` channel.
- Move `remote.playPause` to `playback.playPause` and move
  `remote.powerOn`/`remote.powerOff` to the `power` channel.
- Remove the free-form `apps.launch` state; applications are launched through
  `apps.entries.<appName>.launch`.

Existing ioBroker scripts and visualizations using the superseded state IDs
must update their bindings. The adapter removes superseded objects after their
replacement tree has been projected for a discovered paired device.

### Added

- Readable Apple TV device and application labels with stable technical device
  identities.
- Persistent paired-device overview and local device removal in Admin.
- Capability-gated Apple TV wake and suspend controls.
- Separate navigation, playback, power, application, and command-result areas.
- Exclusive discovery counts for Apple TV, HomePod, and generic AirPlay
  receivers.

## 0.1.0 - 2026-08-31

- Initial Apple TV discovery, secure pairing, status projection, remote control,
  application catalog, and application launch vertical slice.
