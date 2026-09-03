# ADR 0004: PoC Credential Handling

- Status: accepted
- Date: 2026-08-31

## Context

The Apple TV PoC must prove that pairing credentials can be serialized, loaded
in a new process, and used for reconnect. These credentials contain long-term
private key material. The separate PoC workspace does not yet run inside an
ioBroker adapter and therefore cannot validate the final ioBroker credential
store.

## Decision

For the disposable PoC only, store one pairing record in a dedicated private
directory outside the deployed source tree. Create the directory with mode
`0700` and the credential file with mode `0600`, refuse to overwrite an existing
file, validate the versioned schema on load, and never print credential fields.

The local file contains base64-serialized key material and is not encrypted at
rest. This is accepted only for the isolated, access-controlled development
target and must not be reused by the adapter runtime or distributed package.
The path and its contents remain untracked and must be removed after the PoC.

Before pairing is integrated into `apple.<instance>`, accept a separate ADR for
the ioBroker-native protected/encrypted persistence mechanism, backup/restore,
migration, deletion, and redaction behavior.

## Consequences

The PoC can test process-independent credential reload without committing or
logging secrets. Filesystem administrators of the test host can still read the
material, and disk encryption is outside this PoC. Successful reload proves SDK
serialization compatibility only, not production credential security.

## Validation

Unit tests verify round-trip serialization, owner-only file mode, schema
validation, and refusal to overwrite. Linux aarch64 real-device validation confirmed
pairing, a `0600` file owned by the unprivileged runtime user, new-process
reload, independent AirPlay and Companion Link connection health, and clean
disconnect without printing the PIN or credentials.
