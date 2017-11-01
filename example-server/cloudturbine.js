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
 * cloudturbine.js: generate telemetry stream from CloudTurbine channel data,
 * fetched from CTweb server.
 *
 * This is based on NASA's Spacecraft telemetry generator found in spacecraft.js
 * from the openmct-tutorial example.  This version has been modified to fetch
 * CT data from the CTweb RESTful service.
 *
 * NOTE:
 * CT channel names typically include a parentfolder/channelname format, separated by '/'.  Since '/' can't be used
 * as an index/key string for referencing this.state and this.lastCTtime entries, we replace '/' character in the
 * channel names with 2 underscores, "__".  Conversely, the double-underscore is put back to '/' when making the
 * CTweb request in getCTData().
 *
 * To-Do ideas:
 * 1. Have CT channel list dynamically updated in real time?  Maybe check for new channels once every minute.
 *    The client/browser would need to request this updated metadata periodically, compare it against what is
 *    already in the channel tree and either add or delete channels that have changed.  Would involve functions
 *    in ct-dictionary-plugins.js, maybe ct_compositionProvider.load()
 * 2. Is there a way that data can be more efficiently transferred to sinks?  For instance, Matt wondered
 *    about sending data as array/CSV.
 * 3. Replace the history-server with calls directly to CTweb server to fetch the historic data.  Downside of
 *    the way we currently do it is that all the data is stored in this.history array, even for channels we
 *    may never use; downside of calling CTweb server in real-time directly for historic data is that we then need
 *    to crunch through all of the returned data right then instead of just pulling it out of this.history.
 * 4. Customize the browser display.  Maybe include a custom UI widget for displaying data.
 * 5. Is there a way to scroll back and forth through time?
 *
 */

var http = null;        // object for making HTTP requests
var ctwebHost = null;   // CTweb host
var ctwebPort = -1;     // CTweb port
var ctChannels = null;  // array of CT channel names and data types (filled in server.js/getCTChanInfo())

var DOMParser = require('xmldom').DOMParser; // this is an XML parser, but works OK for HTML

function CloudTurbine(httpI,ctwebHostI,ctwebPortI,ctChannelsI) {
    http = httpI;
    ctwebHost = ctwebHostI;
    ctwebPort = ctwebPortI;
    ctChannels = ctChannelsI;
    // Produce JSON structure containing metadata for all CT channels
    this.ctMetadata = createCTMetadata();
    // Setup state and lastCTtime arrays based on the channel data in ctMetadata
    this.state = {};
    this.lastCTtime = {};
    this.chanFormat = {};
    this.history = {};
    this.ctMetadata.measurements.forEach(function (measurement) {
        var chan_data_type = measurement.values[0].format;
        var chan_name = measurement.key;
        if (chan_data_type == 'integer') {
            this.state[chan_name] = 0;
        } else if (chan_data_type == 'float') {
            this.state[chan_name] = 0.0;
        } else if ( (chan_data_type == 'string') || (chan_data_type == 'image') ) {
            this.state[chan_name] = '';
        }
        this.lastCTtime[chan_name] = Math.floor(Date.now()/1000.0);
        // Determine this channel's format ('integer', 'float', 'string', or 'image'
        for (var i=0; i<ctChannels.length; ++i) {
            if (ctChannels[i].name == chan_name) {
                this.chanFormat[chan_name] = ctChannels[i].format;
                break;
            }
        }
        this.history[chan_name] = [];
    }, this);
    // console.log("\n\nstate:\n" + JSON.stringify(this.state) + "\n\nlastCTtime:\n" + JSON.stringify(this.lastCTtime) + "\n\nchanFormat:\n" + JSON.stringify(this.chanFormat) + "\n\nhistory:\n" + JSON.stringify(this.history) + '\n');

    this.listeners = [];

    // call these functions at 1Hz (period = 1000 msec)
    // 2017-08-31: call at 4Hz, ie every 250msec
    setInterval(function () {
        this.updateTelemetry();
    }.bind(this), 250);

    console.log("CloudTurbine telemetry stream launched!");
}

