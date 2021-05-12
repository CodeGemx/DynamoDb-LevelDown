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
exports.DynamoS3 = void 0;
const utils_1 = require("./utils");
/* @internal */
class DynamoS3 {
    static syncS3(items, dynamoDbAsync, s3Async, s3AttachmentDefs) {
        return __awaiter(this, void 0, void 0, function* () {
            const result = yield DynamoS3.savableWithS3DelKeys(items, s3AttachmentDefs, dynamoDbAsync);
            const attachments = result.savables.map(s => s.attachments).reduce((p, c) => [...p, ...c], []);
            if (attachments.length > 0) {
                yield Promise.all([s3Async.putObjectBatch(...attachments), s3Async.deleteObjectBatch(...result.delKeys)]);
            }
            return result.savables.map(s => s.newValue);
        });
    }
    static savableWithS3DelKeys(items, s3AttachmentDefs, dynamoDbAsync) {
        return __awaiter(this, void 0, void 0, function* () {
            const allItems = yield dynamoDbAsync.getBatch(items.map(i => i.key)).then(r => {
                const merged = Object.keys(r)
                    .map(key => ({ key, value: utils_1.dataFromItem(r[key]) }))
                    .concat(...items.filter(i => !r[i.key]));
                return merged;
            });
            const result = DynamoS3.withAttachmentKeys(allItems, batch => {
                const s3Keys = Object.keys(batch)
                    .map(itemKey => ({ itemKey, s3Keys: Object.values(batch[itemKey]).map(p => p._s3key) }))
                    .reduce((p, c) => (Object.assign(Object.assign({}, p), { [c.itemKey]: c.s3Keys })), {});
                return items
                    .map(i => {
                    const savable = utils_1.extractAttachments(i.key, i.value, s3AttachmentDefs);
                    const nowS3Keys = savable.attachments.map(a => a.key);
                    return { savable, delKeys: s3Keys[i.key].filter(k => !nowS3Keys.includes(k)) };
                })
                    .reduce((p, c) => ({ savables: p.savables.concat(c.savable), delKeys: p.delKeys.concat(...c.delKeys) }), {
                    savables: new Array(),
                    delKeys: new Array()
                });
            });
            return result;
        });
    }
    static maybeDelete(keys, dynamoDbAsync, s3Async) {
        return __awaiter(this, void 0, void 0, function* () {
            if (keys.length === 0)
                return;
            let items = yield dynamoDbAsync
                .getBatch(keys)
                .then(batch => Object.keys(batch).map(key => ({ key, value: batch[key] })));
            if (items.length > 0) {
                yield DynamoS3.withAttachmentKeys(items, (batch) => __awaiter(this, void 0, void 0, function* () {
                    const s3Keys = Object.keys(batch)
                        .map(itemKey => Object.values(batch[itemKey]).map(p => p._s3key))
                        .reduce((p, c) => p.concat(...c), []);
                    if (s3Keys.length > 0) {
                        return s3Async.deleteObjectBatch(...s3Keys);
                    }
                    return Promise.resolve();
                }));
            }
        });
    }
    static maybeRestore(key, value, s3Async, s3AttachmentDefs) {
        return __awaiter(this, void 0, void 0, function* () {
            return DynamoS3.withAttachmentKeys([{ key, value }], (batch) => __awaiter(this, void 0, void 0, function* () {
                const s3Keys = Object.values(batch[key]).map(e => e._s3key);
                if (s3Keys.length > 0) {
                    return yield s3Async
                        .getObjectBatch(...s3Keys)
                        .then(attachments => utils_1.restoreAttachments(value, batch[key], attachments, s3AttachmentDefs));
                }
                return Promise.resolve(value);
            }));
        });
    }
    static withAttachmentKeys(items, cb) {
        return cb(items.reduce((p, c) => (Object.assign(Object.assign({}, p), { [c.key]: utils_1.extractS3Pointers(c.key, c.value) })), {}));
    }
}
exports.DynamoS3 = DynamoS3;
//# sourceMappingURL=dynamoS3.js.map