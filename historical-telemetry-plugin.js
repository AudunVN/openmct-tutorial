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
 * Basic historical telemetry plugin.
 *
 * This is a modified version of the original historical-telemetry-plugin.js
 * from openmct-tutorial.  Modified to support the startup of multiple
 * history servers by adding desired_domain_object_type and port arguments.
 *
 * This is a *client-side* file (run in browser)
 *
 * The URL constructed below queries the historical server (which is
 * implemented in history-server.js) for existing data.
 */

function HistoricalTelemetryPlugin(desired_domain_object_type,port) {
    return function install (openmct) {
        var provider = {
            supportsRequest: function (domainObject) {
                return domainObject.type === desired_domain_object_type;
            },
            request: function (domainObject, options) {
                var url = 'http://localhost:' + port + '/telemetry/' +
                    domainObject.identifier.key +
                    '?start=' + options.start +
                    '&end=' + options.end;
                console.log('historical-telemetry-plugin.js: send request = ' + url);
                return http.get(url)
                    .then(function (resp) {
                        return resp.data;
                    });
            }
        };

        openmct.telemetry.addProvider(provider);
    }
}
