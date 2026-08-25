'use strict';

const net = require('net');
const express = require('express');
const {createServer} = require('http');
const {Server} = require('socket.io');
const {RelayBroker} = require('./broker');
const {ServiceError} = require('./errors');
const {normalizeFetchRequest, odbRequest} = require('./request');
const {createRateLimiter, matchesAnyToken, requireApiToken, securityHeaders} = require('./security');

const CLIENT_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,63}$/;

function validateClientId(value) {
    const clientId = String(value || '').trim();
    if (!CLIENT_ID_PATTERN.test(clientId)) {
        throw new ServiceError('INVALID_CLIENT_ID', 'clientId must contain 1-64 safe characters', 422);
    }
    return clientId;
}

function validateLegacyIp(value) {
    const legacyIp = String(value || '').trim();
    if (legacyIp && !net.isIP(legacyIp)) {
        throw new ServiceError('INVALID_LEGACY_IP', 'legacyIp must be an IPv4 or IPv6 address', 422);
    }
    return legacyIp;
}

function normalizeRemoteIp(value) {
    return String(value || '').trim().replace(/^::ffff:/, '');
}

function isLoopbackIp(value) {
    const ip = normalizeRemoteIp(value);
    if (ip === '::1') return true;
    return net.isIP(ip) === 4 && ip.split('.')[0] === '127';
}

/**
 * Socket.IO sees the TCP peer (the local nginx), not the public executor.
 * Trust forwarded addresses only when the immediate peer is loopback and the
 * configured proxy-hop count explicitly enables it. nginx appends the real
 * peer to X-Forwarded-For, so selection starts at the right-hand side; this
 * prevents a client-supplied left-most value from spoofing its executor IP.
 */
function socketRemoteIp(socket, config) {
    const directIp = normalizeRemoteIp(socket.handshake.address);
    const trustedHops = Number(config.trustProxy) || 0;
    if (trustedHops < 1 || !isLoopbackIp(directIp)) return directIp;

    const headers = socket.handshake.headers || {};
    const forwarded = String(headers['x-forwarded-for'] || '')
        .split(',')
        .map(normalizeRemoteIp)
        .filter((ip) => net.isIP(ip));

    if (forwarded.length > 0) {
        return forwarded[Math.max(0, forwarded.length - trustedHops)];
    }

    const realIp = normalizeRemoteIp(headers['x-real-ip']);
    return net.isIP(realIp) ? realIp : directIp;
}

function socketIdentity(socket, config) {
    const auth = socket.handshake.auth || {};
    if (!matchesAnyToken(String(auth.token || ''), config.executorTokens)) {
        throw new ServiceError('UNAUTHORIZED_EXECUTOR', 'Invalid executor token', 401);
    }
    const suppliedClientId = String(auth.clientId || auth.code || '').trim();
    const clientId = suppliedClientId ? validateClientId(suppliedClientId) : `pending:${socket.id}`;
    const legacyIp = validateLegacyIp(auth.legacyIp || auth.force_ip);
    const remoteIp = socketRemoteIp(socket, config);
    return {
        clientId,
        code: suppliedClientId ? String(auth.code || clientId) : '',
        legacyIp,
        remoteIp,
        ready: Boolean(suppliedClientId),
    };
}

function legacyInitIdentity(data, currentIdentity) {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        throw new ServiceError('INVALID_CLIENT_ID', 'Legacy init payload must be an object', 422);
    }
    const clientId = validateClientId(data.clientId || data.code);
    const legacyIp = validateLegacyIp(data.legacyIp || data.force_ip || currentIdentity.legacyIp);
    return {
        ...currentIdentity,
        clientId,
        code: String(data.code || clientId),
        legacyIp,
        ready: true,
    };
}

function regexpCounters(html) {
    return {
        result_slushania: html.match(/Результат слушания/gi)?.length,
        otvet: html.match(/ответчик\:|категория\:/gi)?.length,
        503: html.match(/\<h2\>503\<\/h2\>/gi)?.length,
        informazia_vremenno_nedostupna: html.match(/Информация временно недоступна/gi)?.length,
        del_ne_naznacheno: html.match(/дел не назначено/gi)?.length,
    };
}

function publicSocket(executor) {
    return {
        ip: executor.legacyIp || executor.remoteIp,
        code: executor.code || executor.clientId,
        id: executor.socket.id,
        clientId: executor.clientId,
    };
}

