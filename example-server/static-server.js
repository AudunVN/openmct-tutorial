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
 * Start the server that the web browser will connect to.
 *
 * This version has been modified from the original from openmct-tutorial;
 * this version adds a port number argument.
 **/

var express = require('express');

function StaticServer(port) {
    var server = express();
    
    server.use('/', express.static(__dirname + '/..'));
    
    console.log('Open MCT hosted at http://localhost:' + port);
    
    server.listen(port);
}

module.exports = StaticServer;