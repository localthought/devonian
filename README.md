# Bidirectional Lenses for Data Portability
## Work in Progress

[API docs](https://tubsproject.github.io/devonian/)

[![A Tiktaalik leaving its pond in search for another one](https://cdn.mos.cms.futurecdn.net/fi8nrWxvEb5sowf5jkQ8RY-700-80.jpg.webp)](https://www.livescience.com/43596-devonian-period.html)

Inspired by [the Cambria Project](https://github.com/inkandswitch/cambria-project), Devonian drops the DSL approach and adds a focus on mapping between not just differences in schema, but also differences in primary key assignment between two Systems of Record.

*Identifier Maps are the Vector Clocks of Data Portability.*

## Native Atomic Data API

New integrations can use `AtomicStore`, `AtomicIdentityMap`, and `AtomicLens` with Atomic Data resources as their native format. Resources use subject URLs and typed property URLs; platform JSON stays in connector transformations. JSON-AD snapshots include scoped external identity mappings. The awaitable lens supports creation, updates and deletion, with explicit field removal and no automatic write-back on import.

See the [Atomic Data guide](docs/atomic-data.md) for the API, supported JSON-AD profile, persistence, connector contracts, and limitations. The [Atomic Extract Entity example](examples/AtomicExtractEntity.ts) maps flattened orders to linked Order and Customer resources. The original row API remains available; existing applications are not automatically migrated. Signed Atomic Commits and live Atomic Server transport are follow-up work.

## Local Identifiers and IdMaps
What I think none of the other lens projects are currently offering is a built-in way to deal with the mapping of local identifiers.

In Tubs I'm not using Devonian to track schema evolution in a single system of record, but to create bridge bots between multiple systems of record (APIs of SaaS platforms).

For instance if I'm bridging a GitHub issue tracker with a Jira one, and in the GitHub issue tracker a new issue has appeared, then this issue will have a GitHub-local identifier, for instance `15`. My bridge bot will be woken up by a webhook, fetch the JSON for issue 15, and do an API call to Jira to create a corresponding issue in the Jira tracker. I will add `{ github: 15 }` in a custom field in the metadata. Now the Jira API will respond with the Jira-local identifier, for instance `37`, and I will add a metadata comment `{ jira: 37 }` to the GitHub issue.

This way, if I kill my bridge bot and restart it on a different server, it will find back these "foreign IDs" notes in the metadata, and know how these issues were already synced, instead of thinking they are unrelated issues that still need to be synced.

## Comparison with other lens projects
### Cambria
My first starting point was to take Cambria, even though it was clearly labeled as a research project and not a production ready tool. The reason I stopped using Cambria as my basis is that I found [its list of lens operations](https://github.com/inkandswitch/cambria-project/tree/26fca3231053e96edaac9ad13e88db0be4ab4668?tab=readme-ov-file#lens-operations) too restricting in what a lens can do. For instance, I couldn't find a way to convert a number to a string. I wanted to switch from writing lenses in a DSL to writing lenses in a general purpose programming language like JavaScript. Also, while Cambria can convert individual database rows and their schema, it doesn't seem fit for translations between multiple related database tables, nor for translation of operations.

### Jonathan Edwards 'Edit History'
In [Braid meeting 106](https://braid.org/meeting-106) (from 48:30), Jonathan Edwards presented his experiment that treats a schema conversion as an edit operation in a spreadsheet. This also uses a DSL with operations like `split-table` and `join`. I have yet to study this further to understand the benefits of using a DSL over using a Turing-complete language. I think it has something to do with applying a schema change in a distributed database, but I'll update this section as soon as I understand more of it.

### Express Schema
Jonathan Schickling pointed me to [Effect Schema Transformations](https://effect.website/docs/schema/transformations/#async-transformations) which looks like it can do a lot of the things I want to, including transformations that require an API call. I will try using it and update this section with my findings. Maybe it means I don't need to create my own lens project and I can just use Effect Schema instead. :)

### Lens VM
[Source Inc.](https://source.network/) are working on [Lens VM](https://github.com/lens-vm/lens-vm.org/blob/master/content/about.md) which uses WASM to define lenses and content ID's to identify database rows. I will try this out as soon as there is a bit more documentation. 

I think Lens VM also has a concept of foreign IDs and id maps, but I think it is tied to content IDs, which might be too restrictive when syncing issue trackers and other types of data.

For instance in a bank account statement, if I transfer 100 euros from my savings account to my current account, and then do the same again on the same day, some CSV export formats will meaningfully represent this as two identical rows in the CSV file (date, amount, from, to), and refering to these rows by content ID would incorrectly collapse them into a single row.

## How the legacy row API works
The core is in DevonianLens which is very simple: it links corresponding database tables on different systems of record (e.g. bridging a Slack channel with a Matrix room, copying over messages from one to the other), and calls a 'left to right' translation function when a change happens on the left, then add the result on the right. So far only additions have been implemented; updates and deletions coming soon. Here is an implementation of the ['Extract Entity' challenge](https://arxiv.org/pdf/2309.11406):
```ts
new DevonianLens<AcmeComprehensiveOrderWithoutId, AcmeLinkedOrderWithoutId, AcmeComprehensiveOrder, AcmeLinkedOrder>(
      this.acmeComprehensiveOrderTable,
      this.acmeLinkedOrderTable,
      async (input: AcmeComprehensiveOrder): Promise<AcmeLinkedOrder> => {
        const customerId = await this.acmeCustomerTable.getPlatformId({
          name: input.customerName,
          address: input.customerAddress,
          foreignIds: {},
        }, true);
        const linkedId = this.index.convertId('order', 'comprehensive', input.id.toString(), 'linked');
        const ret = {
          id: linkedId as number,
          item: input.item,
          quantity: input.quantity,
          shipDate: input.shipDate,
          customerId: customerId as number,
          foreignIds: this.index.convertForeignIds('comprehensive', input.id.toString(), input.foreignIds, 'linked'),
        };
        return ret;
      },
      async (input: AcmeLinkedOrder): Promise<AcmeComprehensiveOrder> => {
        const comprehensiveId = this.index.convertId('order', 'linked', input.id.toString(), 'comprehensive');
        const customer = await this.acmeCustomerTable.getRow(input.customerId);
        const ret = {
          id: comprehensiveId as number,
          item: input.item,
          quantity: input.quantity,
          shipDate: input.shipDate,
          customerName: customer.name,
          customerAddress: customer.address,
          foreignIds: this.index.convertForeignIds('linked', input.id.toString(), input.foreignIds, 'comprehensive'),
        };
        return ret;
      },
    );
```

Apart from the translation of differently named JSON fields, when copying a message from Slack to Matrix, it will be assigned a newly minted primary key on Matrix, and the bridge needs to keep track of which Slack message ID corresponds to which Matrix message ID.
The `DevonianIndex` class keeps track of different identifiers an object may have on different platforms, and generates a `ForeignIds` object for each platform. If a platform API offers a place for storing custom metadata, the `ForeignIds` object can be stored there.

## Link with Automerge
You can choose between InMemory or [Automerge](https://automerge.org) storage. If two sides update a conflicting thing, InMemory storage will lead to Last Write Wines, whereas with Automerge the hope is that conflicting changes can be handled more gracefully in more situations. This is a topic of ongoing research though, and I don't have a good example yet that shows this in action.

## Usage
Short answer: DON'T.
Take into account that this is a work in progress, and the version you see now may become deprecated overnight without warning.
See the [examples folder](https://github.com/tubsproject/devonian/blob/main/examples/) for inspiration.
More documentation coming soon.

## Contributing
Please [create an issue](https://github.com/tubsproject/devonian/issues/new) with any feedback you might have.
```sh
pnpm install
pnpm build
pnpm test
pnpm lint
pnpm prettier
pnpm typedoc
git commit
pnpm version patch
git push
git push --tags
pnpm build:release
pnpm publish
```
The native resource API accepts HTTP(S) and DID identities, including AtomicServer `did:ad:` resources, properties and links. Identity allocation still uses an HTTP(S) base; bind existing DID resources explicitly. See [Atomic Data API](docs/atomic-data.md).
