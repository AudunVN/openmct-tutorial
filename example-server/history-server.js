/*
Copyright 2017 Erigo Technologies LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

/**
 *
 * Server-side, history server; returns historical data: telemetrySource.history[id]
 *
 * Uses the Express web framework for the server (https://expressjs.com/)
 *
 * This is based on the original history-server.js from openmct-tutorial.
 * Original code modified to serve either CloudTurbine channel metadata or
 * historical data.
 */

var express = require('express');

function HistoryServer(telemetrySource, port) {
    server = express();

    server.use(function (req, res, next) {
        res.set('Access-Control-Allow-Origin', '*');
        next();
    });

    server.get('/telemetry/:pointId', function (req, res) {
        if (req.params.pointId == 'ct_chan_metadata') {
            // Client is requesting the CloudTurbine channel metadata
            res.status(200).json(telemetrySource.ctMetadata).end();
        } else {
            // Client is requesting historical information
            var start = +req.query.start;
            var end = +req.query.end;
            var ids = req.params.pointId.split(',');
            // console.log("\nhistory-server: start = " + start + ", end = " + end + "\n");
            var response = ids.reduce(function (resp, id) {
                return resp.concat(telemetrySource.history[id].filter(function (p) {
                    return p.timestamp > start && p.timestamp < end;
                }));
            }, []);
            res.status(200).json(response).end();
        }
    });

    server.listen(port);
    console.log('History server now running at http://localhost:' + port);
}

module.exports = HistoryServer;

