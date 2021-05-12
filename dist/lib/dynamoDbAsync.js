"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DynamoDbAsync = void 0;
const util_1 = require("util");
const serialize_1 = require("./serialize");
const types_1 = require("./types");
const utils_1 = require("./utils");
const MAX_BATCH_SIZE = 25;
const RESOURCE_WAITER_DELAY = 1;
const defaultProvisionedThroughput = {
    ReadCapacityUnits: 5,
    WriteCapacityUnits: 5
};
/* @internal */
class DynamoDbAsync {
    constructor(dynamoDb, tableName, hashKey, useConsistency, billingMode) {
        this.dynamoDb = dynamoDb;
        this.tableName = tableName;
        this.hashKey = hashKey;
        this.useConsistency = useConsistency;
        this.billingMode = billingMode;
        this.queryAsync = util_1.promisify(this.dynamoDb.query).bind(this.dynamoDb);
        // @ts-ignore - Possible overload detection issue with AWS types
        this.waitForAsync = util_1.promisify(this.dynamoDb.waitFor).bind(this.dynamoDb);
        this.getItemAsync = util_1.promisify(this.dynamoDb.getItem).bind(this.dynamoDb);
        this.putItemAsync = util_1.promisify(this.dynamoDb.putItem).bind(this.dynamoDb);
        this.deleteItemAsync = util_1.promisify(this.dynamoDb.deleteItem).bind(this.dynamoDb);
        this.createTableAsync = util_1.promisify(this.dynamoDb.createTable).bind(this.dynamoDb);
        this.deleteTableAsync = util_1.promisify(this.dynamoDb.deleteTable).bind(this.dynamoDb);
        this.describeTableAsync = util_1.promisify(this.dynamoDb.describeTable).bind(this.dynamoDb);
        this.batchWriteItemAsync = util_1.promisify(this.dynamoDb.batchWriteItem).bind(this.dynamoDb);
        this.batchGetItemAsync = util_1.promisify(this.dynamoDb.batchGetItem).bind(this.dynamoDb);
    }
    itemKey(key) {
        return {
            Key: {
                [types_1.Keys.HASH_KEY]: { S: this.hashKey },
                [types_1.Keys.RANGE_KEY]: { S: String(key) }
            }
        };
    }
    queryItem(key) {
        return Object.assign(Object.assign({ TableName: this.tableName }, this.itemKey(key)), { ConsistentRead: this.useConsistency });
    }
    dataItem(key, value) {
        return {
            Item: Object.assign(Object.assign({}, this.itemKey(key).Key), { [types_1.Keys.DATA_KEY]: serialize_1.serialize(value) })
        };
    }
    dataTableItem(key, value) {
        return Object.assign({ TableName: this.tableName }, this.dataItem(key, value));
    }
    get(key) {
        return __awaiter(this, void 0, void 0, function* () {
            const record = yield this.getItemAsync(this.queryItem(key));
            if (!record || !record.Item)
                throw new Error('NotFound');
            return utils_1.dataFromItem(record.Item);
        });
    }
    getBatch(keys) {
        return __awaiter(this, void 0, void 0, function* () {
            if (keys.length === 0)
                return {};
            return yield this.batchGetItemAsync({
                RequestItems: {
                    [this.tableName]: {
                        Keys: keys.map(key => this.itemKey(key).Key)
                    }
                }
            }).then(result => (result.Responses ||
                /* istanbul ignore next: technically optional but can't find case where `Responses` not present  */
                {})[this.tableName].reduce((p, c) => (Object.assign(Object.assign({}, p), { [utils_1.rangeKeyFrom(c)]: utils_1.withoutKeys(c) })), {}));
        });
    }
    put(key, value) {
        return __awaiter(this, void 0, void 0, function* () {
            const item = this.dataTableItem(key, value);
            return this.putItemAsync(item);
        });
    }
    batch(array) {
        return __awaiter(this, void 0, void 0, function* () {
            const ops = [];
            const opKeys = {};
            array.forEach(item => {
                if (opKeys[item.key]) {
                    const idx = ops.findIndex(someItem => utils_1.rangeKeyFrom(someItem) === item.key);
                    ops.splice(idx, 1); // De-dupe
                }
                opKeys[item.key] = true;
                ops.push(item.type === 'del'
                    ? { DeleteRequest: this.itemKey(item.key) }
                    : { PutRequest: this.dataItem(item.key, item.value) });
            });
            const params = { RequestItems: {} };
            while (ops.length > 0) {
                params.RequestItems[this.tableName] = ops.splice(0, MAX_BATCH_SIZE);
                const response = yield this.batchWriteItemAsync(params);
                if (response && response.UnprocessedItems && response.UnprocessedItems[this.tableName]) {
                    ops.unshift(...response.UnprocessedItems[this.tableName]);
                }
            }
        });
    }
    query(params) {
        return __awaiter(this, void 0, void 0, function* () {
            return this.queryAsync(Object.assign(Object.assign({ TableName: this.tableName }, params), { ConsistentRead: this.useConsistency }));
        });
    }
    delete(key) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.deleteItemAsync(this.queryItem(key));
        });
    }
    tableExists() {
        return __awaiter(this, void 0, void 0, function* () {
            const params = { TableName: this.tableName };
            try {
                yield this.describeTableAsync(params);
            }
            catch (e) {
                return false;
            }
            return true;
        });
    }
    createTable(throughput = defaultProvisionedThroughput) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.createTableAsync({
                TableName: this.tableName,
                AttributeDefinitions: [
                    { AttributeName: types_1.Keys.HASH_KEY, AttributeType: 'S' },
                    { AttributeName: types_1.Keys.RANGE_KEY, AttributeType: 'S' }
                ],
                KeySchema: [
                    { AttributeName: types_1.Keys.HASH_KEY, KeyType: 'HASH' },
                    { AttributeName: types_1.Keys.RANGE_KEY, KeyType: 'RANGE' }
                ],
                BillingMode: this.billingMode,
                ProvisionedThroughput: this.billingMode == types_1.BillingMode.PROVISIONED ? throughput : undefined
            });
            yield this.waitForAsync('tableExists', {
                TableName: this.tableName,
                $waiter: { delay: RESOURCE_WAITER_DELAY }
            });
            return true;
        });
    }
    deleteTable() {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.deleteTableAsync({ TableName: this.tableName });
            yield this.waitForAsync('tableNotExists', {
                TableName: this.tableName,
                $waiter: { delay: RESOURCE_WAITER_DELAY }
            });
            return true;
        });
    }
}
exports.DynamoDbAsync = DynamoDbAsync;
//# sourceMappingURL=dynamoDbAsync.js.map