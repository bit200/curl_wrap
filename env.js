'use strict';

const DEFAULT_PROXY_URL = 'https://curl-proxy.212-8-247-141.sslip.io';
const hasLegacyDomain = Boolean(process.env.WS_DOMAIN);
const wsDomain = process.env.WS_DOMAIN || DEFAULT_PROXY_URL;
const wsMainPort = Number(process.env.WS_MAIN_PORT || 8112);

module.exports = {
    // Старые поля сохранены для совместимости с существующими скриптами.
    wsDomain,
    wsMainPort,
    // Без настроек executor подключается к рабочему публичному relay, как до v2.
    // Локальный режим остаётся доступен через PROXY_URL=http://localhost:8112.
    proxyUrl: process.env.PROXY_URL || (hasLegacyDomain ? `${wsDomain}:${wsMainPort}` : DEFAULT_PROXY_URL),
};
