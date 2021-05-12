"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Keys = exports.BillingMode = void 0;
var BillingMode;
(function (BillingMode) {
    BillingMode["PROVISIONED"] = "PROVISIONED";
    BillingMode["PAY_PER_REQUEST"] = "PAY_PER_REQUEST";
})(BillingMode = exports.BillingMode || (exports.BillingMode = {}));
/* @internal */
class Keys {
}
exports.Keys = Keys;
Keys.DATA_KEY = 'data';
Keys.HASH_KEY = 'hash';
Keys.RANGE_KEY = 'range';
Keys.S3_KEY = '_s3key';
//# sourceMappingURL=types.js.map