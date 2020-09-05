'use strict';

const Joi = require('joi');
const ObjectID = require('mongodb').ObjectID;
const tools = require('../../tools');
const roles = require('../../roles');

module.exports = (db, server, userHandler) => {
    // Create OTP SMS

    /**
     * @api {post} /users/:user/2fa/otpsms/setup Generate OTP SMS seed
     * @apiName SetupOtpsms2FA
     * @apiGroup TwoFactorAuth
     * @apiDescription This method generates OTP SMS for 2FA. User needs to verify the seed value using 2fa/otpsms/enable endpoint
     * @apiHeader {String} X-Access-Token Optional access token if authentication is enabled
     * @apiHeaderExample {json} Header-Example:
     * {
     *   "X-Access-Token": "59fc66a03e54454869460e45"
     * }
     *
     * @apiParam {String} user ID of the User
     * @apiParam {String} [sess] Session identifier for the logs
     * @apiParam {String} [ip] IP address for the logs
     *
     * @apiSuccess {Boolean} success Indicates successful response
     * @apiSuccess {String} OTP SMS token generated
     * @apiSuccess {String} OTP SMS expiry time
     *
     * @apiError error Description of the error
     *
     * @apiExample {curl} Example usage:
     *     curl -i -XPOST http://localhost:8080/users/59fc66a03e54454869460e45/2fa/otpsms/setup \
     *     -H 'Content-type: application/json' \
     *     -d '{
     *       "issuer": "My Awesome Web Service",
     *       "ip": "127.0.0.1"
     *     }'
     *
     * @apiSuccessExample {json} Success-Response:
     *     HTTP/1.1 200 OK
     *     {
     *       "success": true,
     *       "smsExpired": "2020-06-12 04:48:16.512Z"
     *     }
     *
     * @apiErrorExample {json} Error-Response:
     *     HTTP/1.1 200 OK
     *     {
     *       "error": "This username does not exist"
     *       "code": "UserNotFound"
     *     }
     */
    server.post(
        '/users/:user/2fa/otpsms/setup',
        tools.asyncifyJson(async (req, res, next) => {
            res.charSet('utf-8');
            const schema = Joi.object().keys({
                user: Joi.string()
                    .hex()
                    .lowercase()
                    .length(24)
                    .required(),
                sess: Joi.string().max(255),
                ip: Joi.string().ip({
                    version: ['ipv4', 'ipv6'],
                    cidr: 'forbidden'
                })
            });

            const result = Joi.validate(req.params, schema, {
                abortEarly: false,
                convert: true
            });

            if (result.error) {
                res.status(400);
                res.json({
                    error: result.error.message,
                    code: 'InputValidationError'
                });
                return next();
            }

            // permissions check
            if (req.user && req.user === result.value.user) {
                req.validate(roles.can(req.role).updateOwn('users'));
            } else {
                req.validate(roles.can(req.role).updateAny('users'));
            }

            let user = new ObjectID(result.value.user);
            let otpsms = await userHandler.setupOtpsms(user, result.value);

            res.json({
                success: true,
                expired: otpsms.smsExpired
            });

            return next();
        })
    );

    /**
     * @api {post} /users/:user/2fa/otpsms/enable Enable OTP SMS
     * @apiName EnableOtpSMS2FA
     * @apiGroup TwoFactorAuth
     * @apiDescription This method enables TOTP for a user by verifying the seed value generated from 2fa/otpsms/setup
     * @apiHeader {String} X-Access-Token Optional access token if authentication is enabled
     * @apiHeaderExample {json} Header-Example:
     * {
     *   "X-Access-Token": "59fc66a03e54454869460e45"
     * }
     *
     * @apiParam {String} user ID of the User
     * @apiParam {String} token 6-digit number that matches seed value from 2fa/otpsms/setup
     * @apiParam {String} [sess] Session identifier for the logs
     * @apiParam {String} [ip] IP address for the logs
     *
     * @apiSuccess {Boolean} success Indicates successful response
     *
     * @apiError error Description of the error
     *
     * @apiExample {curl} Example usage:
     *     curl -i -XPOST http://localhost:8080/users/59fc66a03e54454869460e45/2fa/otpsms/enable \
     *     -H 'Content-type: application/json' \
     *     -d '{
     *       "token": "123456",
     *       "ip": "127.0.0.1"
     *     }'
     *
     * @apiSuccessExample {json} Success-Response:
     *     HTTP/1.1 200 OK
     *     {
     *       "success": true
     *     }
     *
     * @apiErrorExample {json} Error-Response:
     *     HTTP/1.1 200 OK
     *     {
     *       "error": "This username does not exist"
     *       "code": "UserNotFound"
     *     }
     */
    server.post(
        '/users/:user/2fa/otpsms/enable',
        tools.asyncifyJson(async (req, res, next) => {
            res.charSet('utf-8');

            const schema = Joi.object().keys({
                user: Joi.string()
                    .hex()
                    .lowercase()
                    .length(24)
                    .required(),
                sms: Joi.string()
                    .length(6)
                    .required(),
                sess: Joi.string().max(255),
                ip: Joi.string().ip({
                    version: ['ipv4', 'ipv6'],
                    cidr: 'forbidden'
                })
            });

            const result = Joi.validate(req.params, schema, {
                abortEarly: false,
                convert: true,
                language: {
                    string: {
                        length: '"{{!key}}" length must be {{limit}} characters long',
                        regex: '"{{!key}} must be a valid number"'
                    }
                }
            });

            if (result.error) {
                res.status(400);
                res.json({
                    error: result.error.message,
                    code: 'InputValidationError'
                });
                return next();
            }

            // permissions check
            if (req.user && req.user === result.value.user) {
                req.validate(roles.can(req.role).updateOwn('users'));
            } else {
                req.validate(roles.can(req.role).updateAny('users'));
            }

            let user = new ObjectID(result.value.user);
            let { success, disabled2fa } = await userHandler.enableOtpsms(user, result.value);

            if (!success) {
                res.json({
                    error: 'Invalid sms token',
                    code: 'InvalidToken'
                });
                return next();
            }

            if (disabled2fa && req.accessToken && typeof req.accessToken.update === 'function') {
                try {
                    // update access token data for current session after U2F enabled
                    await req.accessToken.update();
                } catch (err) {
                    // ignore
                }
            }

            res.json({
                success
            });

            return next();
        })
    );

    /**
     * @api {post} /users/:user/2fa/otpsms/check Check OTP SMS
     * @apiName CheckOtpSMS2FA
     * @apiGroup TwoFactorAuth
     * @apiDescription This method check OTP SMS for a user by verifying the sms value generated from 2fa/otpsms/send
     * @apiHeader {String} X-Access-Token Optional access token if authentication is enabled
     * @apiHeaderExample {json} Header-Example:
     * {
     *   "X-Access-Token": "59fc66a03e54454869460e45"
     * }
     *
     * @apiParam {String} user ID of the User
     * @apiParam {String} token 6-digit number that matches sms value from 2fa/otpsms/send
     * @apiParam {String} [sess] Session identifier for the logs
     * @apiParam {String} [ip] IP address for the logs
     *
     * @apiSuccess {Boolean} success Indicates successful response
     *
     * @apiError error Description of the error
     *
     * @apiExample {curl} Example usage:
     *     curl -i -XPOST http://localhost:8080/users/59fc66a03e54454869460e45/2fa/otpsms/check \
     *     -H 'Content-type: application/json' \
     *     -d '{
     *       "token": "123456",
     *       "ip": "127.0.0.1"
     *     }'
     *
     * @apiSuccessExample {json} Success-Response:
     *     HTTP/1.1 200 OK
     *     {
     *       "success": true
     *     }
     *
     * @apiErrorExample {json} Error-Response:
     *     HTTP/1.1 200 OK
     *     {
     *       "error": "This username does not exist"
     *       "code": "UserNotFound"
     *     }
     */
    server.post(
        '/users/:user/2fa/otpsms/check',
        tools.asyncifyJson(async (req, res, next) => {
            res.charSet('utf-8');

            const schema = Joi.object().keys({
                user: Joi.string()
                    .hex()
                    .lowercase()
                    .length(24)
                    .required(),
                token: Joi.string()
                    .length(6)
                    .required(),
                sess: Joi.string().max(255),
                ip: Joi.string().ip({
                    version: ['ipv4', 'ipv6'],
                    cidr: 'forbidden'
                })
            });

            const result = Joi.validate(req.params, schema, {
                abortEarly: false,
                convert: true
            });

            if (result.error) {
                res.status(400);
                res.json({
                    error: result.error.message,
                    code: 'InputValidationError'
                });
                return next();
            }

            // permissions check
            if (req.user && req.user === result.value.user) {
                req.validate(roles.can(req.role).updateOwn('users'));
            } else {
                req.validate(roles.can(req.role).updateAny('users'));
            }

            let user = new ObjectID(result.value.user);
            let { success, disabled2fa } = await userHandler.checkOtpsms(user, result.value);

            if (!success) {
                res.json({
                    error: 'Invalid sms token',
                    code: 'InvalidToken'
                });
                return next();
            }

            if (disabled2fa && req.accessToken && typeof req.accessToken.update === 'function') {
                try {
                    // update access token data for current session after U2F enabled
                    await req.accessToken.update();
                } catch (err) {
                    // ignore
                }
            }

            res.json({
                success
            });

            return next();
        })
    );

    /**
     * @api {post} /users/:user/2fa/otpsms/send Send OTP SMS
     * @apiName CheckOtpSMS2FA
     * @apiGroup TwoFactorAuth
     * @apiDescription This method send OTP SMS for a user
     * @apiHeader {String} X-Access-Token Optional access token if authentication is enabled
     * @apiHeaderExample {json} Header-Example:
     * {
     *   "X-Access-Token": "59fc66a03e54454869460e45"
     * }
     *
     * @apiParam {String} user ID of the User
     * @apiParam {String} [sess] Session identifier for the logs
     * @apiParam {String} [ip] IP address for the logs
     *
     * @apiSuccess {Boolean} success Indicates successful response
     *
     * @apiError error Description of the error
     *
     * @apiExample {curl} Example usage:
     *     curl -i -XPOST http://localhost:8080/users/59fc66a03e54454869460e45/2fa/otpsms/send \
     *     -H 'Content-type: application/json' \
     *     -d '{
     *       "ip": "127.0.0.1"
     *     }'
     *
     * @apiSuccessExample {json} Success-Response:
     *     HTTP/1.1 200 OK
     *     {
     *       "success": true
     *     }
     *
     * @apiErrorExample {json} Error-Response:
     *     HTTP/1.1 200 OK
     *     {
     *       "error": "This username does not exist"
     *       "code": "UserNotFound"
     *     }
     */
    server.post(
        '/users/:user/2fa/otpsms/send',
        tools.asyncifyJson(async (req, res, next) => {
            res.charSet('utf-8');

            const schema = Joi.object().keys({
                user: Joi.string()
                    .hex()
                    .lowercase()
                    .length(24)
                    .required(),
                sess: Joi.string().max(255),
                ip: Joi.string().ip({
                    version: ['ipv4', 'ipv6'],
                    cidr: 'forbidden'
                })
            });

            const result = Joi.validate(req.params, schema, {
                abortEarly: false,
                convert: true
            });

            if (result.error) {
                res.status(400);
                res.json({
                    error: result.error.message,
                    code: 'InputValidationError'
                });
                return next();
            }

            // permissions check
            if (req.user && req.user === result.value.user) {
                req.validate(roles.can(req.role).updateOwn('users'));
            } else {
                req.validate(roles.can(req.role).updateAny('users'));
            }

            let user = new ObjectID(result.value.user);
            let { success, disabled2fa } = await userHandler.sendOtpsms(user, result.value);

            if (!success) {
                res.json({
                    error: 'Invalid sms token',
                    code: 'InvalidToken'
                });
                return next();
            }

            if (disabled2fa && req.accessToken && typeof req.accessToken.update === 'function') {
                try {
                    // update access token data for current session after U2F enabled
                    await req.accessToken.update();
                } catch (err) {
                    // ignore
                }
            }

            res.json({
                success
            });

            return next();
        })
    );

    /**
     * @api {delete} /users/:user/2fa/otpsms Disable OTP SMS auth
     * @apiName DisableOtpSMS2FA
     * @apiGroup TwoFactorAuth
     * @apiDescription This method disables OTP SMS for a user. Does not affect other 2FA mechanisms a user might have set up
     * @apiHeader {String} X-Access-Token Optional access token if authentication is enabled
     * @apiHeaderExample {json} Header-Example:
     * {
     *   "X-Access-Token": "59fc66a03e54454869460e45"
     * }
     *
     * @apiParam {String} user ID of the User
     * @apiParam {String} [sess] Session identifier for the logs
     * @apiParam {String} [ip] IP address for the logs
     *
     * @apiSuccess {Boolean} success Indicates successful response
     *
     * @apiError error Description of the error
     *
     * @apiExample {curl} Example usage:
     *     curl -i -XDELETE http://localhost:8080/users/59fc66a03e54454869460e45/2fa/otpsms
     *
     * @apiSuccessExample {json} Success-Response:
     *     HTTP/1.1 200 OK
     *     {
     *       "success": true
     *     }
     *
     * @apiErrorExample {json} Error-Response:
     *     HTTP/1.1 200 OK
     *     {
     *       "error": "This username does not exist"
     *       "code": "UserNotFound"
     *     }
     */
    server.del(
        '/users/:user/2fa/otpsms',
        tools.asyncifyJson(async (req, res, next) => {
            res.charSet('utf-8');

            const schema = Joi.object().keys({
                user: Joi.string()
                    .hex()
                    .lowercase()
                    .length(24)
                    .required(),
                sess: Joi.string().max(255),
                ip: Joi.string().ip({
                    version: ['ipv4', 'ipv6'],
                    cidr: 'forbidden'
                })
            });

            req.query.user = req.params.user;

            const result = Joi.validate(req.query, schema, {
                abortEarly: false,
                convert: true
            });

            if (result.error) {
                res.status(400);
                res.json({
                    error: result.error.message,
                    code: 'InputValidationError'
                });
                return next();
            }

            // permissions check
            if (req.user && req.user === result.value.user) {
                req.validate(roles.can(req.role).updateOwn('users'));
            } else {
                req.validate(roles.can(req.role).updateAny('users'));
            }

            let user = new ObjectID(result.value.user);
            let success = await userHandler.disableOtpsms(user, result.value);

            res.json({
                success
            });

            return next();
        })
    );
};
