'use strict';

module.exports = {
    apps: [{
        name: process.env.EXECUTOR_PM2_NAME || 'curl-wrap-executor',
        cwd: __dirname,
        script: 'socket/client_socket.js',
        interpreter: process.env.CURL_WRAP_NODE || 'node',
        node_args: '--env-file=.env.executor',
        instances: 1,
        exec_mode: 'fork',
        autorestart: true,
        watch: false,
        time: true,
        max_memory_restart: '384M',
        min_uptime: '10s',
        max_restarts: 20,
        restart_delay: 2000,
        exp_backoff_restart_delay: 100,
        kill_timeout: 35000,
        merge_logs: true,
        out_file: 'logs/executor.out.log',
        error_file: 'logs/executor.error.log',
        env: {NODE_ENV: 'production'},
    }],
};
