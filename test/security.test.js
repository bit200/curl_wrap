'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {clearHtml} = require('../libs/clearHtml');
const {isAllowedHostname, isPublicAddress, validateTargetSyntax} = require('../src/security');

test('hostname allowlist requires a DNS label boundary', () => {
    assert.equal(isAllowedHostname('court.sudrf.ru', ['sudrf.ru']), true);
    assert.equal(isAllowedHostname('sudrf.ru', ['sudrf.ru']), true);
    assert.equal(isAllowedHostname('evil-sudrf.ru', ['sudrf.ru']), false);
});

test('private, loopback, link-local and metadata addresses are rejected', () => {
    for (const address of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.169.254', '::1', 'fc00::1', 'fe80::1']) {
        assert.equal(isPublicAddress(address), false, address);
    }
    assert.equal(isPublicAddress('1.1.1.1'), true);
    assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
});

test('URL credentials, protocols and foreign suffixes are rejected', () => {
    const config = {allowedProtocols: ['https:'], allowedHostSuffixes: ['sudrf.ru']};
    assert.throws(() => validateTargetSyntax('file:///etc/passwd', config), {code: 'PROTOCOL_NOT_ALLOWED'});
    assert.throws(() => validateTargetSyntax('https://user:pass@court.sudrf.ru/', config), {code: 'URL_CREDENTIALS_NOT_ALLOWED'});
    assert.throws(() => validateTargetSyntax('https://example.com/', config), {code: 'HOST_NOT_ALLOWED'});
});

test('HTML cleanup removes scripts, styles and inline handlers', () => {
    const result = clearHtml('<head>x</head><style>.x{}</style><script>x()</script><a onclick="x()" style="x">ok</a>');
    assert.equal(result, '<a>ok</a>');
});
