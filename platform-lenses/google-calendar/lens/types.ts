import type { Datatype, JSONValue } from '@tomic/lib';
export type { JSONValue } from '@tomic/lib';

export interface Term {
  path: string;
  kind: 'class' | 'property';
  shortname: string;
  description: string;
  datatype: Datatype;
  requires: string[];
  recommends: string[];
}
export interface FetchedRecord {
  resource: string;
  namespace: string;
  id: string;
  name: string;
  values: Record<string, JSONValue>;
}
export interface FetchedPlatform {
  platform: string;
  ontology: { description: string; terms: Term[] };
  records: FetchedRecord[];
}
