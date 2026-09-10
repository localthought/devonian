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

Pure forward/reverse mappings now live in `lens/`, with a public entry point at
`devonian/platform-lenses/github-issues/lens`. `project` reads GitHub issues;
`unproject` writes the projection back onto a supplied issue without dropping
unmanaged fields. `issueFields` and `issuePatch` are used by the existing runtime.
`lens/resources.mjs` holds the bridge's bidirectional Atomic property mapping.
The adapter re-exports its previous mapping API for compatibility. The bridge,
ports, proxy, and plugin continue to own effects and synchronization state.
