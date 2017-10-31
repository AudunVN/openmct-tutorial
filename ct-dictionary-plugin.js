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
 * This is based on dictionary-plugin.js from openmct-tutorial.
 * Modified in a couple ways: (1) Add code comments; (2) Fetch CT metadata
 * from the history server instead of from a file.
 **/

function getCTDictionary() {
    // Get the static file containing metadata
    // return http.get('/ct-dictionary.json')
    //     .then(function (result) {
    //         return result.data;
    //     });
    // Request CloudTurbine channel metadata via the history server
    var url = 'http://localhost:8091/telemetry/ct_chan_metadata';
    return http.get(url)
        .then(function (result) {
            // console.log('\ngetCTDictionary(): result:\n' + result.data);
            return result.data;
        });
}

// An object provider builds Domain Objects
var ct_objectProvider = {
    get: function (identifier) {
        return getCTDictionary().then(function (dictionary) {
            console.log("ct-dictionary-plugin.js: identifier.key = " + identifier.key);
            if (identifier.key === 'cloudturbine') {
                return {
                    identifier: identifier,
                    name: dictionary.name,
                    type: 'folder',
                    location: 'ROOT'
                };
            } else {
                var measurement = dictionary.measurements.filter(function (m) {
                    return m.key === identifier.key;
                })[0];
                return {
                    identifier: identifier,
                    name: measurement.name,
                    type: 'ct.telemetry',
                    telemetry: {
                        values: measurement.values
                    },
                    location: 'ct.taxonomy:cloudturbine'
                };
            }
        });
    }
};

// The composition of a domain object is the list of objects it contains, as shown (for example) in the tree for browsing.
// Can be used to populate a hierarchy under a custom root-level object based on the contents of a telemetry dictionary.
// "appliesTo"  returns a boolean value indicating whether this composition provider applies to the given object
// "load" returns an array of Identifier objects (like the channels this telemetry stream offers)
//     might be able to add new CT channels in the load function
var ct_compositionProvider = {
    appliesTo: function (domainObject) {
        return domainObject.identifier.namespace === 'ct.taxonomy' &&
            domainObject.type === 'folder';
    },
    load: function (domainObject) {
        return getCTDictionary()
            .then(function (dictionary) {
                return dictionary.measurements.map(function (m) {
                    return {
                        namespace: 'ct.taxonomy',
                        key: m.key
                    };
                });
            });
    }
};

function CTDictionaryPlugin() {
    return function install(openmct) {
        // The addRoot function takes an "object identifier" as an argument
        openmct.objects.addRoot({
            namespace: 'ct.taxonomy',
            key: 'cloudturbine'
        });

        openmct.objects.addProvider('ct.taxonomy', ct_objectProvider);

        openmct.composition.addProvider(ct_compositionProvider);

        openmct.types.addType('ct.telemetry', {
            name: 'CT Telemetry Point',
            description: 'CT telemetry point from our happy tutorial.',
            cssClass: 'icon-telemetry'
        });
    };
};
