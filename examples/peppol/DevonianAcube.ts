import { Schema } from 'effect';
import { DevonianClient } from '../../src/DevonianClient.js';
import { IdentifierMapSchema } from '../../src/IdentifierMap.js';
import { DevonianModelSchema } from '../../src/DevonianModel.js';

export const AcubeDocSchemaWithoutId = Schema.Struct({
  ... DevonianModelSchema.fields,
  documentType: Schema.String,
  direction: Schema.String,
  sender: Schema.String,
  receiver: Schema.String,
  createdAt: Schema.Date,
  foreignIds: IdentifierMapSchema,
});
export type AcubeDocWithoutId = typeof AcubeDocSchemaWithoutId.Type;

export const AcubeDocSchema = Schema.Struct({
  ... AcubeDocSchemaWithoutId.fields,
  id: Schema.Union(Schema.String, Schema.Undefined),
});
export type AcubeDoc = typeof AcubeDocSchema.Type;

export class AcubeDocClient extends DevonianClient<AcubeDocWithoutId, AcubeDoc> {
  async add(obj: AcubeDocWithoutId): Promise<AcubeDoc> {
    const ret = Object.assign({ uuid: 'uuid' }, obj);
    // console.log('make an API call to post this message to Slack', obj);
    return ret;
  }
}
    
