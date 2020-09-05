'use strict';

const config = require('wild-config');
const Joi = require('joi');
const ObjectID = require('mongodb').ObjectID;
const tools = require('../tools');
const roles = require('../roles');
const util = require('util');
const { mailApproval } = require('../../wildduck-webmail/lib/api-client');

module.exports = (db, server, userHandler) => {
    /**
     * @api {get} /users/:user/asps List Application Passwords
     * @apiName GetASPs
     * @apiGroup ApplicationPasswords
     * @apiHeader {String} X-Access-Token Optional access token if authentication is enabled
     * @apiHeaderExample {json} Header-Example:
     * {
     *   "X-Access-Token": "59fc66a03e54454869460e45"
     * }
     *
     * @apiParam {String} user ID of the User
     * @apiParam {Boolean} [showAll=false] If not true then skips entries with a TTL set
     *
     * @apiSuccess {Boolean} success Indicates successful response
     * @apiSuccess {Object[]} results Event listing
     * @apiSuccess {String} results.id ID of the Application Password
     * @apiSuccess {String} results.description Description
     * @apiSuccess {String[]} results.scopes Allowed scopes for the Application Password
     * @apiSuccess {Object} results.lastUse Information about last use
     * @apiSuccess {String} results.lastUse.time Datestring of last use or false if password has not been used
     * @apiSuccess {String} results.lastUse.event Event ID of the security log for the last authentication
     * @apiSuccess {String} results.created Datestring
     *
     * @apiError error Description of the error
     *
     * @apiExample {curl} Example usage:
     *     curl -i "http://localhost:8080/users/59fc66a03e54454869460e45/asps"
     *
     * @apiSuccessExample {json} Success-Response:
     *     HTTP/1.1 200 OK
     *     {
     *       "success": true,
     *       "results": [
     *         {
     *           "id": "5a1d6dd776e56b6d97e5dd48",
     *           "description": "Thunderbird",
     *           "scopes": [
     *             "imap",
     *             "smtp"
     *           ],
     *           "lastUse": {
     *              "time": "2018-06-21T16:51:53.807Z",
     *              "event": "5b2bd7a9d0ba2509deb88f40"
     *           },
     *           "created": "2017-11-28T14:08:23.520Z"
     *         }
     *       ]
     *     }
     *
     * @apiErrorExample {json} Error-Response:
     *     HTTP/1.1 200 OK
     *     {
     *       "error": "Database error"
     *     }
     */
    server.get(
        '/user-disabled',
        tools.asyncifyJson(async (req, res, next) => {
            res.charSet('utf-8');

            // const schema = Joi.object().keys({
            //     user: Joi.string()
            //         .hex()
            //         .lowercase()
            //         .length(24)
            //         .required(),
            //     showAll: Joi.boolean()
            //         .truthy(['Y', 'true', 'yes', 'on', '1', 1])
            //         .falsy(['N', 'false', 'no', 'off', '0', 0, ''])
            //         .default(false),
            //     sess: Joi.string().max(255),
            //     ip: Joi.string().ip({
            //         version: ['ipv4', 'ipv6'],
            //         cidr: 'forbidden'
            //     })
            // });

            // if (req.query.showAll) {
            //     req.params.showAll = req.query.showAll;
            // }

            // const result = Joi.validate(req.params, schema, {
            //     abortEarly: false,
            //     convert: true
            // });

            // if (result.error) {
            //     res.status(400);
            //     res.json({
            //         error: result.error.message,
            //         code: 'InputValidationError'
            //     });
            //     return next();
            // }

            // permissions check
            // if (req.user && req.user === result.value.user) {
            //     req.validate(roles.can(req.role).readOwn('asps'));
            // } else {
            //     req.validate(roles.can(req.role).readAny('asps'));
            // }

            let user = new ObjectID(result.value.user);
            let showAll = result.value.showAll;

            let userData;
            try {
                userData = await db.users.collection('users').filter(
                    disabled == true
                );
            } catch (err) {
                res.json({
                    error: 'MongoDB Error: ' + err.message,
                    code: 'InternalDatabaseError'
                });
                return next();
            }

            if (!userData || userData.disabled == false) {
                res.json({
                    error: 'This user does not exist',
                    code: 'UserNotFound'
                });
                return next();
            }

            res.json({
                success: true,

                results: mailApprovals
                    .filter(mailApproval => {
                        if (showAll) {
                            return true;
                        }
                        return true;
                    })
                    .map(mailApproval => ({
                        id: userData._id,
                        address: userData.address
                    }))
            });

            return next();
        })
    );

    /**
     * @api {post} /users/:user/asps Create new Application Password
     * @apiName PostASP
     * @apiGroup ApplicationPasswords
     * @apiHeader {String} X-Access-Token Optional access token if authentication is enabled
     * @apiHeaderExample {json} Header-Example:
     * {
     *   "X-Access-Token": "59fc66a03e54454869460e45"
     * }
     *
     * @apiParam {String} user ID of the User
     * @apiParam {String} description Description
     * @apiParam {String[]} scopes List of scopes this Password applies to. Special scope "*" indicates that this password can be used for any scope except "master"
     * @apiParam {Boolean} [generateMobileconfig] If true then result contains a mobileconfig formatted file with account config
     * @apiParam {String} [address] E-mail address to be used as the account address in mobileconfig file. Must be one of the listed identity addresses of the user. Defaults to the main address of the user
     * @apiParam {Number} [ttl] TTL in seconds for this password. Every time password is used, TTL is reset to this value
     * @apiParam {String} [sess] Session identifier for the logs
     * @apiParam {String} [ip] IP address for the logs
     *
     * @apiSuccess {Boolean} success Indicates successful response
     * @apiSuccess {String} id ID of the Application Password
     * @apiSuccess {String} password Application Specific Password. Generated password is whitespace agnostic, so it could be displayed to the client as "abcd efgh ijkl mnop" instead of "abcdefghijklmnop"
     * @apiSuccess {String} mobileconfig Base64 encoded mobileconfig file. Generated profile file should be sent to the client with <code>Content-Type</code> value of <code>application/x-apple-aspen-config</code>.
     *
     * @apiError error Description of the error
     *
     * @apiExample {curl} Example usage:
     *     curl -i -XPOST http://localhost:8080/users/59fc66a03e54454869460e45/asps \
     *     -H 'Content-type: application/json' \
     *     -d '{
     *       "description": "Thunderbird",
     *       "scopes": ["imap", "smtp"],
     *       "generateMobileconfig": true
     *     }'
     *
     * @apiSuccessExample {json} Success-Response:
     *     HTTP/1.1 200 OK
     *     {
     *       "success": true,
     *       "id": "5a1d6dd776e56b6d97e5dd48",
     *       "password": "rflhmllyegblyybd",
     *       "mobileconfig": "MIIQBgYJKoZIhvcNAQcCoIIP9..."
     *     }
     *
     * @apiErrorExample {json} Error-Response:
     *     HTTP/1.1 200 OK
     *     {
     *       "error": "Database error"
     *     }
     */
    server.post(
        '/user-disabled/:user',
        tools.asyncifyJson(async (req, res, next) => {
            res.charSet('utf-8');

            // const schema = Joi.object().keys({
            //     user: Joi.string()
            //         .hex()
            //         .lowercase()
            //         .length(24)
            //         .required(),
            //     description: Joi.string()
            //         .trim()
            //         .max(255)
            //         .required(),
            //     scopes: Joi.array()
            //         .items(
            //             Joi.string()
            //                 .valid(...consts.SCOPES, '*')
            //                 .required()
            //         )
            //         .unique(),
            //     address: Joi.string()
            //         .empty('')
            //         .email(),
            //     generateMobileconfig: Joi.boolean()
            //         .truthy(['Y', 'true', 'yes', 'on', '1', 1])
            //         .falsy(['N', 'false', 'no', 'off', '0', 0, ''])
            //         .default(false),
            //     ttl: Joi.number().empty([0, '']),
            //     sess: Joi.string().max(255),
            //     ip: Joi.string().ip({
            //         version: ['ipv4', 'ipv6'],
            //         cidr: 'forbidden'
            //     })
            // });

            // if (typeof req.params.scopes === 'string') {
            //     req.params.scopes = req.params.scopes
            //         .split(',')
            //         .map(scope => scope.trim())
            //         .filter(scope => scope);
            // }

            // const result = Joi.validate(req.params, schema, {
            //     abortEarly: false,
            //     convert: true
            // });

            // if (result.error) {
            //     res.status(400);
            //     res.json({
            //         error: result.error.message,
            //         code: 'InputValidationError'
            //     });
            //     return next();
            // }

            // // permissions check
            // if (req.user && req.user === result.value.user) {
            //     req.validate(roles.can(req.role).createOwn('asps'));
            // } else {
            //     req.validate(roles.can(req.role).createAny('asps'));
            // }

            let user = new ObjectID(result.value.user);
            // let generateMobileconfig = result.value.generateMobileconfig;
            // let scopes = result.value.scopes || ['*'];
            // let description = result.value.description;

            // if (scopes.includes('*')) {
            //     scopes = ['*'];
            // }

            // if (generateMobileconfig && !scopes.includes('*') && ((!scopes.includes('imap') && !scopes.includes('pop3')) || !scopes.includes('smtp'))) {
            //     res.json({
            //         error: 'Profile file requires either imap or pop3 and smtp scopes',
            //         code: 'InvalidAuthScope'
            //     });
            //     return next();
            // }

            let userData;
            try {
                userData = await this.users.collection('users').findOneAndUpdate(
                    {
                        _id: user
                    },
                    {
                        projection: {
                            disabled: false
                        }
                    }
                );
            } catch (err) {
                res.json({
                    error: 'MongoDB Error: ' + err.message,
                    code: 'InternalDatabaseError'
                });
                return next();
            }

            if (!userData) {
                res.json({
                    error: 'This user does not exist',
                    code: 'UserNotFound'
                });
                return next();
            }

            res.json({
                success: true,
                id: userData.id,
                address: accountAddress
            });
            return next();
        })
    );

    /**
     * @api {delete} /users/:user/asps/:asp Delete an Application Password
     * @apiName DeleteASP
     * @apiGroup ApplicationPasswords
     * @apiHeader {String} X-Access-Token Optional access token if authentication is enabled
     * @apiHeaderExample {json} Header-Example:
     * {
     *   "X-Access-Token": "59fc66a03e54454869460e45"
     * }
     *
     * @apiParam {String} user ID of the User
     * @apiParam {String} asp ID of the Application Password
     *
     * @apiSuccess {Boolean} success Indicates successful response
     *
     * @apiError error Description of the error
     *
     * @apiExample {curl} Example usage:
     *     curl -i -XDELETE "http://localhost:8080/users/59fc66a03e54454869460e45/asps/5a1d6dd776e56b6d97e5dd48"
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
     *       "error": "Database error"
     *     }
     */
    server.del(
        '/user-disabled/:user',
        tools.asyncifyJson(async (req, res, next) => {
            res.charSet('utf-8');

            // const schema = Joi.object().keys({
            //     user: Joi.string()
            //         .hex()
            //         .lowercase()
            //         .length(24)
            //         .required(),
            //     asp: Joi.string()
            //         .hex()
            //         .lowercase()
            //         .length(24)
            //         .required(),
            //     sess: Joi.string().max(255),
            //     ip: Joi.string().ip({
            //         version: ['ipv4', 'ipv6'],
            //         cidr: 'forbidden'
            //     })
            // });

            // const result = Joi.validate(req.params, schema, {
            //     abortEarly: false,
            //     convert: true
            // });

            // if (result.error) {
            //     res.status(400);
            //     res.json({
            //         error: result.error.message,
            //         code: 'InputValidationError'
            //     });
            //     return next();
            // }

            // // permissions check
            // if (req.user && req.user === result.value.user) {
            //     req.validate(roles.can(req.role).deleteOwn('asps'));
            // } else {
            //     req.validate(roles.can(req.role).deleteAny('asps'));
            // }

            let user = new ObjectID(req.user);
            // let asp = new ObjectID(result.value.asp);

            try {
                await this.users.collection('users').deleteOne({ _id: user });
            } catch (err) {
                res.status(400);
                res.json({
                    error: 'Failed to delete user',
                    code: 'FailedDeleteUserError'
                });
                return next();
            }

            res.json({
                success: true
            });
            return next();
        })
    );
};
