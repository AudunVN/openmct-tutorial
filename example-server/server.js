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
 * Start up telemetry data sources and history and realtime telemetry servers,
 * specifying what ports they will use.
 *
 * This is a modified version based on the original from openmct-tutorial.
 * This version adds support for CloudTurbine, including code to get CT
 * channel metadata.
 *
 * Since the CloudTurbine telemetry data source uses a list of CloudTurbine channel names,
 * we first query the CTweb server for channel names; when we have this info, startServers()
 * is called to start the data sources and servers.
 */

var http = require('http');
var ctwebHost = 'localhost';    // CTweb host
var ctwebPort = 8000;           // CTweb port
var ctChannels = [];            // array of CT channel names and data types (filled in getCTChanInfo())

// Variables used for HTML parsing in getCTChanInfo()
var DOMParser = require('xmldom').DOMParser;    // this is an XML parser, but works OK for HTML
var bFirstHTTPResponse = true;                  // are we processing the first HTTP response?
var httpRequestQueue = [];                      // store all the source paths; we will make a request of each source to get its channel names

var CloudTurbine = require('./cloudturbine');
var Spacecraft = require('./spacecraft');
var RealtimeServer = require('./realtime-server');
var HistoryServer = require('./history-server');
var StaticServer = require('./static-server');

var cloudturbine = null;
var spacecraft = null;
var ctrealtimeServer = null;
var cthistoryServer = null;
var realtimeServer = null;
var historyServer = null;
var staticServer = null;

getCTChanInfo('/CT');

function startServers() {
    cloudturbine = new CloudTurbine(http,ctwebHost,ctwebPort,ctChannels);
    spacecraft = new Spacecraft();
    ctrealtimeServer = new RealtimeServer(cloudturbine, 8092);
    cthistoryServer = new HistoryServer(cloudturbine, 8091);
    realtimeServer = new RealtimeServer(spacecraft, 8082);
    historyServer = new HistoryServer(spacecraft, 8081);
    staticServer = new StaticServer(8080);
}

/**
 * Query CTweb server to get a list of channels.
 * @param urlI  The request URL
 */
function getCTChanInfo(pathI) {
    http.get({
        host: ctwebHost,
        port: ctwebPort,
        path: pathI
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
            // console.log('getCTChanInfo(): response:\n' + body);
            // Extract a list of source names from the first response; process each of these URLs to get the list of channels.
            // NOTE 1: We are using the xmldom package for parsing the HTML since node.js doesn't include DOM parsing; see https://www.npmjs.com/package/xmldom
            // NOTE 2: Code to parse the HTML is taken from webscan.js/parseWT()
            if (bFirstHTTPResponse) {
                bFirstHTTPResponse = false;
                // Add URLs that we need to follow to determine channel names
                var doc = new DOMParser().parseFromString(body);
                var x = doc.getElementsByTagName('a');
                for (var i=1; i<x.length; i++) {		// skip the [Up one level] link
                    var opt = x.item(i).textContent;	// not .text
                    if (opt == '_Log/') continue;		// skip log text chans
                    if (endsWith(opt,"/")) {
                        // Here's another source for which we need to get a list of channels
                        var nextSourceName = pathI + "/" + opt;
                        // console.log('Another source to follow: <' + nextSourceName + '>');
                        httpRequestQueue.push(nextSourceName);
                    }
                }
                // If we have URLs to process, do so now
                if (httpRequestQueue.length == 0) {
                    console.log('\nThe given CT does not contain any channels');
                } else {
                    var nextURL = httpRequestQueue.shift();
                    getCTChanInfo(nextURL);  // recursive call
                }
            } else {
                // Extract channel name(s)
                var doc = new DOMParser().parseFromString(body);
                var x = doc.getElementsByTagName('a');
                for(var i=1; i<x.length; i++) {         // skip the [Up one level] link
                    var opt = x.item(i).textContent;	// not .text
                    if(opt == '_Log/') continue;		// skip log text chans
                    if (endsWith(opt,"/")) {
                        console.log('\nERROR: we should not be getting another source at this level; path = ' + pathI);
                        continue;
                    }
                    var fullchan = pathI+opt;
                    // console.log('Got another channel: <' + fullchan + '>');
                    // Take off "/CT/" prefix
                    fullchan = fullchan.substring(4);
                    // Replace "/" with double-underscores in channel names; this is so the channel name can be used
                    // as an array index.  See the note at the top of cloudturbine.js.
                    fullchan = fullchan.replace( /\//g, "__" );
                    // Determine the data type from the channel suffix
                    var chanFormat = determineChannelFormat(fullchan);
                    var chan_metadata = defineChanMetadata(fullchan, chanFormat);
                    ctChannels.push(chan_metadata);
                }
                // Are there any other URLs to process?
                if (httpRequestQueue.length == 0) {
                    // we're done
                    console.log('\nCT channel information:');
                    for (var i=0; i<ctChannels.length; ++i) {
                        console.log('\t' + ctChannels[i].name + ', ' + ctChannels[i].format);
                    }
                    startServers();
                } else {
                    var nextURL = httpRequestQueue.shift();
                    getCTChanInfo(nextURL);  // recursive call
                }
            }
        });
    }).on('error', function(err) {
        // handle errors with the request itself
        console.error('getCTChanInfo(): Error with the request:', err.message);
    });
}