/**
 * Create a JSON structure containing metadata for all CT channels.
 *
 * For a good, simple example of creating a JSON structure which contains arrays, see Xotic's answer at
 * https://stackoverflow.com/questions/16507222/create-json-object-dynamically-via-javascript-without-concate-strings
 */
function createCTMetadata() {
    var ctMetadata = {};
    var measurements = [];
    ctMetadata.name = "CloudTurbine Telemetry";
    ctMetadata.key = "ct";
    ctMetadata.measurements = measurements;
    /**
     * Example
     *
     * // Add the first measurement - CTSimpleSource__c0
     * measurement = defineMeasurement("c0 (int)","CTSimpleSource__c0","integer");
     * ctMetadata.measurements.push(measurement);
     * // Add the second measurement - CTSimpleSource__c1
     * measurement = defineMeasurement("c1 (float)","CTSimpleSource__c1","float");
     * ctMetadata.measurements.push(measurement);
     * // Add the third measurement - CTSimpleSource__c2.txt
     * measurement = defineMeasurement("c2 (str)","CTSimpleSource__c2.txt","string");
     * ctMetadata.measurements.push(measurement);
     * // Add the fourth measurement - comms.sent
     * measurement = defineMeasurement("Data sent (bytes)","comms.sent","integer");
     * ctMetadata.measurements.push(measurement);
     */
    for (var i=0; i<ctChannels.length; ++i) {
        var chanNameWithForwardSlash = ctChannels[i].name.replace( /__/g, "/" );
        measurement = defineMeasurement(chanNameWithForwardSlash,ctChannels[i].name,ctChannels[i].format);
        ctMetadata.measurements.push(measurement);
    }
    // Add additional channel, 'comms.sent', which stores the number of bytes that have been processed
    measurement = defineMeasurement("Data sent (bytes)","comms.sent","integer");
    ctMetadata.measurements.push(measurement);
    return ctMetadata;
}

/**
 * Create a new measurement structure to be added to CT metadata.
 * @param nameI     User-friendly channel name
 * @param keyI      Formal channel name
 * @param formatI   Type of data this channel holds
 * @returns a new measurement structure
 */
function defineMeasurement(nameI, keyI, formatI) {
    var measurement = {
        "name": nameI,
        "key": keyI,
        "values": [
            {
                "key": "value",
                "name": "Value",
                "format": formatI,
                "hints": {
                    "range": 1
                }
            },
            {
                "key": "utc",
                "source": "timestamp",
                "name": "Timestamp",
                "format": "utc",
                "hints": {
                    "domain": 1
                }
            }
        ]
    };
    if (formatI == 'image') {
        // Image telemetry streams store the URL (ie, a string) to the needed image for a given timestamp.
        // Question: do we include a timestamp value entry for images?
        measurement.values[0].key = 'url';
        measurement.values[0].name = 'Image';
        measurement.values[0].format = 'image';
        delete(measurement.values[0].hints.range);
        measurement.values[0].hints.image = 1;
        measurement.values[0].source = 'value';
    } else if (formatI == 'string') {
        // Question: should measurement.values[0].hints include range?  If not range, then what hint should we include for string data?
    }
    return measurement;
}

/**
 * Initiate data updates for each channel in this.state.
 * For channel 'comms.sent', we have the updated data already, so just send it out.
 * All other channels need to fetch updated CT data from CTweb; this is done via asynchronous fetch.
 */
