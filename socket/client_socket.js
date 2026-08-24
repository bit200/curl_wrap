'use strict';

const crypto = require('crypto');
const {io} = require('socket.io-client');
const legacyEnv = require('../env');
const {buildExecutorConfig} = require('../src/config');
const {getUp, saveUp} = require('../libs/saveUp');
const {parseUrl} = require('../libs/parseUrl');

async function loadIdentity(config) {
    let clientId = config.clientId || (await getUp('code.md'))?.trim();
    if (!clientId) {
        clientId = `executor-${crypto.randomUUID()}`;
        await saveUp('code.md', clientId, true);
    }
    const legacyIp = config.legacyIp || (await getUp('ip.md'))?.trim() || '';
    return {clientId, legacyIp};
}

async function main() {
    const config = buildExecutorConfig({
        ...process.env,
        PROXY_URL: process.env.PROXY_URL || legacyEnv.proxyUrl,
    });
    if (!config.token || config.token.length < 32) {
        throw new Error('CURL_WRAP_TOKEN with at least 32 characters is required');
    }
    const identity = await loadIdentity(config);
    const socket = io(config.proxyUrl, {
        auth: {
            token: config.token,
            clientId: identity.clientId,
            code: identity.clientId,
            legacyIp: identity.legacyIp,
            force_ip: identity.legacyIp,
        },
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 30000,
        randomizationFactor: 0.5,
        timeout: 20000,
        transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
        console.log(JSON.stringify({event: 'executor_connected', clientId: identity.clientId, proxyUrl: config.proxyUrl}));
    });
    socket.on('connect_error', (error) => {
        console.error(JSON.stringify({event: 'executor_connect_error', message: error.message, code: error.data?.code}));
    });
    socket.on('disconnect', (reason) => {
        console.log(JSON.stringify({event: 'executor_disconnected', reason}));
    });
    socket.on('curl', async (data, callback) => {
        if (typeof callback !== 'function') return;
        try {
            const result = await parseUrl(data, config);
            callback(result);
        } catch (error) {
            callback({
                html: '',
                ms: 0,
                status: 'err',
                headers: {},
                bytes: 0,
                error: {code: error.code || 'FETCH_FAILED', message: error.message},
            });
        }
    });

    function shutdown(signal) {
        console.log(JSON.stringify({event: 'executor_stopping', signal}));
        socket.close();
        setTimeout(() => process.exit(0), 100).unref();
    }
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
    console.error(JSON.stringify({event: 'executor_startup_failed', message: error.message}));
    process.exit(1);
});
