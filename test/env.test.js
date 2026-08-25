'use strict';

const assert = require('node:assert/strict');
const {spawnSync} = require('node:child_process');
const path = require('node:path');
const test = require('node:test');

const envPath = path.resolve(__dirname, '..', 'env.js');

function readEnv(overrides = {}) {
    const result = spawnSync(process.execPath, [
        '-e',
        'process.stdout.write(JSON.stringify(require(process.argv[1])))',
        envPath,
    ], {
        encoding: 'utf8',
        env: {PATH: process.env.PATH, ...overrides},
    });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
}

test('manual executor command defaults to the public relay', () => {
    const config = readEnv();
    assert.equal(config.proxyUrl, 'https://curl-proxy.212-8-247-141.sslip.io');
});

test('PROXY_URL still overrides the public relay', () => {
    const config = readEnv({PROXY_URL: 'http://127.0.0.1:18112'});
    assert.equal(config.proxyUrl, 'http://127.0.0.1:18112');
});

test('legacy WS_DOMAIN and WS_MAIN_PORT keep supporting local development', () => {
    const config = readEnv({WS_DOMAIN: 'http://127.0.0.1', WS_MAIN_PORT: '18112'});
    assert.equal(config.proxyUrl, 'http://127.0.0.1:18112');
});