CloudTurbine.prototype.updateTelemetry = function () {
    Object.keys(this.state).forEach(function (id) {
    	// console.log('updateTelemetry(): update data for channel ' + id);
    	var updatedPoint;
    	if (id != 'comms.sent') {
            // Asynchronously fetch CT data via HTTP from CTweb server
            // NOTE: add 0.001 to the latest time so we don't get a duplicate point (ie, get data *after* this.lastCTtime[id])
            getCTData(this,id,this.lastCTtime[id] + 0.001,this.chanFormat[id]);
        } else {
    	    // For channel 'comms.sent'
            updatedPoint = { timestamp: Date.now(), value: this.state[id], id: id};
            postUpdatedData(this,id,updatedPoint);
            console.log('\n' + id + ': 1 new data point posted');
        }
    }, this);
};

/**
 * Store updated data for a channel in the history buffer (this.history)
 * and also notify listeners to push out real-time updates.
 * @param chanName      The channel name
 * @param updatedPoint  Updated data point for 1 channel, in JSON format
 */
function postUpdatedData(refObj,chanName,updatedPoint) {
    // console.log('postUpdatedData(): chanName = ' + chanName + ', updatedPoint = ' + updatedPoint);
    refObj.notify(updatedPoint);  // this tickles notifySubscribers() in realtime-server.js, which in turn pushes the data point to subscribers
    refObj.history[chanName].push(updatedPoint);  // save data in historical buffer
    // Update the amount of data we have sent out
    refObj.state["comms.sent"] += JSON.stringify(updatedPoint).length;
}

/**
 * Fetch updated data from a CloudTurbine channel using Node.js HTTP API.
 * This function is taken from https://gist.github.com/jmar777/87fc99cfe3ec27d88e6e
 * @param refObj          Object reference so we can access the class variables: this.state, this.lastCTtime, etc.
 * @param origChanName    Specifies the channel to fetch data from; this name uses double-underscore ("__") in place of forward slash ("/")
 * @param startTime       Absolute start time in seconds for the request
 * @param chanDataFormat  Specifies the type of data that will be fetched
 */
function getCTData(refObj, origChanName, startTime, chanDataFormat) {
    // We use double underscore ("__") in place of forward slash ("/") for the path separator in CT channel names;
    // need to substitute back '/' for "__" for requesting data from CTweb server.  See note in the file header
    // at the top of this file for further information.
    var ctChanName = origChanName.replace( /__/g, "/" );
    // Request all data from startTime forward (use "d=100000000" for essentially infinite time out)
    var additionalFlags = '';
    if (chanDataFormat == 'image') {
        // For image channels, just request the time
        additionalFlags = '&f=t';
    }
    http.get({
        host: ctwebHost,
        port: ctwebPort,
        path: '/CT/' + ctChanName + '?r=absolute&d=100000000&t=' + startTime + additionalFlags
    }, function(res) {
        // explicitly treat incoming data as utf8 (avoids issues with multi-byte chars)
        res.setEncoding('utf8');

        // incrementally capture the incoming response body
        var body = '';
        res.on('data', function(d) {
            body += d;
        });

        // process the complete response
        res.on('end', function() {
            // process data we have fetched from CTweb
            processCTData(refObj,origChanName,ctChanName,chanDataFormat,body);
        });
    }).on('error', function(err) {
        // handle errors with the request itself
        console.error('getCTData(): Error with the request:', err.message);
    });
}

