'use strict';

const wsDomain = process.env.WS_DOMAIN || 'http://localhost';
const wsMainPort = Number(process.env.WS_MAIN_PORT || 8112);

module.exports = {
    // Старые поля сохранены для совместимости с существующими скриптами.
    wsDomain,
    wsMainPort,
    proxyUrl: process.env.PROXY_URL || `${wsDomain}:${wsMainPort}`,
};
