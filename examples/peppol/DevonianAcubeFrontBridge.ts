import { Effect, Schema } from 'effect';
import { DevonianClient } from '../../src/DevonianClient.js';
import { DevonianTable } from '../../src/DevonianTable.js';
import { DevonianLens } from '../../src/DevonianLens.js';
import { DevonianIndex } from '../../src/DevonianIndex.js';
import { AcubeDocWithoutId, AcubeDoc, AcubeDocSchema } from './DevonianAcube.js';
import { FrontDocWithoutId, FrontDoc, FrontDocSchema } from './DevonianFront.js';

export class DevonianSolidSlackBridge {
  index: DevonianIndex
  AcubeDocTable: DevonianTable<AcubeDocWithoutId, AcubeDoc>;
  FrontDocTable: DevonianTable<FrontDocWithoutId, FrontDoc>;

  constructor(index: DevonianIndex, AcubeDocClient: DevonianClient<AcubeDocWithoutId, AcubeDoc>, FrontDocClient: DevonianClient<FrontDocWithoutId, FrontDoc>) {
    this.index = index;
    this.AcubeDocTable = new DevonianTable<AcubeDocWithoutId, AcubeDoc>({ client: AcubeDocClient, idFieldName: 'uri', platform: 'solid', replicaId: 'test-replica' });
    this.FrontDocTable = new DevonianTable<FrontDocWithoutId, FrontDoc>({ client: FrontDocClient, idFieldName: 'ts', platform: 'slack', replicaId: 'test-replica' });
    const transformation = Schema.transformOrFail(
      AcubeDocSchema,
      FrontDocSchema,
      {
        strict: true,
        decode: (input: AcubeDoc): Effect.Effect<FrontDoc> => {
          return Effect.succeed({
            ts: (input.uri ? this.index.convertId('message', 'solid', input.uri, 'slack') as string : undefined),
            user: (input.authorWebId ? this.index.convertId('person', 'solid', input.authorWebId, 'slack') as string : undefined),
            text: input.text,
            channel: (input.chatUri ? this.index.convertId('channel', 'solid', input.chatUri, 'slack') as string : undefined),
            foreignIds: (input.uri ? this.index.convertForeignIds('solid', input.uri, input.foreignIds, 'slack') : {}),
          } as FrontDoc);
        },
        encode: (input: FrontDoc): Effect.Effect<AcubeDoc> => {
          return Effect.succeed({
            uri: (input.ts ? this.index.convertId('message', 'slack', input.ts, 'solid') as string : undefined),
            chatUri: (input.channel ? this.index.convertId('channel', 'slack', input.channel, 'solid') as string : undefined),
            text: input.text,
            authorWebId: (input.user ? this.index.convertId('person', 'slack', input.user, 'solid') as string : undefined),
            date: (input.ts ? new Date(parseFloat(input.ts) * 1000) : undefined),
            foreignIds: (input.ts ? this.index.convertForeignIds('slack', input.ts, input.foreignIds, 'solid') : {}),
          } as AcubeDoc);
        },
      }
    );
    
    new DevonianLens<AcubeDocWithoutId, FrontDocWithoutId, AcubeDoc, FrontDoc>(
      this.AcubeDocTable,
      this.FrontDocTable,
      async (input: AcubeDoc): Promise<FrontDoc> => {
        return Effect.runPromise(Schema.decodeUnknown(transformation)(input));
      },
      async (input: FrontDoc): Promise<AcubeDoc> => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return Effect.runPromise(Schema.encodeUnknown(transformation)(input) as any);
      },
    );
  }
}
