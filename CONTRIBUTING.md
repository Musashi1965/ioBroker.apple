# Contributing to ioBroker.apple

Contributions are welcome. Please keep changes focused. Describe user-visible
behavior, compatibility impact, and validation performed.

## Development setup

The project requires Node.js 22 or 24.

```bash
npm install
npm run check:quick
```

Use `npm run check:full` for changes to protocol behavior, dependencies,
credentials or persistence, the public ioBroker object contract, runtime
compatibility, packaging, or multiple architectural layers.

## Public adapter contract

Treat ioBroker object and state IDs, types, roles, read/write flags,
acknowledgement semantics, configuration fields, messages, persisted data, and
documented runtime requirements as public interfaces. Compatibility-affecting
changes require an architecture decision record, migration notes, and the
release classification defined by
[ADR 0008](docs/decisions/0008-semantic-versioning.md).

Use capability detection for writable functionality. Do not expose controls
that the connected device or backend does not support. Real-device behavior
must be identified as tested only when the relevant device and software version
have actually been verified.

## Security and privacy

Do not include credentials, pairing PINs, Apple keys, tokens, cookies, private
addresses, real device or account names, packet captures, logs, or installation-
specific ioBroker IDs. Use neutral fixtures and reserved example values.

Review the license and provenance of every new dependency or adapted source.
The project is MIT-licensed, and GPL-licensed implementations may be used only
as behavioral references. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
and [ADR 0003](docs/decisions/0003-project-license.md).

## Pull requests

Open focused pull requests against `main`. Include relevant tests and update the
README, architecture documentation, decision records, or changelog when public
behavior changes. GitHub Actions must pass before a change is released.
