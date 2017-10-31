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
 * Basic Realtime telemetry plugin using websockets.
 *
 * This is a modified version of the original realtime-telemetry-plugin.js
 * from openmct-tutorial.  Modified to support the startup of multiple
 * history servers by adding desired_domain_object_type and port arguments.
 *
 * This is a *client-side* file (run in browser)
 *
 * From https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_client_applications:
 * "WebSockets is an event-driven API; when messages are received, a 'message' event is delivered to the onmessage function"
 */
function RealtimeTelemetryPlugin(desired_domain_object_type,port) {
    return function (openmct) {
        var socket = new WebSocket('ws://localhost:' + port);
        var listeners = {};

        // This is the WebSockets function that gets called to push data updates from the real-time server to the real-time client
        // (see realtime-server.js/notifySubscribers())
        socket.onmessage = function (event) {
            point = JSON.parse(event.data);
            // console.log("realtime-telemetry-plugin.js: received new data for channel " + point.id + ": time = " + point.timestamp + " value = " + point.value);
            if (listeners[point.id]) {
                listeners[point.id].forEach(function (l) {
                    l(point);
                });
            }
        };

        var provider = {
            supportsSubscribe: function (domainObject) {
                return domainObject.type === desired_domain_object_type;
            },
            subscribe: function (domainObject, callback, options) {
                if (!listeners[domainObject.identifier.key]) {
                    listeners[domainObject.identifier.key] = [];
                }
                if (!listeners[domainObject.identifier.key].length) {
                    socket.send('subscribe ' + domainObject.identifier.key);
                }
                listeners[domainObject.identifier.key].push(callback);
                return function () {
                    listeners[domainObject.identifier.key] =
                        listeners[domainObject.identifier.key].filter(function (c) {
                            return c !== callback;
                        });

                    if (!listeners[domainObject.identifier.key].length) {
                        socket.send('unsubscribe ' + domainObject.identifier.key);
                    }
                };
            }
        };

        openmct.telemetry.addProvider(provider);
    }
}
