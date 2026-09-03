# Third-Party Notices And Source Policy

This project is licensed under the MIT License. Third-party packages and source
materials remain subject to their respective licenses and terms.

This file records reviewed upstream projects. It is not a generated inventory
of installed npm dependencies. The released package must additionally preserve
all notices required by the dependencies actually distributed with it.

## Runtime dependencies

### Apple Protocols

- Project: `basmilius/apple-protocols`
- Source: https://github.com/basmilius/apple-protocols
- npm packages: `@basmilius/apple-sdk`, `@basmilius/apple-common`
- Reviewed npm version: `0.13.4`
- License: MIT
- Current use: exact version 0.13.4 runtime dependencies behind the project's
  discovery, pairing, and Apple backend interfaces

The packages are not vendored into this repository. Their copyright and
licenses remain with their respective authors. The reviewed source repository
and npm manifests declare MIT. The reviewed npm SDK artifact omits a `LICENSE`
file from its tarball, so this notice records the source and declared license
and is included in the adapter artifact. Runtime adoption is accepted by ADR
0007; dependency updates require a fresh source, artifact, and license review.

## Admin component build

### ioBroker Admin component libraries and template

- Projects: `ioBroker/gui-components`, `ioBroker/ioBroker.admin`, and
  `ioBroker/ioBroker.admin-component-template`
- Reviewed packages: `@iobroker/gui-components@10.0.5` and
  `@iobroker/json-config@9.0.8`
- Reviewed template: `ioBroker.admin-component-template` version `3.0.5`, commit
  `116026cef4623ac900cf3c3a992b7dd2049744c5`
- License: MIT
- Current use: Admin 8 GUI API generation 2, build scaffold, and shared UI
  libraries for Apple TV pairing, device-management tables, and the
  instance-local language selector

The component implementation is project-owned. Its build configuration is
derived from the official MIT-licensed ioBroker template. The relevant template
copyright notice is: Copyright (c) 2022-2026 bluefox
<dogafox@gmail.com>. The complete MIT permission and warranty terms are the
same as those reproduced in the root `LICENSE` file.

The generated Admin bundle also uses React 19.2.8, MUI 9.2.0, Vite 8.1.5, and
Module Federation Vite 1.19.1. These tools and libraries are MIT-licensed and
remain copyright of their respective authors. Source repositories:
https://github.com/facebook/react, https://github.com/mui/material-ui,
https://github.com/vitejs/vite, and
https://github.com/module-federation/vite.

## Reference implementations

### ioBroker Apple TV draft

- Project: `h2okopfmt/ioBroker.apple-tv`
- Source: https://github.com/h2okopfmt/ioBroker.apple-tv
- Reviewed commit: `eb7e8a527a313fdbb63f801335f0b22ae214e6c1`
- License: MIT
- Use: prior-art and project-overlap assessment only

No source from this project is included, copied, adapted, translated, or
vendored. The review informs the independent-project decision in ADR 0001 and
the public landscape assessment in `docs/UPSTREAM_RESEARCH.md`.

### pyatv

- Project: `postlund/pyatv`
- Source: https://github.com/postlund/pyatv
- Reviewed release: `0.18.0`
- License: MIT
- Use: protocol behavior and feature reference; not part of the default runtime

No pyatv source is currently included in this repository.

### Homey Apple

- Project: `basmilius/homey-apple`
- Source: https://github.com/basmilius/homey-apple
- Reviewed tag: `v1.8.0`
- License: GPL-3.0
- Use: behavioral and lifecycle reference only

GPL-3.0 source from this project must not be copied, adapted, translated, or
vendored into this MIT-licensed repository. Similar behavior must be implemented
independently from documented requirements, public APIs, and our own tests.

### Homebridge Alexa Player

- Project: `BewhiskeredBard/homebridge-alexa-player`
- Source: https://github.com/BewhiskeredBard/homebridge-alexa-player
- Reviewed version: `0.5.3`
- License: MIT
- Use: historical research reference only

No source from this project is currently included in this repository.

## External APIs And Trademarks

Apple Music API and MusicKit are external Apple services governed by Apple's
applicable developer terms. Their documentation and proprietary SDK content are
not relicensed by this project's MIT License.

Apple, Apple TV, HomePod, AirPlay, Apple Music, MusicKit, and related marks are
trademarks of Apple Inc. This independent project is not affiliated with,
endorsed by, or sponsored by Apple Inc.

Amazon, Alexa, Echo, and related marks belong to their respective owners. Any
future integration would be an independent interoperability feature.

## Contribution Rule

Contributors must identify the origin and license of copied or adapted material
in their pull request. Substantial third-party code may be added only after a
license review and with all required notices. Code with an incompatible license
must not be introduced.
