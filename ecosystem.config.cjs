'use strict';

module.exports = {
    apps: [{
        name: 'curl-wrap-relay',
        cwd: __dirname,
        script: 'socket/proxy_get.js',
        interpreter: process.env.CURL_WRAP_NODE || 'node',
        node_args: '--env-file=.env',
        instances: 1,
        exec_mode: 'fork',
        autorestart: true,
        watch: false,
        time: true,
        max_memory_restart: '512M',
        min_uptime: '10s',
        max_restarts: 10,
        restart_delay: 2000,
        exp_backoff_restart_delay: 100,
        kill_timeout: 12000,
        listen_timeout: 10000,
        shutdown_with_message: false,
        merge_logs: true,
        out_file: 'logs/relay.out.log',
        error_file: 'logs/relay.error.log',
        env: {NODE_ENV: 'production'},
    }],
};
