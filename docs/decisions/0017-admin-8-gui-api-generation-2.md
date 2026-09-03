# ADR 0017: Admin 8 GUI API Generation 2

- Status: accepted
- Date: 2026-09-03

## Context

The dynamic Apple TV, HomePod, AirPlay Receiver, and language controls were
originally built for Admin 7 with GUI API generation 1. The local Linux aarch64
test host now provides Admin 8 and GUI API generation 2. Admin 8 intentionally
refuses to start generation-1 components because its shared React, MUI, and
ioBroker component libraries are not binary-compatible with the older build.

The result was a visible loader warning for every custom component while the
standard JSON Config fields continued to render. Adding only `guiApi: 2` would
misdeclare an incompatible bundle and is therefore not a valid correction.

## Decision

Migrate the complete custom Admin component set to GUI API generation 2 using
the official `ioBroker.admin-component-template` version 3.0.5 as the reviewed
build reference. The generation-2 build uses exact reviewed development
versions of `@iobroker/gui-components` 10.0.5, `@iobroker/json-config` 9.0.8,
React 19.2.8, MUI 9.2.0, Vite 8.1.5, and the associated Module Federation
packages recorded in `THIRD_PARTY_NOTICES.md`.

Every custom item in `admin/jsonConfig.json` declares `guiApi: 2`. Source code
imports `I18n` and the Module Federation sharing configuration from
`@iobroker/gui-components`; asynchronous generation-2 lifecycle methods await
their base implementation. The deprecated `bundlerType` declaration and the
generation-1 `@iobroker/adapter-react-v5` dependency are removed.

The adapter requires ioBroker Admin `>=8.0.0 <9.0.0`. Admin 7 is no longer a
supported installation target. This incompatibility must be announced as
`BREAKING` in the next pre-1.0 minor release; the current development version
is not changed outside an explicitly authorized release.

## Consequences

All four custom controls share the same React 19/MUI 9 generation as Admin 8
and can pass its component-loader gate. The backend message API, native values,
pairing security, device persistence, and public object tree remain unchanged.

One generated Admin bundle cannot serve both GUI API generations. Restoring
Admin 7 support would require a separately built and selected generation-1 UI,
not a relaxed version range or false `guiApi` declaration.

The source build requires a Node version accepted by Vite 8 and Module
Federation Vite 1.19.1. The project's current supported Node 22, 24, and 26
validation uses releases above those tools' minimum Node 22.12 requirement.

## Alternatives Considered

- Declaring `guiApi: 2` on the existing bundle was rejected because it still
  contains React 18/MUI 6 generation-1 dependencies.
- Keeping Admin 7 as the only target was rejected because the representative
  installation has moved to Admin 8 and all custom controls are unusable there.
- Removing the custom tables was rejected because standard JSON Config cannot
  express their transient PIN and row-specific device-management workflows.
- Shipping two frontend generations was deferred because JSON Config has no
  simple static compatibility selector and the duplicated build/test surface is
  not justified for the current pre-1.0 adapter.

## Validation

Contract tests verify `guiApi: 2`, the Admin 8 global dependency, and absence
of the legacy component package. Type checking, the production Admin build,
package tests, the full adapter gate, and Node 22/24/26 tests are mandatory.
Visual verification on the local Linux aarch64 test host must confirm all four
controls, both language directions, and absence of component-loader or
translation warnings before the next release.
