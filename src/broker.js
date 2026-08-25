'use strict';

const {ServiceError} = require('./errors');

class RelayBroker {
    constructor(config, logger = console) {
        this.config = config;
        this.logger = logger;
        this.executors = new Map();
        this.queue = [];
    }

    register(socket, identity) {
        this.disconnectDuplicate(identity, socket.id);
        this.executors.set(socket.id, {...identity, socket, inflight: 0, connectedAt: new Date().toISOString()});
        this.logger.info?.(JSON.stringify({
            event: identity.ready ? 'executor_connected' : 'executor_pending_registration',
            clientId: identity.ready ? identity.clientId : null,
            legacyIp: identity.legacyIp || null,
        }));
        this.pump();
    }

    disconnectDuplicate(identity, exceptSocketId) {
        if (!identity.ready) return;
        for (const [socketId, executor] of this.executors) {
            if (socketId !== exceptSocketId && executor.ready && executor.clientId === identity.clientId) {
                executor.socket.disconnect(true);
                this.executors.delete(socketId);
            }
        }
    }

    updateIdentity(socket, identity) {
        const executor = this.executors.get(socket.id);
        if (!executor) return;
        this.disconnectDuplicate(identity, socket.id);
        Object.assign(executor, identity);
        this.logger.info?.(JSON.stringify({event: 'executor_registered', clientId: identity.clientId, legacyIp: identity.legacyIp || null}));
        this.pump();
    }

    unregister(socket) {
        const executor = this.executors.get(socket.id);
        if (!executor) return;
        this.executors.delete(socket.id);
        this.logger.info?.(JSON.stringify({event: 'executor_disconnected', clientId: executor.clientId}));
        this.pump();
    }

    list() {
        return [...this.executors.values()].map((executor) => ({
            ip: executor.legacyIp || executor.remoteIp,
            code: executor.code || executor.clientId,
            id: executor.socket.id,
            clientId: executor.clientId,
            ready: executor.ready,
            inflight: executor.inflight,
            connectedAt: executor.connectedAt,
        }));
    }

    readyCount() {
        return [...this.executors.values()].filter((executor) => executor.ready).length;
    }

    dispatch(payload) {
        if (this.queue.length >= this.config.maxQueueSize) {
            return Promise.reject(new ServiceError('QUEUE_FULL', 'Relay queue is full; retry later', 429));
        }
        return new Promise((resolve, reject) => {
            const item = {payload, resolve, reject};
            item.timer = setTimeout(() => {
                const index = this.queue.indexOf(item);
                if (index >= 0) this.queue.splice(index, 1);
                reject(new ServiceError('EXECUTOR_UNAVAILABLE', 'No matching executor became available in time', 503));
            }, this.config.queueWaitMs);
            item.timer.unref?.();
            this.queue.push(item);
            this.pump();
        });
    }

    choose(payload) {
        const selector = payload.clientId || payload.code || payload.ip;
        return [...this.executors.values()]
            .filter((executor) => executor.ready)
            .filter((executor) => executor.inflight < this.config.maxInflightPerExecutor)
            .filter((executor) => !selector || [executor.clientId, executor.code, executor.legacyIp, executor.remoteIp].includes(selector))
            .sort((left, right) => left.inflight - right.inflight || left.connectedAt.localeCompare(right.connectedAt))[0];
    }

    pump() {
        while (this.queue.length > 0) {
            const item = this.queue[0];
            const executor = this.choose(item.payload);
            if (!executor) return;
            this.queue.shift();
            clearTimeout(item.timer);
            executor.inflight += 1;
            this.run(executor, item).catch(() => {});
        }
    }

    async run(executor, item) {
        try {
            const ack = await executor.socket.timeout(item.payload.timeout + this.config.ackGraceMs).emitWithAck('curl', item.payload);
            const response = Array.isArray(ack) && ack.length === 1 ? ack[0] : ack;
            if (!response || typeof response !== 'object') {
                throw new ServiceError('INVALID_EXECUTOR_RESPONSE', 'Executor returned an invalid response', 502);
            }
            if (Buffer.byteLength(JSON.stringify(response)) > this.config.socketMaxPayloadBytes) {
                throw new ServiceError('EXECUTOR_RESPONSE_TOO_LARGE', 'Executor response exceeds relay limit', 502);
            }
            item.resolve({response, executor});
        } catch (error) {
            if (error instanceof ServiceError) item.reject(error);
            else item.reject(new ServiceError('EXECUTOR_TIMEOUT', 'Socket client timeout or connection failure', 504));
        } finally {
            executor.inflight = Math.max(0, executor.inflight - 1);
            this.pump();
        }
    }
}

module.exports = {RelayBroker};