/**
 * Utility function copied from webscan.js
 * @param str           the string to search
 * @param suffix        does str end with this suffix string?
 * @returns {boolean}
 */
function endsWith(str, suffix) {
    return str.indexOf(suffix, str.length - suffix.length) !== -1;
}

/**
 * Infer the channel data type by looking at the channel name extension.  This data type string
 * is used in the channel metadata structure which is passed to the browser/client side app.
 *
 * Channel data type mapping
 * For CT data types, see http://www.cloudturbine.com/structure/
 * Open MCT formats are one of "integer", "float", "string", "image"
 * File suffix        CT data type                   Open MCT format
 * --------------------------------------------------------------------
 * .f32               32bit floating point           float
 * .f64               64bit floating point           float
 * .i16               16bit integer                  integer
 * .i32               32bit integer                  integer
 * .i64               64bit integer                  integer
 * .csv (default)     comma separated values         float
 * .pcm               audio data (header-less)       integer
 * .wav               audio data (WAV header)        float (the raw data is integer, but we convert to a float in the range -1 to +1)
 * .txt               text (8bit ASCII)              string
 * .jpg               JPEG image                     image
 *
 * @param nameI channel name
 * @return channel data format type
 */
function determineChannelFormat(nameI) {
    var lastDotIdx = nameI.lastIndexOf(".");
    if ( (lastDotIdx == -1) || (lastDotIdx == (nameI.length-1)) ) {
        // There is no file extension, assume float
        return 'float';
    }
    var chanSuffix = nameI.substring(lastDotIdx+1);
    switch (chanSuffix) {
        case 'f32':
            return 'float';
        case 'f64':
            return 'float';
        case 'i16':
            return 'integer';
        case 'i32':
            return 'integer';
        case 'i64':
            return 'integer';
        case 'csv':
            return 'float';
        case 'pcm':
            return 'integer';
        case 'wav':
            return 'float';
        case 'txt':
            return 'string';
        case 'jpg':
            return 'image';
        default:
            console.log('determineChannelFormat(): unknown suffix for channel ' + nameI + '; assume float format.');
            return 'float';
    }
}

/**
 * Create a new channel metadata structure.
 * @param nameI     Channel name
 * @param formatI   Type of data this channel holds
 * @returns a new channel metadata structure
 */
function defineChanMetadata(nameI, formatI) {
    var chan_metadata = {
        "name": nameI,
        "format": formatI
    };
    return chan_metadata;
}