function createRelayServer(config, logger = console) {
    const app = express();
    app.disable('x-powered-by');
    app.set('trust proxy', config.trustProxy);
    app.use(securityHeaders);
    app.use(express.json({limit: config.maxRequestBodyBytes, strict: true}));

    const httpServer = createServer(app);
    const io = new Server(httpServer, {
        cors: config.allowedOrigins.length > 0 ? {origin: config.allowedOrigins, credentials: false} : undefined,
        maxHttpBufferSize: config.socketMaxPayloadBytes,
        pingInterval: 25000,
        pingTimeout: 20000,
    });
    const broker = new RelayBroker(config, logger);

    io.use((socket, next) => {
        try {
            socket.data.identity = socketIdentity(socket, config);
            next();
        } catch (error) {
            const authError = new Error(error.message);
            authError.data = {code: error.code || 'UNAUTHORIZED_EXECUTOR'};
            next(authError);
        }
    });
    io.on('connection', (socket) => {
        broker.register(socket, socket.data.identity);
        socket.on('init', (data, acknowledge) => {
            try {
                const identity = legacyInitIdentity(data, socket.data.identity);
                socket.data.identity = identity;
                broker.updateIdentity(socket, identity);
                if (typeof acknowledge === 'function') acknowledge({status: 'ok', clientId: identity.clientId});
            } catch (error) {
                logger.error?.(JSON.stringify({event: 'executor_registration_failed', code: error.code, message: error.message}));
                if (typeof acknowledge === 'function') acknowledge({status: 'error', code: error.code, message: error.message});
                socket.emit('registration_error', {code: error.code, message: error.message});
                socket.disconnect(true);
            }
        });
        socket.on('message', () => {});
        socket.on('disconnect', () => broker.unregister(socket));
    });

    app.get('/healthz', (req, res) => res.json({ok: true, service: 'curl-wrap', version: '2.0.1'}));
    app.get('/readyz', (req, res) => {
        const executors = broker.readyCount();
        res.status(executors > 0 ? 200 : 503).json({ready: executors > 0, executors, queued: broker.queue.length});
    });

    const apiAuth = requireApiToken(config);
    const rateLimit = createRateLimiter(config.apiRateLimitPerMinute);
    app.use(['/curl', '/odb', '/clients', '/v1'], apiAuth, rateLimit);
    app.get(['/clients', '/v1/clients'], (req, res) => res.json({items: broker.list()}));

    async function handle(payload, res) {
        const startedAt = Date.now();
        const {response, executor} = await broker.dispatch(payload);
        const html = typeof response.html === 'string' ? response.html : '';
        const result = {
            status: 'ok',
            url: payload.url,
            regexps: payload.woReg ? {} : regexpCounters(html),
            socket: publicSocket(executor),
            query: payload,
            res: response,
        };
        logger.info?.(JSON.stringify({
            event: 'fetch_completed', requestId: payload.requestId, clientId: executor.clientId,
            targetHost: new URL(payload.url).hostname, httpStatus: response.status,
            bytes: response.bytes || Buffer.byteLength(html), durationMs: Date.now() - startedAt,
        }));
        res.status(200).json(result);
    }

    app.get('/curl', (req, res, next) => {
        try { handle(normalizeFetchRequest(req.query, config), res).catch(next); } catch (error) { next(error); }
    });
    app.post(['/curl', '/v1/fetch'], (req, res, next) => {
        try { handle(normalizeFetchRequest(req.body, config), res).catch(next); } catch (error) { next(error); }
    });
    app.get('/odb', (req, res, next) => {
        try { handle(odbRequest(req.query, config), res).catch(next); } catch (error) { next(error); }
    });

    app.use((req, res) => res.status(404).json({status: 'error', code: 'NOT_FOUND', message: 'Route not found'}));
    app.use((error, req, res, next) => {
        if (res.headersSent) return next(error);
        const known = error instanceof ServiceError;
        const status = known ? error.httpStatus : (error.status === 413 ? 413 : 500);
        const code = known ? error.code : (status === 413 ? 'REQUEST_TOO_LARGE' : 'INTERNAL_ERROR');
        logger.error?.(JSON.stringify({event: 'request_failed', code, message: error.message}));
        res.status(status).json({
            status: 'error', code,
            message: known ? error.message : (status === 413 ? 'Request body is too large' : 'Internal server error'),
        });
    });

    async function close() {
        broker.queue.splice(0).forEach((item) => {
            clearTimeout(item.timer);
            item.reject(new ServiceError('SHUTTING_DOWN', 'Service is shutting down', 503));
        });
        await new Promise((resolve) => io.close(resolve));
        if (httpServer.listening) await new Promise((resolve) => httpServer.close(resolve));
    }

    return {app, broker, close, httpServer, io};
}

function start(config, logger = console) {
    const relay = createRelayServer(config, logger);
    relay.httpServer.listen(config.port, config.host, () => {
        logger.info?.(JSON.stringify({event: 'server_started', address: `${config.host}:${config.port}`}));
    });
    let stopping = false;
    async function shutdown(signal) {
        if (stopping) return;
        stopping = true;
        logger.info?.(JSON.stringify({event: 'server_stopping', signal}));
        const force = setTimeout(() => process.exit(1), 10000);
        force.unref();
        await relay.close();
        clearTimeout(force);
        process.exit(0);
    }
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    return relay;
}

module.exports = {createRelayServer, start};
