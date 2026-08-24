// Домен, к которому подключается клиент. Порт НЕ указывается —
// снаружи всё ходит через 80/443 (nginx), а порт живёт только на сервере.
const wsDomain = 'https://curl-proxy.212-8-247-141.sslip.io';

// Порт, который слушает proxy_get.js локально (за nginx).
const wsMainPort = 8112;

// Если нужно локально разрабатывать без nginx — выставить true,
// тогда клиент будет ходить на wsDomain:wsMainPort.
const useClientPort = false;

// Итоговый адрес для клиента: домен без порта (или с портом в dev-режиме).
const wsServerUrl = useClientPort ? `${wsDomain}:${wsMainPort}` : wsDomain;

module.exports = {
    wsDomain,
    wsMainPort,
    useClientPort,
    wsServerUrl,
};
