'use strict';

const {ServiceError} = require('./errors');

function csv(value, fallback = []) {
    if (!value) return [...fallback];
    return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

function integer(value, fallback, {min, max, name}) {
    if (value === undefined || value === null || value === '') return fallback;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
        throw new ServiceError('INVALID_CONFIG', `${name} must be an integer between ${min} and ${max}`);
    }
    return parsed;
}

function tokens(value) {
    return csv(value).filter((token) => token.length > 0);
}

function buildServerConfig(env = process.env) {
    const nodeEnv = env.NODE_ENV || 'development';
    const sharedTokens = tokens(env.CURL_WRAP_TOKENS || env.CURL_WRAP_TOKEN);
    const apiTokens = sharedTokens.length > 0 ? sharedTokens : tokens(env.API_TOKENS || env.API_TOKEN);
    const executorTokens = sharedTokens.length > 0 ? sharedTokens : tokens(env.EXECUTOR_TOKENS || env.EXECUTOR_TOKEN);
    const config = {
        nodeEnv,
        host: env.HOST || '127.0.0.1',
        port: integer(env.PORT || env.WS_MAIN_PORT, 8112, {min: 1, max: 65535, name: 'PORT'}),
        apiTokens,
        executorTokens,
        allowedOrigins: csv(env.ALLOWED_ORIGINS),
        allowedHostSuffixes: csv(env.ALLOWED_HOST_SUFFIXES, ['sudrf.ru']).map((item) => item.toLowerCase()),
        allowedProtocols: csv(env.ALLOWED_PROTOCOLS, ['https:']).map((item) => item.endsWith(':') ? item : `${item}:`),
        allowedMethods: csv(env.ALLOWED_METHODS, ['GET']).map((item) => item.toUpperCase()),
        minTimeoutMs: integer(env.MIN_TIMEOUT_MS, 1000, {min: 100, max: 30000, name: 'MIN_TIMEOUT_MS'}),
        maxTimeoutMs: integer(env.MAX_TIMEOUT_MS, 30000, {min: 1000, max: 120000, name: 'MAX_TIMEOUT_MS'}),
        defaultTimeoutMs: integer(env.DEFAULT_TIMEOUT_MS, 30000, {min: 100, max: 120000, name: 'DEFAULT_TIMEOUT_MS'}),
        ackGraceMs: integer(env.ACK_GRACE_MS, 5000, {min: 500, max: 30000, name: 'ACK_GRACE_MS'}),
        queueWaitMs: integer(env.QUEUE_WAIT_MS, 10000, {min: 100, max: 120000, name: 'QUEUE_WAIT_MS'}),
        maxQueueSize: integer(env.MAX_QUEUE_SIZE, 500, {min: 1, max: 100000, name: 'MAX_QUEUE_SIZE'}),
        maxInflightPerExecutor: integer(env.MAX_INFLIGHT_PER_EXECUTOR, 16, {min: 1, max: 1000, name: 'MAX_INFLIGHT_PER_EXECUTOR'}),
        maxResponseBytes: integer(env.MAX_RESPONSE_BYTES, 1048576, {min: 1024, max: 10485760, name: 'MAX_RESPONSE_BYTES'}),
        maxRequestBodyBytes: integer(env.MAX_REQUEST_BODY_BYTES, 65536, {min: 1024, max: 1048576, name: 'MAX_REQUEST_BODY_BYTES'}),
        socketMaxPayloadBytes: integer(env.SOCKET_MAX_PAYLOAD_BYTES, 1572864, {min: 65536, max: 16777216, name: 'SOCKET_MAX_PAYLOAD_BYTES'}),
        apiRateLimitPerMinute: integer(env.API_RATE_LIMIT_PER_MINUTE, 600, {min: 1, max: 1000000, name: 'API_RATE_LIMIT_PER_MINUTE'}),
        defaultEncoding: env.DEFAULT_ENCODING || 'win1251',
        trustProxy: integer(env.TRUST_PROXY_HOPS, 1, {min: 0, max: 10, name: 'TRUST_PROXY_HOPS'}),
    };

    if (config.minTimeoutMs > config.defaultTimeoutMs || config.defaultTimeoutMs > config.maxTimeoutMs) {
        throw new ServiceError('INVALID_CONFIG', 'MIN_TIMEOUT_MS <= DEFAULT_TIMEOUT_MS <= MAX_TIMEOUT_MS is required');
    }
    if (config.allowedHostSuffixes.length === 0) {
        throw new ServiceError('INVALID_CONFIG', 'ALLOWED_HOST_SUFFIXES must not be empty');
    }
    if (nodeEnv === 'production') {
        for (const [name, values] of [['API_TOKEN(S)', apiTokens], ['EXECUTOR_TOKEN(S)', executorTokens]]) {
            if (values.length === 0 || values.some((value) => value.length < 32)) {
                throw new ServiceError('INVALID_CONFIG', `${name} must contain a token of 32 or more characters in production`);
            }
        }
    }
    return config;
}

function buildExecutorConfig(env = process.env) {
    const maxTimeoutMs = integer(env.MAX_TIMEOUT_MS, 30000, {min: 1000, max: 120000, name: 'MAX_TIMEOUT_MS'});
    return {
        proxyUrl: env.PROXY_URL || `${env.WS_DOMAIN || 'http://localhost'}:${integer(env.WS_MAIN_PORT, 8112, {min: 1, max: 65535, name: 'WS_MAIN_PORT'})}`,
        token: env.CURL_WRAP_TOKEN || env.EXECUTOR_TOKEN || env.TOKEN || '',
        clientId: env.CLIENT_ID || '',
        legacyIp: env.EXECUTOR_LEGACY_IP || '',
        allowedHostSuffixes: csv(env.ALLOWED_HOST_SUFFIXES, ['sudrf.ru']).map((item) => item.toLowerCase()),
        allowedProtocols: csv(env.ALLOWED_PROTOCOLS, ['https:']).map((item) => item.endsWith(':') ? item : `${item}:`),
        allowedMethods: csv(env.ALLOWED_METHODS, ['GET']).map((item) => item.toUpperCase()),
        minTimeoutMs: integer(env.MIN_TIMEOUT_MS, 1000, {min: 100, max: 30000, name: 'MIN_TIMEOUT_MS'}),
        maxTimeoutMs,
        defaultTimeoutMs: integer(env.DEFAULT_TIMEOUT_MS, maxTimeoutMs, {min: 100, max: 120000, name: 'DEFAULT_TIMEOUT_MS'}),
        maxResponseBytes: integer(env.MAX_RESPONSE_BYTES, 1048576, {min: 1024, max: 10485760, name: 'MAX_RESPONSE_BYTES'}),
        defaultEncoding: env.DEFAULT_ENCODING || 'win1251',
    };
}

module.exports = {buildServerConfig, buildExecutorConfig, csv, integer};
