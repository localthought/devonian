import { Schema } from 'effect';
import { DevonianClient } from '../../src/DevonianClient.js';
import { IdentifierMapSchema } from '../../src/IdentifierMap.js';
import { DevonianModelSchema } from '../../src/DevonianModel.js';

export const PeppyrusDocSchemaWithoutId = Schema.Struct({
  ... DevonianModelSchema.fields,
  documentType: Schema.String,
  folder: Schema.String,
  sender: Schema.String,
  recipient: Schema.String,
  created: Schema.Date,
  foreignIds: IdentifierMapSchema,
});
export type PeppyrusDocWithoutId = typeof PeppyrusDocSchemaWithoutId.Type;

export const IonDocSchema = Schema.Struct({
  ... PeppyrusDocSchemaWithoutId.fields,
  id: Schema.Union(Schema.String, Schema.Undefined),
});
export type PeppyrusDoc = typeof IonDocSchema.Type;

export class PeppyrusDocClient extends DevonianClient<PeppyrusDocWithoutId, PeppyrusDoc> {
  async add(obj: PeppyrusDocWithoutId): Promise<PeppyrusDoc> {
    const ret = Object.assign({ id: 'id' }, obj);
    // console.log('make an API call to post this message to Slack', obj);
    return ret;
  }
}
    
