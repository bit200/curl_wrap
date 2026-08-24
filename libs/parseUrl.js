'use strict';

const {curl_direct_ws} = require('./curl');

async function parseUrl(json, config) {
    const startedAt = Date.now();
    const result = await curl_direct_ws(json.url, json, config);
    return {...result, ms: Date.now() - startedAt};
}

module.exports = {parseUrl};
