import { Schema } from 'effect';
import { DevonianClient } from '../../src/DevonianClient.js';
import { IdentifierMapSchema } from '../../src/IdentifierMap.js';
import { DevonianModelSchema } from '../../src/DevonianModel.js';

export const IonDocSchemaWithoutId = Schema.Struct({
  ... DevonianModelSchema.fields,
  document_element: Schema.String,
  direction: Schema.String,
  senderId: Schema.String,
  receiverId: Schema.String,
  createdAt: Schema.Date,
  foreignIds: IdentifierMapSchema,
});
export type IonDocWithoutId = typeof IonDocSchemaWithoutId.Type;

export const IonDocSchema = Schema.Struct({
  ... IonDocSchemaWithoutId.fields,
  id: Schema.Union(Schema.String, Schema.Undefined),
});
export type IonDoc = typeof IonDocSchema.Type;

export class IonDocClient extends DevonianClient<IonDocWithoutId, IonDoc> {
  async add(obj: IonDocWithoutId): Promise<IonDoc> {
    const ret = Object.assign({ id: 'id' }, obj);
    // console.log('make an API call to post this message to Slack', obj);
    return ret;
  }
}
    
