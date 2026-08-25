'use strict';

const crypto = require('crypto');
const ipaddr = require('ipaddr.js');
const {ServiceError} = require('./errors');

function safeEqual(actual, expected) {
    if (typeof actual !== 'string' || typeof expected !== 'string') return false;
    const left = Buffer.from(actual);
    const right = Buffer.from(expected);
    return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function matchesAnyToken(actual, expectedTokens) {
    let matched = false;
    for (const expected of expectedTokens) matched = safeEqual(actual, expected) || matched;
    return matched;
}

function bearerToken(req) {
    const authorization = req.get('authorization') || '';
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (match) return match[1].trim();
    return (req.get('x-api-key') || '').trim();
}

function requireApiToken(config) {
    return (req, res, next) => {
        const token = bearerToken(req);
        if (!matchesAnyToken(token, config.apiTokens)) {
            return res.status(401).json({status: 'error', code: 'UNAUTHORIZED', message: 'Valid Bearer token or X-API-Key is required'});
        }
        next();
    };
}

function isAllowedHostname(hostname, suffixes) {
    const normalized = String(hostname || '').toLowerCase().replace(/\.$/, '');
    return suffixes.some((suffix) => normalized === suffix || normalized.endsWith(`.${suffix}`));
}

function validateTargetSyntax(rawUrl, config) {
    let parsed;
    try {
        parsed = new URL(rawUrl);
    } catch {
        throw new ServiceError('INVALID_URL', 'url must be an absolute URL', 422);
    }
    if (!config.allowedProtocols.includes(parsed.protocol)) {
        throw new ServiceError('PROTOCOL_NOT_ALLOWED', `Only ${config.allowedProtocols.join(', ')} targets are allowed`, 422);
    }
    if (parsed.username || parsed.password) {
        throw new ServiceError('URL_CREDENTIALS_NOT_ALLOWED', 'Credentials in target URL are not allowed', 422);
    }
    if (!isAllowedHostname(parsed.hostname, config.allowedHostSuffixes)) {
        throw new ServiceError('HOST_NOT_ALLOWED', 'Target hostname is outside ALLOWED_HOST_SUFFIXES', 422);
    }
    return parsed;
}

function isPublicAddress(address) {
    let parsed;
    try {
        parsed = ipaddr.parse(address);
        if (parsed.kind() === 'ipv6' && parsed.isIPv4MappedAddress()) parsed = parsed.toIPv4Address();
    } catch {
        return false;
    }
    return parsed.range() === 'unicast';
}

function securityHeaders(req, res, next) {
    res.set({
        'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
        'Referrer-Policy': 'no-referrer',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
    });
    next();
}

module.exports = {isAllowedHostname, isPublicAddress, matchesAnyToken, requireApiToken, securityHeaders, validateTargetSyntax};