function processCTData(refObj,chanName,ctChanName,chanDataFormat,data) {
    // If data starts with "<html>" then we probably got 404 error,
    // simply indicating that there is no new data on this channel
    if (data.startsWith('<html>')) {
        if (data.toLowerCase().indexOf('http error 404') != -1) {
            // console.log('...no new data for channel ' + chanName);
        } else {
            console.log('Error with data for channel ' + chanName + ':\n' + data);
        }
        return;
    }
    //
    // NOTE: WHAT SHOULD WE DO IF WE HAVE A MULTI-LINE STRING AS A VALUE?  MAYBE ENCODE THE TIME/VALUE PAIRS
    //       AS JSON DATA?  THERE MAY BE A WAY TO EMBED NEWLINES IN THE STRING VALUE IN JSON - SEE THE FOLLOWING URL:
    //       https://stackoverflow.com/questions/2392766/multiline-strings-in-json
    //
    // CTweb could have returned multiple data point separated by new lines; therefore, break up the data by newline
    dataArray = data.split("\n");
    var numDataPointsPosted = 0;
    for (var i = 0; i < dataArray.length; ++i) {
        var nextStr = dataArray[i].trim();
        if ((nextStr == null) || (nextStr.length == 0)) {
            continue;
        }
        var timeSec = null;
        var nextVal = null;
        if (chanDataFormat == 'image') {
            // IMAGE CHANNELS
            // nextStr should just be a timestamp;
            // creating the URL data string will be done further below after more processing of the timestamp
            timeSec = parseFloat(nextStr);
            if (isNaN(timeSec)) {
                continue;
            }
        } else {
            // OTHER CHANNELS (NOT IMAGE CHANNELS)
            // nextStr should be a <time>,<value> pair; break this up into timestamp and value;
            // everything before the first comma is the timestamp, everything after is the value
            var commaIdx = nextStr.indexOf(",");
            if (commaIdx == -1) {
                continue;
            }
            if ((commaIdx == 0) || ((commaIdx + 1) == nextStr.length)) {
                // Malformed either no timestamp or no value
                continue;
            }
            timeSec = parseFloat(nextStr.substring(0, commaIdx));
            nextVal = nextStr.substring(commaIdx + 1);
            if (chanName.endsWith('.wav')) {
                // special processing for WAV files: produce a value between -1 and +1 by dividing by 32768.0
                nextVal = parseFloat(nextVal)/32768.0;
            }
        }
        if (timeSec <= refObj.lastCTtime[chanName]) {
            // This is a repeated data point, time hasn't moved forward
            continue;
        }
        // Store time in lastCTtime as seconds (this is used for the CT request)
        // Store time in updatedPoint as milliseconds (this is what Open MCT uses)
        if (timeSec > 3.0E9) {
            // this time value must be in milliseconds; convert to seconds
            timeSec = timeSec / 1000.0;
        }
        if (chanDataFormat == 'image') {
            // For image channels, given the timestamp, form a URL appropriate for fetching that image;
            // this URL string is what we store as the channel data
            // Can try a known, hardwired URL for testing...
            // nextVal = 'http://wc2.dartmouth.edu/jpg/image.jpg';
            nextVal = 'http://' + ctwebHost + ':' + ctwebPort + '/CT/' + ctChanName + '?r=absolute&t=' + timeSec;
            // console.log(nextVal);
        }
        var updatedPoint = {timestamp: timeSec * 1000.0, value: nextVal, id: chanName};
        refObj.lastCTtime[chanName] = timeSec;
        postUpdatedData(refObj, chanName, updatedPoint);
        ++numDataPointsPosted;
    }
    console.log(chanName + ': ' + numDataPointsPosted + ' new data points posted');
}

// Call each of the registered listeners to notify them of updated data.
// This ends up calling realtime-server.js/notifySubscribers(point)
// (see notes on listen down below for further info)
CloudTurbine.prototype.notify = function (point) {
    this.listeners.forEach(function (l) {
        l(point);
    });
};

// This 'listen' function is called from realtime-server.js/handleConnection; the argument
// which handleConnection gives to this 'listen' function is a function handle which should
// be called whenever realtime updates are available; this function to call in realtime-server.js
// is notifySubscribers(<point>); we call this from CloudTurbine.prototype.notify (see above).
CloudTurbine.prototype.listen = function (listener) {
    this.listeners.push(listener);
    return function () {
        this.listeners = this.listeners.filter(function (l) {
            return l !== listener;
        });
    }.bind(this);
};

module.exports = function (httpI,ctwebHostI,ctwebPortI,ctChannelsI) {
    return new CloudTurbine(httpI,ctwebHostI,ctwebPortI,ctChannelsI)
};
