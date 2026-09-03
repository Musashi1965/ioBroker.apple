# ADR 0018: ioBroker-Owned Timer Scheduler

- Status: accepted
- Date: 2026-09-03

## Context

Discovery refresh, pairing deadlines, child-process termination, and HomePod
connection deadlines require timers. Direct Node.js timers are not registered
with the ioBroker adapter lifecycle and contradict current ioBroker adapter
guidance. Passing the complete adapter into protocol and domain layers would,
however, make those layers platform-dependent and harder to test.

## Decision

Define a narrow project-owned `TimerScheduler` interface with timeout and
interval creation and cancellation. The production composition root adapts
`adapter.setTimeout`, `adapter.clearTimeout`, `adapter.setInterval`, and
`adapter.clearInterval` to this interface and injects the same scheduler into
the runtime, discovery process, pairing coordinator, and HomePod backend.

Protocol and runtime modules must not call native Node.js timer functions
directly. Native timers are permitted only in isolated tests that run without
an ioBroker adapter instance.

Every component remains responsible for cancelling its own handles when work
finishes or during explicit stop. ioBroker ownership is an additional lifecycle
safety net, not a replacement for deterministic cleanup.

## Consequences

- All production timers are visible to and owned by the active ioBroker adapter.
- Protocol and domain layers remain independent of ioBroker types and lifecycle
  objects.
- Unit tests may inject deterministic schedulers and verify cancellation
  without waiting for wall-clock intervals.
- New timed behavior must accept the shared scheduler rather than importing or
  calling native timer functions.

## Alternatives Considered

- Use native Node.js timers and clear them manually: rejected because it misses
  ioBroker lifecycle ownership even when local cleanup is correct.
- Pass the complete adapter into every timed component: rejected because it
  couples protocol and domain code to ioBroker and expands the trusted boundary.
- Use an additional scheduling dependency: rejected because four small timer
  operations do not justify another runtime package.

## Validation

Contract tests verify delegation to ioBroker, runtime interval registration and
stop-time cancellation, pairing timeout cleanup, and bounded HomePod connection
failure. Static source inspection confirms that native timers remain only in
the unit-test scheduler and browser-side Admin components.
