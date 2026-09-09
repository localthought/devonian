import { EventEmitter } from 'node:events';
import { DevonianModel } from '../src/DevonianModel.js';

export type ModelWithoutId = DevonianModel & {
  foo: string;
};

export class MockClient<ModelWithoutId, Model> extends EventEmitter {
  added: ModelWithoutId[] = [];
  name: string;
  idFieldName: string;
  constructor(name: string, idFieldName: string = 'id') {
    super();
    this.idFieldName = idFieldName;
    this.name = name;
  }
  async add(obj: ModelWithoutId): Promise<Model> {
    const position = this.added.length;
    // console.log(`Adding in ${this.name} mock client`, obj, position);
    this.added.push(obj);
    // console.log(`In ${this.name} mock client now have ${this.added.length} rows added`;
    const ret = JSON.parse(JSON.stringify(obj));
    ret[this.idFieldName] = position;
    return ret;
  }
  fakeIncoming(obj: Model): void {
    // console.log('fake incoming in mock client', obj);
    this.emit('add-from-client', obj);
  }
}
