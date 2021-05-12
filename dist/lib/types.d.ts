/// <reference types="node" />
import { DynamoDB, S3 } from 'aws-sdk';
import { AbstractIteratorOptions } from 'abstract-leveldown';
export declare enum BillingMode {
    'PROVISIONED' = "PROVISIONED",
    'PAY_PER_REQUEST' = "PAY_PER_REQUEST"
}
export interface S3Options {
    client: S3;
    attachments: AttachmentDefinition[];
}
export interface Options {
    useConsistency?: boolean;
    billingMode?: BillingMode;
    s3?: S3Options;
}
export declare type AttachmentDefinition = {
    match: RegExp;
    contentTypeKey: string;
    dataKey: string;
    dataEncoding?: BufferEncoding;
};
export declare type LevelKey = string;
export interface IteratorOptions extends AbstractIteratorOptions<any> {
    start?: LevelKey;
    end?: LevelKey;
    lastKey?: DynamoDB.Key;
    inclusive?: boolean;
}
