export interface InsertOneResult {
    acknowledged: boolean;
    insertedId: string;
}

export interface InsertManyResult {
    acknowledged: boolean;
    insertedIds: string[];
}

export interface UpdateOneResult {
    matchedCount: number;
    modifiedCount: number;
}

export interface UpdateManyResult {
    matchedCount: number;
    modifiedCount: number;
}

export interface DeleteOneResult {
    deletedCount: number;
}

export interface DeleteManyResult {
    deletedCount: number;
}
