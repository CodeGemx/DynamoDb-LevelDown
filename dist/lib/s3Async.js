var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { promisify } from 'util';
/* @internal */
export class S3Async {
    constructor(s3, bucketName) {
        this.s3 = s3;
        this.bucketName = bucketName;
        if (!!s3) {
            this.putObjectAsync = promisify(this.s3.putObject).bind(this.s3);
            this.getObjectAsync = promisify(this.s3.getObject).bind(this.s3);
            this.headBucketAsync = promisify(this.s3.headBucket).bind(this.s3);
            this.createBucketAsync = promisify(this.s3.createBucket).bind(this.s3);
            this.deleteObjectAsync = promisify(this.s3.deleteObject).bind(this.s3);
            this.deleteBucketAsync = promisify(this.s3.deleteBucket).bind(this.s3);
        }
    }
    bucketExists() {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.useCallSuccess(this.headBucketAsync);
        });
    }
    createBucket() {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.useCallSuccess(this.createBucketAsync);
        });
    }
    deleteBucket() {
        return __awaiter(this, void 0, void 0, function* () {
            return yield this.useCallSuccess(this.deleteBucketAsync);
        });
    }
    putObject(key, data, contentType, acl = 'public-read') {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.putObjectAsync)
                return {};
            const putResult = yield this.putObjectAsync({
                Key: key,
                Bucket: this.bucketName,
                Body: data,
                ContentType: contentType,
                ACL: acl
            });
            return putResult;
        });
    }
    putObjectBatch(...attachments) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.putObjectAsync)
                return {};
            return yield Promise.all(attachments.map(a => this.putObject(a.key, a.data, a.contentType).then(result => ({ key: a.key, result })))).then(all => all.reduce((p, c) => (Object.assign(Object.assign({}, p), { [c.key]: c.result })), {}));
        });
    }
    getObject(key) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.getObjectAsync)
                return {};
            return yield this.getObjectAsync({ Bucket: this.bucketName, Key: key });
        });
    }
    getObjectBatch(...keys) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.getObjectAsync)
                return {};
            return yield this.simpleBatch(keys, key => this.getObject(key));
        });
    }
    deleteObject(key) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.deleteObjectAsync)
                return {};
            return yield this.deleteObjectAsync({ Bucket: this.bucketName, Key: key });
        });
    }
    deleteObjectBatch(...keys) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.deleteObjectAsync)
                return {};
            return yield this.simpleBatch(keys, key => this.deleteObject(key));
        });
    }
    simpleBatch(keys, func) {
        return Promise.all(keys.map(key => func(key).then(result => ({ key, result })))).then(all => all.reduce((p, c) => (Object.assign(Object.assign({}, p), { [c.key]: c.result })), {}));
    }
    useCallSuccess(func) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!func)
                return true;
            try {
                yield func({ Bucket: this.bucketName });
            }
            catch (e) {
                return false;
            }
            return true;
        });
    }
}
//# sourceMappingURL=s3Async.js.map