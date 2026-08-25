'use strict';

class ServiceError extends Error {
    constructor(code, message, httpStatus = 500, details = undefined) {
        super(message);
        this.name = 'ServiceError';
        this.code = code;
        this.httpStatus = httpStatus;
        this.details = details;
    }
}

module.exports = {ServiceError};
