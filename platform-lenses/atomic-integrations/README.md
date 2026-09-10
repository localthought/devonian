# Atomic integrations

This package contains the Clockify and Notion provider adapters, Atomic-side
installers, bundled plugin sources, and their setup UI extracted from Atomic.
The provider behavior and JSON plugin contracts are unchanged.

`integrationRegistry` is the host-facing registry. It exports `{ id, label,
Component }` descriptors for the Clockify and Notion setup panels; consumers
decide where those panels appear.

The package expects the consuming Vite application to provide these aliases:

- `@integration-host/import-records`, `@integration-host/plugin-connection`,
  `@integration-host/plugin-manifest`, `@integration-host/plugin-reconcile`,
  `@integration-host/loro-loader`, `@integration-host/ontologies/core`,
  `@integration-host/ontologies/dataBrowser`, and
  `@integration-host/time-tracking-schema` for generic integration runtime APIs.
- `@integration-host/navigation`, `@integration-host/runScript`,
  `@integration-host/RunPluginDialog`, and `@integration-host/table/*` for
  host actions and table creation widgets.
- `@components/*` and `@hooks/*` remain peer UI interfaces supplied by the
  host application.

Atomic primitives come from `@tomic/lib` and `@tomic/react`. The package does
not import from an Atomic checkout path, and plugin JavaScript bundles remain
available for host installation and upgrades.
