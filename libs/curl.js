'use strict';

const dns = require('dns').promises;
const http = require('http');
const https = require('https');
const iconv = require('iconv-lite');
const {clearHtml} = require('./clearHtml');
const {ServiceError} = require('../src/errors');
const {isPublicAddress, validateTargetSyntax} = require('../src/security');

function detectEncoding(headers, buffer, fallback) {
    const contentType = String(headers['content-type'] || '');
    const headerMatch = contentType.match(/charset\s*=\s*["']?([^;"'\s]+)/i);
    if (headerMatch && iconv.encodingExists(headerMatch[1])) return headerMatch[1];
    const prefix = buffer.subarray(0, Math.min(buffer.length, 4096)).toString('ascii');
    const metaMatch = prefix.match(/charset\s*=\s*["']?([^;"'\s/>]+)/i);
    if (metaMatch && iconv.encodingExists(metaMatch[1])) return metaMatch[1];
    return iconv.encodingExists(fallback) ? fallback : 'utf8';
}

async function resolvePublicTarget(hostname) {
    let addresses;
    try {
        addresses = await dns.lookup(hostname, {all: true, verbatim: true});
    } catch (error) {
        throw new ServiceError('DNS_LOOKUP_FAILED', `Cannot resolve target hostname: ${error.code || error.message}`, 502);
    }
    if (addresses.length === 0 || addresses.some((item) => !isPublicAddress(item.address))) {
        throw new ServiceError('PRIVATE_ADDRESS_BLOCKED', 'Target resolved to a private or reserved address', 422);
    }
    return addresses.sort((left, right) => left.family - right.family)[0];
}

async function curl_direct_ws(rawUrl, options = {}, config = options.config) {
    if (!config) throw new ServiceError('MISSING_CONFIG', 'Secure fetch configuration is required');
    const parsedUrl = validateTargetSyntax(rawUrl, config);
    const resolved = await resolvePublicTarget(parsedUrl.hostname);
    const protocol = parsedUrl.protocol === 'https:' ? https : http;
    const timeout = Number(options.timeout || config.defaultTimeoutMs);
    const method = String(options.method || 'GET').toUpperCase();
    if (!config.allowedMethods.includes(method)) throw new ServiceError('METHOD_NOT_ALLOWED', 'Requested method is not allowed', 422);

    const headers = {
        'User-Agent': options.agent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: options.accept || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': options.lng || 'ru,en-US;q=0.9,en;q=0.8',
        Connection: 'close',
        'Upgrade-Insecure-Requests': '1',
        Referer: options.ref || 'https://ya.ru/',
    };
    if (options.body) {
        headers['Content-Type'] = options.contentType || 'application/json; charset=utf-8';
        headers['Content-Length'] = Buffer.byteLength(options.body);
    }

    return new Promise((resolve, reject) => {
        let settled = false;
        const finish = (fn, value) => {
            if (settled) return;
            settled = true;
            fn(value);
        };
        const request = protocol.request({
            method,
            hostname: parsedUrl.hostname,
            servername: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
            headers,
            timeout,
            lookup: (hostname, lookupOptions, callback) => {
                if (lookupOptions?.all) return callback(null, [{address: resolved.address, family: resolved.family}]);
                return callback(null, resolved.address, resolved.family);
            },
        }, (response) => {
            const chunks = [];
            let bytes = 0;
            response.on('data', (chunk) => {
                bytes += chunk.length;
                if (bytes > config.maxResponseBytes) {
                    response.destroy(new ServiceError('RESPONSE_TOO_LARGE', `Response exceeds ${config.maxResponseBytes} bytes`, 502));
                    return;
                }
                chunks.push(chunk);
            });
            response.on('end', () => {
                const buffer = Buffer.concat(chunks);
                const encoding = detectEncoding(response.headers, buffer, config.defaultEncoding);
                let html = iconv.decode(buffer, encoding);
                if (!options.woClean) html = clearHtml(html);
                finish(resolve, {
                    html,
                    ms: 0,
                    status: response.statusCode || 0,
                    headers: response.headers,
                    bytes,
                    encoding,
                    url: parsedUrl.toString(),
                });
            });
            response.on('error', (error) => finish(reject, error instanceof ServiceError ? error : new ServiceError('UPSTREAM_RESPONSE_ERROR', error.message, 502)));
        });
        request.on('timeout', () => request.destroy(new ServiceError('UPSTREAM_TIMEOUT', `Upstream request exceeded ${timeout} ms`, 504)));
        request.on('error', (error) => finish(reject, error instanceof ServiceError ? error : new ServiceError('UPSTREAM_REQUEST_ERROR', error.message, 502)));
        if (options.body) request.write(options.body);
        request.end();
    });
}

module.exports = {curl_direct_ws, detectEncoding, resolvePublicTarget};
