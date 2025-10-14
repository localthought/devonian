import { Schema } from 'effect';
import { DevonianClient } from '../../src/DevonianClient.js';
import { IdentifierMapSchema } from '../../src/IdentifierMap.js';
import { DevonianModelSchema } from '../../src/DevonianModel.js';

export const FrontDocSchemaWithoutId = Schema.Struct({
  ... DevonianModelSchema.fields,
  documentType: Schema.String,
  direction: Schema.String,
  senderId: Schema.String,
  receiverId: Schema.String,
  createdAt: Schema.Date,
  foreignIds: IdentifierMapSchema,
});
export type FrontDocWithoutId = typeof FrontDocSchemaWithoutId.Type;

export const FrontDocSchema = Schema.Struct({
  ... FrontDocSchemaWithoutId.fields,
  id: Schema.Union(Schema.String, Schema.Undefined),
});
export type FrontDoc = typeof FrontDocSchema.Type;

export class FrontDocClient extends DevonianClient<FrontDocWithoutId, FrontDoc> {
  async add(obj: FrontDocWithoutId): Promise<FrontDoc> {
    const ret = Object.assign({ uuid: 'uuid' }, obj);
    // console.log('make an API call to post this message to Slack', obj);
    return ret;
  }
}
    
