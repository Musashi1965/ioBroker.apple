# ADR 0001: Project Identity

- Status: accepted
- Date: 2026-08-31
- Amendment: 2026-09-03 (existing-adapter assessment)

## Context

The initial concept used the working title `apple-media`. The project repository
is named `ioBroker.apple`. ioBroker distinguishes the canonical GitHub
repository spelling from the lowercase npm package name.

A prior-art review also identified the paused, unpublished
`h2okopfmt/ioBroker.apple-tv` draft. Its narrower adapter identity and materially
different runtime, persistence, and object-contract architecture do not provide
an incremental base for the unified Apple media scope defined here.

## Decision

Use the following identifiers:

- product/title: `Apple`;
- canonical GitHub repository: `ioBroker.apple`;
- npm package: `iobroker.apple`;
- adapter ID: `apple`;
- instance namespace: `apple.<instance>`.

`apple-media` is historical terminology only and is not used for package,
adapter, or state identifiers.

Continue `ioBroker.apple` as an independent implementation. The prior
`ioBroker.apple-tv` source is not used as an implementation base, and no source
from it is copied or adapted.

## Consequences

The short ID leaves room for Apple TV, HomePod, AirPlay, Apple Music, and future
Apple-media capabilities without a later package rename. It also requires care
not to imply support for unrelated Apple services.

## Alternatives Considered

- `apple-media`: descriptive, but no longer matches the created repository.
- contribute to `h2okopfmt/ioBroker.apple-tv`: rejected as the primary path
  because the reviewed project is paused and unpublished, has no tests or CI,
  and its Python auto-install, backend, identity, persistence, streaming, and
  public-contract choices differ materially from this architecture. Adopting
  the target design there would be a replacement rather than an incremental
  contribution.
- extend `iobroker.icloud` or `iobroker.apple-device-finder`: rejected because
  those packages address iCloud/Find My use cases rather than local Apple media
  control.
- separate adapters per Apple protocol/device: cleaner packages but unable to
  provide the intended unified player and scene contract without another
  coordination layer.

## Validation

Repository, package, adapter, and namespace metadata use the accepted
identifiers. The supporting landscape review is recorded in
`docs/UPSTREAM_RESEARCH.md`.
