'use strict';

const relay = require('./ecosystem.config.cjs');
const executor = require('./ecosystem.executor.config.cjs');

module.exports = {
    apps: [
        ...relay.apps,
        ...executor.apps.map((app) => ({...app, name: 'curl-wrap-executor-local'})),
    ],
};
