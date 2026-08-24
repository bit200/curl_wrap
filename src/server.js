'use strict';

const net = require('net');
const express = require('express');
const {createServer} = require('http');
const {Server} = require('socket.io');
const {RelayBroker} = require('./broker');
const {ServiceError} = require('./errors');
const {normalizeFetchRequest, odbRequest} = require('./request');
const {createRateLimiter, matchesAnyToken, requireApiToken, securityHeaders} = require('./security');

function socketIdentity(socket, config) {
    const auth = socket.handshake.auth || {};
    if (!matchesAnyToken(String(auth.token || ''), config.executorTokens)) {
        throw new ServiceError('UNAUTHORIZED_EXECUTOR', 'Invalid executor token', 401);
    }
    const clientId = String(auth.clientId || auth.code || '').trim();
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,63}$/.test(clientId)) {
        throw new ServiceError('INVALID_CLIENT_ID', 'clientId must contain 1-64 safe characters', 422);
    }
    const legacyIp = String(auth.legacyIp || auth.force_ip || '').trim();
    if (legacyIp && !net.isIP(legacyIp)) {
        throw new ServiceError('INVALID_LEGACY_IP', 'legacyIp must be an IPv4 or IPv6 address', 422);
    }
    const remoteIp = String(socket.handshake.address || '').replace(/^::ffff:/, '');
    return {clientId, code: String(auth.code || clientId), legacyIp, remoteIp};
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
        socket.on('message', () => {});
        socket.on('disconnect', () => broker.unregister(socket));
    });

    app.get('/healthz', (req, res) => res.json({ok: true, service: 'curl-wrap', version: '2.0.0'}));
    app.get('/readyz', (req, res) => {
        const clients = broker.list();
        res.status(clients.length > 0 ? 200 : 503).json({ready: clients.length > 0, executors: clients.length, queued: broker.queue.length});
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
