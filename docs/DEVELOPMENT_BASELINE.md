# Initial Development Baseline

Status: historical foundation record, 2026-08-31

## Generated Skeleton

The adapter skeleton was generated with the official
`@iobroker/create-adapter` version `3.1.5` and then reviewed before it was
merged into this repository.

Relevant selections:

- adapter-only TypeScript project with a build step;
- minimum Node.js version 22;
- daemon, compact mode, local connection, push data source;
- JSON Admin UI without product configuration fields;
- official ioBroker ESLint configuration, Prettier, coverage, package tests,
  integration tests, and the Node.js 22/24 CI matrix.

## Deliberate Deviations

- The creator's MIT selection is now the accepted project license. The root
  `LICENSE`, npm package metadata, `THIRD_PARTY_NOTICES.md`, and ADR 0003 record
  the decision and its source-provenance rules.
- The generated configuration examples were removed. Real configuration is
  introduced only when a PoC requirement has been proven.
- The creator's placeholder icon was replaced with the project branding. The
  compact transparent icon is the ioBroker adapter icon; the full transparent
  logo is used in the README and packaged Admin assets.
- The generated demonstration state and sample credential checks were removed.
  At this initial baseline, the only runtime state was the standard
  `info.connection` indicator.
- The optional local `@iobroker/dev-server` was removed after the initial audit
  found unfixed high and critical advisories in its legacy BrowserSync toolchain.
  It is not required for build, package, or integration tests.

## Dependency Audit

The initial production dependency audit reports no known vulnerabilities. The
full development tree still contains advisories inherited through the official
ioBroker testing stack. They do not enter the published runtime package and no
non-breaking upstream fix is currently available. Recheck both production and
development dependencies whenever the creator baseline or testing packages are
updated.

## Runtime Matrix

The declared development and CI matrix is Node.js 22 and 24. The recorded
baseline passed unit tests, package tests, and the production build with Node.js
22.23.2 and 24.20.0. GitHub Actions provides the supported-runtime integration
matrix.

## Subsequent Gate

The foundation was followed by an isolated compatibility PoC for the selected
Apple SDK candidate. It verified CommonJS adapter output interoperability with
the ESM-only SDK and recorded discovery and cleanup behavior before production
adoption.
