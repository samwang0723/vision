/* eslint-disable @typescript-eslint/no-explicit-any */
export interface Primitive {
  type: 'resource' | 'tool' | 'prompt';
  value: any;
}
