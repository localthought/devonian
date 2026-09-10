# Devonian GitHub issues lens

This package contains the GitHub issue and comment lens used by the browser
demo. It depends on Devonian's generic native Atomic resource API and receives
the host runtime, connector ports, credential transport, and persistence from
the caller.

The stable entry point is `createBridge(host, options)` from `index.mjs`.
Hosts select the package by the versioned `descriptor.json`; provider code is
kept beside the lens and is never imported by Devonian's generic runtime.

The copied browser tests retain deterministic fixture and recovery coverage.
They require the host browser dependencies and are run by the consuming
application until this package has a standalone browser test harness.
