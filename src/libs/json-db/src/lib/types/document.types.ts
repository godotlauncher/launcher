export type JsonDbDocument<T extends object> = Omit<T, '_id'> & { _id: string };
