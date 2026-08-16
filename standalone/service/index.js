"use strict";

// axotube Standalone service

var express = require('express');
var app = express();
var PORT = 8099;
var fetch = require('node-fetch');
var URL = require('url');
var path = require('path');
var fs = require('fs');

var USERSCRIPT_PATH = path.join(__dirname, '..', '..', 'userscript', 'userScript.js');

app.use(function (req, res, next) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.setHeader('Access-Control-Allow-Headers', '*');
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    next();
});

app.get('/tizentube/health', function (req, res) {
    res.status(200).end();
});

// Serve the bundled userscript locally — no CDN round trip, instant load.
app.get('/axotube/userScript.js', function (req, res) {
    res.setHeader('Content-Type', 'application/javascript');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    fs.createReadStream(USERSCRIPT_PATH).pipe(res);
});

app.all('*', function (req, res) {
    var isCorsBypass = req.path.indexOf('/cors-bypass/') === 0;

    var targetUrl;
    if (isCorsBypass) {
        var rawTarget = req.url.substring('/cors-bypass/'.length);
        targetUrl = rawTarget.indexOf('http') === 0 ? rawTarget : 'https://' + rawTarget;
    } else {
        targetUrl = 'https://www.youtube.com' + req.url;
    }

    var headers = {};
    for (var key in req.headers) {
        if (Object.prototype.hasOwnProperty.call(req.headers, key)) {
            if (key === 'cookie') {
                headers[key] = req.headers[key]
                    .replace(/__LocalSecure-/g, '__Secure-')
                    .replace(/__LocalHost-/g, '__Host-');
                continue;
            }
            headers[key] = req.headers[key];
        }
    }

    try {
        var parsedUrl = URL.parse(targetUrl);
        headers['host'] = parsedUrl.host;
    } catch (e) {
        headers['host'] = 'www.youtube.com';
    }

    headers['origin'] = 'https://www.youtube.com';
    if (headers['referer']) {
        headers['referer'] = 'https://www.youtube.com/tv';
    }

    headers['accept-encoding'] = 'gzip, deflate';

    var hasBody = ['POST', 'PUT', 'PATCH'].indexOf(req.method) !== -1;
    var fetchOptions = {
        method: req.method,
        headers: headers,
        body: hasBody ? req : undefined,
        redirect: 'manual'
    };

    fetch(targetUrl, fetchOptions)
        .then(function (response) {
            if (req.method === 'OPTIONS') {
                res.status(200);
            } else {
                res.status(response.status);
            }

            var headerKeys = response.headers.raw();
            for (var key in headerKeys) {
                if (Object.prototype.hasOwnProperty.call(headerKeys, key)) {
                    var lowerKey = key.toLowerCase();
                    var skipHeaders = ['content-encoding', 'content-length', 'transfer-encoding', 'content-security-policy', 'alt-svc'];
                    if (isCorsBypass) skipHeaders.push('access-control-allow-origin');

                    if (skipHeaders.indexOf(lowerKey) !== -1) continue;

                    var value = response.headers.get(key);
                    if (lowerKey === 'set-cookie') {
                        var rawCookies = headerKeys[key];
                        if (Array.isArray(rawCookies)) {
                            var modifiedCookies = rawCookies.map(function (cookieStr) {
                                return cookieStr
                                    .replace(/^__Secure-/i, '__LocalSecure-')
                                    .replace(/^__Host-/i, '__LocalHost-')
                                    .replace(/Domain=[^;]+/i, 'Domain=localhost')
                                    .replace(/;\s*Secure/i, '')
                                    .replace(/;\s*SameSite=None/i, '')
                                    .replace(/;\s*;/g, ';')
                                    .replace(/;\s*$/, '');
                            });
                            res.setHeader('Set-Cookie', modifiedCookies);
                            continue;
                        }
                    }

                    res.setHeader(key, value);
                }
            }

            res.setHeader('Access-Control-Allow-Origin', '*');

            var contentType = response.headers.get('content-type') || '';

            if (contentType.indexOf('text/html') !== -1 ||
                contentType.indexOf('application/json') !== -1 ||
                contentType.indexOf('javascript') !== -1 ||
                contentType.indexOf('text/css') !== -1) {

                return response.text().then(function (text) {
                    if (req.url.indexOf('/tv') === 0 && req.url.indexOf('/tv_config') === -1) {
                        // Inject the axotube userscript, served locally from the wgt.
                        text += '<script src="http://localhost:' + PORT + '/axotube/userScript.js"></script>';
                    }

                    var proxyPrefix = 'http://localhost:' + PORT + '/cors-bypass/';

                    // Rewrite rules for replacing URLs so CORS and presumably YT is happy.
                    text = text.replace(/https:\/\/([a-zA-Z0-9-.]+)\.googlevideo\.com/g, proxyPrefix + 'https://$1.googlevideo.com');
                    text = text.replace(/https:\\\/\\\/([a-zA-Z0-9-.]+)\.googlevideo\.com/g, 'http:\\\/\\\/localhost:' + PORT + '\\\/cors-bypass\\\/https:\\\/\\\/$1.googlevideo.com');
                    text = text.replace(/"\/\/([a-zA-Z0-9-.]+)\.googlevideo\.com/g, '"' + proxyPrefix + 'https://$1.googlevideo.com');

                    text = text.replace(/https:\/\/www\.gstatic\.com/g, proxyPrefix + 'https://www.gstatic.com');
                    text = text.replace(/http:\/\/www\.gstatic\.com/g, proxyPrefix + 'https://www.gstatic.com');
                    text = text.replace(/"\/\/www\.gstatic\.com/g, '"' + proxyPrefix + 'https://www.gstatic.com');
                    text = text.replace(/\(\/\/www\.gstatic\.com/g, '(' + proxyPrefix + 'https://www.gstatic.com');

                    text = text.replace(/https:\/\/yt3\.ggpht\.com/g, proxyPrefix + 'https://yt3.ggpht.com');

                    text = text.replace(/https:\/\/clients1\.google\.com/g, proxyPrefix + 'https://clients1.google.com');
                    text = text.replace(/http:\/\/clients1\.google\.com/g, proxyPrefix + 'https://clients1.google.com');
                    text = text.replace(/"\/\/clients1\.google\.com/g, '"' + proxyPrefix + 'https://clients1.google.com');

                    text = text.replace('Set(["www.youtube.com","accounts.google.com"]);', 'Set(["www.youtube.com", "accounts.google.com", "localhost"]);');
                    text = text.replace(/:document\.location\.toString\(\)/g, ':document.location.toString().replace("http://localhost:' + PORT + '", "https://www.youtube.com")');
                    text = text.replace(/euri:[^,]+,/g, 'euri:document.location.toString().replace("http://localhost:' + PORT + '", "https://www.youtube.com"),');
                    text = text.replace(/https:\/\/s\.youtube\.com/g, proxyPrefix + 'https://s.youtube.com');
                    text = text.replace(/redirector.googlevideo.com/g, proxyPrefix + 'https://redirector.googlevideo.com');
                    text = text.replace(/this.scheme="https"/, 'this.scheme="http"');
                    text = text.replace(/https\:\/\/jnn-pa.googleapis.com/g, proxyPrefix + 'https://jnn-pa.googleapis.com');
                    text = text.replace(/https:\/\/yt3\.googleusercontent\.com/g, proxyPrefix + 'https://yt3.googleusercontent.com');
                    text = text.replace(/"\/\/yt3\.googleusercontent\.com/g, '"' + proxyPrefix + 'https://yt3.googleusercontent.com');

                    // In order to fix history not working
                    text = text.replace(/=window\.location\.href;/, '=window.location.href.replace("http://localhost:' + PORT + '", "https://www.youtube.com");');
                    text = text.replace(/=document\.location\.href/, '=document.location.href.replace("http://localhost:' + PORT + '", "https://www.youtube.com")');

                    res.send(text);
                });
            } else {
                if (response.body) {
                    response.body.pipe(res);
                } else {
                    res.end();
                }
            }
        })
        .catch(function (error) {
            console.error('Proxy Error for [' + targetUrl + ']: ' + error);
            console.error(error.stack);
            if (!res.headersSent) {
                res.status(500).send('Proxy Connection Broken');
            }
        });
});

app.listen(PORT, "127.0.0.1");

// Start the DIAL server (stays on 8085 in both module and standalone mode,
// so the userscript's webConfig polling of 127.0.0.1:8085 keeps working).
global.isAxoTubeStandalone = true;
require('../../dist/service.js');