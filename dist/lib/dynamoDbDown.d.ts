/// <reference types="./types/level-supports" />
import { DynamoDB } from 'aws-sdk';
import { AbstractLevelDOWN, AbstractOpenOptions, ErrorCallback, AbstractOptions, AbstractGetOptions, ErrorValueCallback, AbstractBatch, AbstractIteratorOptions, AbstractIterator } from 'abstract-leveldown';
import { SupportManifest } from 'level-supports';
import * as DynamoTypes from './types';
export declare class DynamoDbDown extends AbstractLevelDOWN {
    private hashKey;
    private tableName;
    private s3Async;
    private dynamoDbAsync;
    private s3AttachmentDefs;
    constructor(dynamoDb: DynamoDB, location: string, options?: DynamoDbDown.Types.Options);
    static factory(dynamoDb: DynamoDB, options?: DynamoDbDown.Types.Options): {
        (location: string): DynamoDbDown;
        destroy(location: string, cb: ErrorCallback): Promise<void>;
    };
    readonly supports: SupportManifest;
    _close(cb: ErrorCallback): Promise<void>;
    _open(options: AbstractOpenOptions, cb: ErrorCallback): Promise<void>;
    _put(key: any, value: any, options: AbstractOptions, cb: ErrorCallback): Promise<void>;
    _get(key: any, options: AbstractGetOptions, cb: ErrorValueCallback<any>): Promise<void>;
    _del(key: any, options: AbstractOptions, cb: ErrorCallback): Promise<void>;
    _batch(array: ReadonlyArray<AbstractBatch<any, any>>, options: AbstractOptions, cb: ErrorCallback): Promise<void>;
    _iterator(options: AbstractIteratorOptions<any>): AbstractIterator<any, any>;
    deleteTable(): Promise<boolean>;
}
export declare namespace DynamoDbDown {
    export import Types = DynamoTypes;
}
