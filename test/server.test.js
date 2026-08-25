'use strict';

const assert = require('node:assert/strict');
const {after, before, test} = require('node:test');
const {io: connect} = require('socket.io-client');
const {buildServerConfig} = require('../src/config');
const {createRelayServer} = require('../src/server');

const CURL_WRAP_TOKEN = 'shared-token-0000000000000000000000000000';
let baseUrl;
let relay;
let socket;
let lastPayload;

before(async () => {
    const config = buildServerConfig({
        NODE_ENV: 'production', CURL_WRAP_TOKEN,
        ALLOWED_HOST_SUFFIXES: 'example.com', QUEUE_WAIT_MS: '250',
        TRUST_PROXY_HOPS: '0',
    });
    relay = createRelayServer(config, {info() {}, error() {}});
    await new Promise((resolve) => relay.httpServer.listen(0, '127.0.0.1', resolve));
    const address = relay.httpServer.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
    socket = connect(baseUrl, {
        auth: {token: CURL_WRAP_TOKEN, clientId: 'igor-office', code: 'igor-office', legacyIp: '193.233.193.42'},
        transports: ['websocket'],
    });
    socket.on('curl', (payload, callback) => {
        lastPayload = payload;
        callback({html: '<html>Результат слушания ответчик:</html>', ms: 7, status: 200, headers: {'content-type': 'text/html'}, bytes: 49});
    });
    await new Promise((resolve, reject) => {
        socket.once('connect', resolve);
        socket.once('connect_error', reject);
    });
});

after(async () => {
    socket?.close();
    await relay?.close();
});

test('health endpoint is public but API requires a token', async () => {
    assert.equal((await fetch(`${baseUrl}/healthz`)).status, 200);
    const response = await fetch(`${baseUrl}/clients`);
    assert.equal(response.status, 401);
    assert.equal((await response.json()).code, 'UNAUTHORIZED');
});

test('authenticated API has no fixed per-minute request limit', async () => {
    const statuses = await Promise.all(Array.from({length: 625}, async () => {
        const response = await fetch(`${baseUrl}/clients`, {headers: {'x-api-key': CURL_WRAP_TOKEN}});
        await response.arrayBuffer();
        return response.status;
    }));
    assert.equal(statuses.every((status) => status === 200), true);
});

test('legacy GET /curl, ip selector and response shape remain compatible', async () => {
    const url = new URL('/curl', baseUrl);
    url.searchParams.set('ip', '193.233.193.42');
    url.searchParams.set('timeout', '25000');
    url.searchParams.set('url', 'https://court.example.com/case?id=10');
    const response = await fetch(url, {headers: {'x-api-key': CURL_WRAP_TOKEN}});
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.status, 'ok');
    assert.equal(body.socket.ip, '193.233.193.42');
    assert.equal(body.socket.code, 'igor-office');
    assert.equal(body.res.status, 200);
    assert.equal(body.regexps.result_slushania, 1);
    assert.equal(lastPayload.timeout, 25000);
    assert.equal(typeof lastPayload.timeout, 'number');
});

test('POST /curl parses JSON and preserves the old path', async () => {
    const response = await fetch(`${baseUrl}/curl`, {
        method: 'POST',
        headers: {Authorization: `Bearer ${CURL_WRAP_TOKEN}`, 'Content-Type': 'application/json'},
        body: JSON.stringify({url: 'https://example.com/page', code: 'igor-office', timeout: 5000}),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).query.code, 'igor-office');
});

test('disallowed targets and invalid selectors fail before dispatch', async () => {
    const blocked = await fetch(`${baseUrl}/curl?url=${encodeURIComponent('https://localhost/private')}`, {headers: {'x-api-key': CURL_WRAP_TOKEN}});
    assert.equal(blocked.status, 422);
    assert.equal((await blocked.json()).code, 'HOST_NOT_ALLOWED');

    const badIp = await fetch(`${baseUrl}/curl?ip=not-an-ip&url=${encodeURIComponent('https://example.com/')}`, {headers: {'x-api-key': CURL_WRAP_TOKEN}});
    assert.equal(badIp.status, 422);
    assert.equal((await badIp.json()).code, 'INVALID_IP');
});

test('unauthorized Socket.IO executor is rejected', async () => {
    const unauthorized = connect(baseUrl, {
        auth: {token: 'wrong', clientId: 'intruder'},
        transports: ['websocket'],
        reconnection: false,
    });
    const error = await new Promise((resolve) => unauthorized.once('connect_error', resolve));
    unauthorized.close();
    assert.equal(error.data.code, 'UNAUTHORIZED_EXECUTOR');
});

test('authenticated legacy executor can register with init after connecting', async () => {
    const legacy = connect(baseUrl, {
        auth: {token: CURL_WRAP_TOKEN},
        transports: ['websocket'],
        reconnection: false,
    });
    legacy.on('curl', (payload, callback) => callback({
        html: '<html>legacy executor</html>',
        ms: 3,
        status: 200,
        headers: {'content-type': 'text/html'},
        bytes: 28,
    }));
    await new Promise((resolve, reject) => {
        legacy.once('connect', resolve);
        legacy.once('connect_error', reject);
    });
    const registration = await new Promise((resolve) => {
        legacy.emit('init', {code: 'legacy-igor', force_ip: '151.0.51.237'}, resolve);
    });
    assert.equal(registration.status, 'ok');

    const url = new URL('/curl', baseUrl);
    url.searchParams.set('code', 'legacy-igor');
    url.searchParams.set('url', 'https://example.com/legacy');
    const response = await fetch(url, {headers: {'x-api-key': CURL_WRAP_TOKEN}});
    const body = await response.json();
    legacy.close();

    assert.equal(response.status, 200);
    assert.equal(body.socket.code, 'legacy-igor');
    assert.equal(body.socket.ip, '151.0.51.237');
    assert.equal(body.res.html, '<html>legacy executor</html>');
});

test('trusted nginx forwarding exposes the real executor IP and ignores a spoofed left-most value', async () => {
    const config = buildServerConfig({
        NODE_ENV: 'production', CURL_WRAP_TOKEN,
        ALLOWED_HOST_SUFFIXES: 'example.com', TRUST_PROXY_HOPS: '1',
    });
    const forwardedRelay = createRelayServer(config, {info() {}, error() {}});
    await new Promise((resolve) => forwardedRelay.httpServer.listen(0, '127.0.0.1', resolve));
    const address = forwardedRelay.httpServer.address();
    const forwardedUrl = `http://127.0.0.1:${address.port}`;
    const forwardedSocket = connect(forwardedUrl, {
        auth: {token: CURL_WRAP_TOKEN, clientId: 'forwarded-executor'},
        extraHeaders: {'x-forwarded-for': '203.0.113.9, 198.51.100.44'},
        transports: ['websocket'],
        reconnection: false,
    });

    try {
        await new Promise((resolve, reject) => {
            forwardedSocket.once('connect', resolve);
            forwardedSocket.once('connect_error', reject);
        });
        const response = await fetch(`${forwardedUrl}/clients`, {headers: {'x-api-key': CURL_WRAP_TOKEN}});
        const body = await response.json();
        assert.equal(response.status, 200);
        assert.equal(body.items[0].ip, '198.51.100.44');
    } finally {
        forwardedSocket.close();
        await forwardedRelay.close();
    }
});
