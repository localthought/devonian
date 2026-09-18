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

## Example: a GitHub issue and its comments

Here is a representative GitHub issue response, together with two entries from
its separate comments endpoint. The outer `issue` / `comments` wrapper is only
for this example; GitHub returns them through separate requests.

```json
{
  "issue": {
    "number": 42,
    "title": "Keep the selected calendar after refresh",
    "body": "Refreshing the page resets the selection to **All calendars**.",
    "state": "open",
    "labels": [{ "name": "bug" }, { "name": "atomic:doing" }],
    "html_url": "https://github.com/example/calendar/issues/42"
  },
  "comments": [
    {
      "id": 101,
      "body": "I can reproduce this in Firefox.",
      "issue_url": "https://api.github.com/repos/example/calendar/issues/42",
      "user": { "login": "alice" },
      "html_url": "https://github.com/example/calendar/issues/42#issuecomment-101"
    },
    {
      "id": 102,
      "body": "The fix is ready for review.",
      "issue_url": "https://api.github.com/repos/example/calendar/issues/42",
      "user": { "login": "bob" },
      "html_url": "https://github.com/example/calendar/issues/42#issuecomment-102"
    }
  ]
}
```

The corresponding Atomic representation is a graph of three resources: one
tracker row and two native `Message` resources linked to it through `about`.
Comments are not embedded in the issue object. This JSON-AD example shows the
content and membership properties written through `AtomicPort`; runtime identity
and provenance bookkeeping are omitted.

The `https://example.com/atomic/...` subjects below are illustrative,
installation-specific identities. The tracker row class and GitHub-number
property are configured by the installation; there is no fixed global issue
class in this mapping. The `https://atomicdata.dev/...` properties and status tag
are the native Atomic vocabulary actually used by the implementation.

```json
[
  {
    "@id": "https://example.com/atomic/issues/issue-a",
    "https://atomicdata.dev/properties/isA": [
      "https://example.com/atomic/schema/github-issue"
    ],
    "https://atomicdata.dev/properties/parent": "https://example.com/atomic/issues",
    "https://atomicdata.dev/properties/name": "Keep the selected calendar after refresh",
    "https://atomicdata.dev/task/v1/body": "Refreshing the page resets the selection to **All calendars**.",
    "https://atomicdata.dev/task/v1/status": [
      "https://atomicdata.dev/task/v1/doing"
    ],
    "https://example.com/atomic/schema/github-issue-number": 42
  },
  {
    "@id": "https://example.com/atomic/comments/comment-a",
    "https://atomicdata.dev/properties/isA": [
      "https://atomicdata.dev/classes/Message"
    ],
    "https://atomicdata.dev/properties/parent": "https://example.com/atomic/comments",
    "https://atomicdata.dev/properties/about": "https://example.com/atomic/issues/issue-a",
    "https://atomicdata.dev/properties/description": "I can reproduce this in Firefox."
  },
  {
    "@id": "https://example.com/atomic/comments/comment-b",
    "https://atomicdata.dev/properties/isA": [
      "https://atomicdata.dev/classes/Message"
    ],
    "https://atomicdata.dev/properties/parent": "https://example.com/atomic/comments",
    "https://atomicdata.dev/properties/about": "https://example.com/atomic/issues/issue-a",
    "https://atomicdata.dev/properties/description": "The fix is ready for review."
  }
]
```

The field correspondence is:

| GitHub | Atomic tracker representation |
| --- | --- |
| Issue `title` | `https://atomicdata.dev/properties/name` |
| Issue `body` | `https://atomicdata.dev/task/v1/body` |
| Open issue with `atomic:doing` label | Status `[https://atomicdata.dev/task/v1/doing]` |
| Open issue without that label | Status `[https://atomicdata.dev/task/v1/todo]` |
| Closed issue, regardless of labels | Status `[https://atomicdata.dev/task/v1/done]` |
| Issue `number` | Installation's GitHub-number property, kept as a number |
| Comment `body` | Message `https://atomicdata.dev/properties/description` |
| Comment's issue association | Message `https://atomicdata.dev/properties/about`, pointing to the Atomic issue subject |

The pure issue lens first produces
`{ title, body, status: 'Doing' }`; the resource mapping expresses those fields
using Atomic property URLs. The bridge temporarily represents comment bodies
with the task body property internally, while `AtomicPort` writes native Messages
using `description` and `about`, as shown above.

In the reverse direction, editing the Atomic title/body updates the corresponding
GitHub fields, changing the status to Done closes the issue, and editing a
Message's description updates its linked GitHub comment. Unrelated labels such
as `bug` remain outside the mapped fields. GitHub comment IDs and issue numbers
are bound to Atomic subjects within their repository/entity scopes, rather than
being inferred from text or array positions. Author names and source URLs are
retained as metadata through the configured provenance property; they are not
turned into Atomic authorship claims. Atomic's Blocked status is not mapped.
