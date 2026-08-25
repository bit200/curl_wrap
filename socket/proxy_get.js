'use strict';

const {buildServerConfig} = require('../src/config');
const {start} = require('../src/server');

try {
    start(buildServerConfig());
} catch (error) {
    console.error(JSON.stringify({event: 'startup_failed', code: error.code || 'STARTUP_FAILED', message: error.message}));
    process.exit(1);
}
