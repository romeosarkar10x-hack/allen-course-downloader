export type KeyOfUnion<U extends object> = U extends infer T ? keyof T : never;
export type OmitFromUnion<U extends object, K extends KeyOfUnion<U> | string> = U extends infer T ? Omit<T, K> : never;
