'use strict';

const crypto = require('crypto');
const net = require('net');
const {ServiceError} = require('./errors');
const {validateTargetSyntax} = require('./security');

function one(value) {
    return Array.isArray(value) ? value[0] : value;
}

function optionalString(value, name, maxLength) {
    value = one(value);
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value !== 'string' || value.length > maxLength) {
        throw new ServiceError('INVALID_REQUEST', `${name} must be a string up to ${maxLength} characters`, 422);
    }
    return value;
}

function boolean(value, fallback = false) {
    value = one(value);
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    if (value === '1' || value === 'true') return true;
    if (value === '0' || value === 'false') return false;
    throw new ServiceError('INVALID_REQUEST', 'Boolean value must be true, false, 1 or 0', 422);
}

function timeout(value, config) {
    value = one(value);
    if (value === undefined || value === null || value === '') return config.defaultTimeoutMs;
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < config.minTimeoutMs || parsed > config.maxTimeoutMs) {
        throw new ServiceError('INVALID_TIMEOUT', `timeout must be an integer from ${config.minTimeoutMs} to ${config.maxTimeoutMs} ms`, 422);
    }
    return parsed;
}

function normalizeSelector(input) {
    const clientId = optionalString(input.clientId, 'clientId', 64);
    const code = optionalString(input.code, 'code', 128);
    const ip = optionalString(input.ip, 'ip', 45);
    if (ip && !net.isIP(ip)) throw new ServiceError('INVALID_IP', 'ip selector must be an IPv4 or IPv6 address', 422);
    return {clientId, code, ip};
}

function normalizeFetchRequest(input, config) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new ServiceError('INVALID_REQUEST', 'Request payload must be an object', 422);
    }
    const rawUrl = optionalString(input.url, 'url', 8192);
    if (!rawUrl) throw new ServiceError('INVALID_URL', 'url is required', 422);
    const parsed = validateTargetSyntax(rawUrl, config);
    const method = (optionalString(input.method, 'method', 12) || 'GET').toUpperCase();
    if (!config.allowedMethods.includes(method)) {
        throw new ServiceError('METHOD_NOT_ALLOWED', `Only ${config.allowedMethods.join(', ')} methods are allowed`, 422);
    }
    const body = optionalString(input.body, 'body', config.maxRequestBodyBytes);
    if (body && method === 'GET') throw new ServiceError('BODY_NOT_ALLOWED', 'GET request cannot contain body', 422);

    return {
        requestId: crypto.randomUUID(),
        url: parsed.toString(),
        method,
        timeout: timeout(input.timeout ?? input.timeoutMs, config),
        ref: optionalString(input.ref, 'ref', 2048),
        lng: optionalString(input.lng, 'lng', 256),
        accept: optionalString(input.accept, 'accept', 512),
        agent: optionalString(input.agent, 'agent', 512),
        contentType: optionalString(input.contentType, 'contentType', 128),
        body,
        woClean: boolean(input.woClean),
        woReg: boolean(input.woReg),
        ...normalizeSelector(input),
    };
}

function odbRequest(input, config) {
    const domain = optionalString(input.domain, 'domain', 2048);
    const date = optionalString(input.odb, 'odb', 32) || '19.05.2026';
    if (!domain) throw new ServiceError('INVALID_DOMAIN', 'domain is required', 422);
    const base = validateTargetSyntax(domain, config);
    base.pathname = '/modules.php';
    base.search = '';
    base.searchParams.set('name', 'sud_delo');
    base.searchParams.set('srv_num', '1');
    base.searchParams.set('H_date', date);
    return normalizeFetchRequest({...input, url: base.toString()}, config);
}

module.exports = {normalizeFetchRequest, odbRequest};
