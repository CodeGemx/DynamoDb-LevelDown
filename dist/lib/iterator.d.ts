import { AbstractIterator, ErrorKeyValueCallback } from 'abstract-leveldown';
import { DynamoDbDown } from './dynamoDbDown.js';
import { DynamoDbAsync } from './dynamoDbAsync.js';
import { IteratorOptions } from './types.js';
export declare class DynamoDbIterator extends AbstractIterator {
    private dynamoDb;
    private hashKey;
    private options;
    private results;
    private seekTarget?;
    private keyAsBuffer;
    private isOutOfRange;
    private valueAsBuffer;
    private endEmitted;
    constructor(db: DynamoDbDown, dynamoDb: DynamoDbAsync, hashKey: string, options: IteratorOptions);
    _next(cb: ErrorKeyValueCallback<any, any>): Promise<void>;
    _seek(target: any): void;
    private peekNextKey;
    private readStream;
    private getOptionsRange;
    private isInRange;
    private outOfRange;
    private maybeSeek;
    private createReadStream;
    private getDataRange;
}
