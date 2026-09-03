# ADR 0003: Project License And Source Provenance

- Status: accepted
- Date: 2026-08-31

## Context

The adapter is intended for public GitHub, npm, and ioBroker distribution. The
preferred TypeScript protocol packages are MIT-licensed. Relevant reference
projects use both MIT and GPL-3.0, so the project needs an explicit license and
a rule that prevents accidental license contamination.

## Decision

Release the project's original software, documentation, and neutral examples
under the MIT License with copyright attributed to `C@ptain Ch@os`.

Use a provenance-first dependency policy:

- prefer normal package dependencies to vendored source;
- record source, version/commit, license, and intended use;
- preserve required copyright and license notices for copied or distributed
  third-party material;
- do not copy, adapt, translate, or vendor GPL-3.0 source into this MIT project;
- use GPL projects only as behavioral references and implement required
  behavior independently;
- keep external service terms and trademarks separate from the software
  license.

Maintain `THIRD_PARTY_NOTICES.md` as the human-reviewed source record. Generate
or verify the complete dependency-license inventory as part of the release
process.

## Consequences

Users may use, modify, redistribute, sublicense, and sell copies under the MIT
conditions. The copyright and permission notice must remain with substantial
copies of the software. The software is provided without warranty.

The permissive license supports broad ioBroker adoption but does not grant
rights to Apple or Amazon services, trademarks, content, protocols, patents, or
third-party code beyond their own applicable terms.

Contributions must include a license review before introducing copied code or a
dependency with non-permissive or unclear terms.

## Alternatives Considered

- GPL-3.0: rejected because mandatory copyleft is not the desired distribution
  model for this adapter.
- Apache-2.0: considered for its explicit patent language, but rejected in favor
  of the simpler MIT alignment with the preferred protocol SDK and common
  ioBroker practice.
- No license: rejected because it would not grant users the rights required for
  an open-source adapter.

## Validation

- Root `LICENSE` contains the standard MIT text.
- `THIRD_PARTY_NOTICES.md` records the currently reviewed sources and the GPL
  boundary.
- Project documentation and package metadata identify MIT as the binding
  project license.
