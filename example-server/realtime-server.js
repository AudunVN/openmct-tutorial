
/**
 * Real-time server, run on server side; pushes real-time updates to subscribed
 * channels over WebSockets.
 *
 * This is a modified version of the original realtime-server.js; this version
 * can serve multiple telemetry sources at different ports.
 */

var WebSocketServer = require('ws').Server;

function RealtimeServer(telemetrySource, port) {
    this.telemetrySource = telemetrySource;
    this.server = new WebSocketServer({ port: port });
    this.server.on('connection', this.handleConnection.bind(this));
    console.log('Realtime server started at ws://localhost:' + port);
};

RealtimeServer.prototype.handleConnection = function (ws) {
    var unlisten = this.telemetrySource.listen(notifySubscribers);
        subscribed = {}, // Active subscriptions for this connection
        handlers = { // Handlers for specific requests
            subscribe: function (id) {
                subscribed[id] = true;
            },
            unsubscribe: function (id) {
                delete subscribed[id];
            }
        };

    // this function is called as a result of spacecraft.js/notify() or cloudturbine.js/notify() being called
    // push out data (via WebSocket) to the client-side subscribers (see realtime-telemetry-plugin.js/socket.onmessage)
    function notifySubscribers(point) {
        if (subscribed[point.id]) {
        	// console.log('realtime-server.js: push data to subscribed channel ' + point.id + ': time = ' + point.timestamp + ' value = ' + point.value);
            ws.send(JSON.stringify(point));
        }
    }

    // Listen for requests
    ws.on('message', function (message) {
        var parts = message.split(' '),
            handler = handlers[parts[0]];
        if (handler) {
            handler.apply(handlers, parts.slice(1));
        }
    });

    // Stop sending telemetry updates for this connection when closed
    ws.on('close', unlisten);
};



module.exports = RealtimeServer;