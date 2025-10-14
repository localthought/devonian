import { Schema } from 'effect';
import { DevonianClient } from '../../src/DevonianClient.js';
import { IdentifierMapSchema } from '../../src/IdentifierMap.js';
import { DevonianModelSchema } from '../../src/DevonianModel.js';

export const RecommandDocSchemaWithoutId = Schema.Struct({
  ... DevonianModelSchema.fields,
  type: Schema.String,
  direction: Schema.String,
  senderId: Schema.String,
  receiverId: Schema.String,
  date: Schema.Date,
  foreignIds: IdentifierMapSchema,
});
export type RecommandDocWithoutId = typeof RecommandDocSchemaWithoutId.Type;

export const RecommandDocSchema = Schema.Struct({
  ... RecommandDocSchemaWithoutId.fields,
  id: Schema.Union(Schema.String, Schema.Undefined),
});
export type RecommandDoc = typeof RecommandDocSchema.Type;

export class RecommandDocClient extends DevonianClient<RecommandDocWithoutId, RecommandDoc> {
  async add(obj: RecommandDocWithoutId): Promise<RecommandDoc> {
    const ret = Object.assign({ id: 'id' }, obj);
    // console.log('make an API call to post this message to Slack', obj);
    return ret;
  }
}
    
