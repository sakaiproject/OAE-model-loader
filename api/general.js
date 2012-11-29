/*
 * Copyright 2012 Sakai Foundation (SF) Licensed under the
 * Educational Community License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License. You may
 * obtain a copy of the License at
 * 
 *     http://www.osedu.org/licenses/ECL-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an "AS IS"
 * BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express
 * or implied. See the License for the specific language governing
 * permissions and limitations under the License.
 */

///////////////////////////
// GENERIC API FUNCTIONS //
///////////////////////////

// Generator object
Generators = require('gen');

// File reader
var fs = require('fs');
var mime = require('mime');
var util = require('util');


exports.loadFileIntoArray = function(filename) {
    var content = fs.readFileSync(filename, 'utf8');
    var finallines = [];
    var lines = content.split('\n');
    for (var i = 0; i < lines.length; i++) {
        lines[i] = lines[i].replace(/\r/g, '');
        if (lines[i]) {
            finallines.push(lines[i]);
        }
    }
    return finallines;
};

exports.loadJSONFileIntoObject = function(filename) {
    var items = exports.loadFileIntoArray(filename);
    var finalitems = {};
    for (var i = 0; i < items.length; i++) {
        var item = JSON.parse(items[i]);
        finalitems[item.id] = item;
    }
    return finalitems;
};

exports.writeFile = function(filename, content) {
    try {
        fs.unlinkSync(filename);
    } catch (err) {}
    fs.writeFileSync(filename, content, 'utf8');
};

exports.writeObjectToFile = function(filename, object) {
    try {
        fs.unlinkSync(filename);
    } catch (err) {}
    var finalArray = [];
    for (var i in object) {
        finalArray.push(JSON.stringify(object[i])); 
    }
    fs.writeFileSync(filename, finalArray.join('\n'), 'utf8');
};

// Folder specific functions
exports.folderExists = function(path) {
    return fs.existsSync(path);
};

exports.createFolder = function(path) {
    if (!exports.folderExists(path)) {
        fs.mkdirSync(path);
    };
};

// List files in a folder
exports.getFileListForFolder = function(foldername) {
    var files = fs.readdirSync(foldername);
    return files;
};

exports.removeFilesInFolder = function(foldername) {
    var files = exports.getFileListForFolder(foldername);
    for (var f = 0; f < files.length; f++) {
        fs.unlinkSync(foldername + '/' + files[f]);
    }
};

// Randomize function
// Pass this something along the lines of [[0.5, 'M'],[0.5, 'F']]
exports.randomize = function(_mapfunc) {
    // Make a copy of the array
    var mapFuncLength = _mapfunc.length;
    var mapfunc = [];
    // Make it a Cummulative Density Function
    for (var i = 0; i < mapFuncLength; i++) {
        mapfunc[i] = [_mapfunc[i][0], _mapfunc[i][1]];
        if (i !== 0) {
            mapfunc[i][0] = mapfunc[i -1][0] + mapfunc[i][0];
        }
    }
    
    // Select the randoms
    var random = Math.random() * mapfunc[mapFuncLength - 1][0];
        
    // Return the selected one
    for (var j = 0; j < mapFuncLength; j++) {
        if (random <= mapfunc[j][0]) {
            return mapfunc[j][1];
        }
    }
};

// Calculate a value given an average, standard deviation and maximum
exports.ASM = function(vars) {
    var average = vars[0]; var sdev = vars[1]; var minimum = vars[2]; var maximum = vars[3];
    var outlier = exports.randomize([[0.02, true], [0.98, false]]);
    if (outlier) {
        // Generate an outlier
        return Math.round(Math.random() * (maximum - average) + average);
    } else {
        // Generate a number from a gaussian distribution
        var G = (Math.random()*2-1)+(Math.random()*2-1)+(Math.random()*2-1);
        var R = Math.round(G*sdev+average);
        if (R < minimum) {
            R = minimum;
        } else if (R > maximum) {
            R = maximum;
        }
        return R;
    }
};

/////////////////
// API RELATED //
/////////////////

var http = require('http');
var querystring = require('querystring');
var url = require('url');
var telemetry = require('./telemetry.js').Telemetry;

var cookies = {};

exports.requests = 0;
exports.errors = [];
exports.urlReq = function(reqUrl, options, cb) {
    if(typeof options === 'function') { cb = options; options = {}; }// incase no options passed in
    
    // parse url to chunks
    reqUrl = url.parse(reqUrl);

    // Check if we need to log the user in first
    if (options.auth) {
        if (!cookies[options.auth.userid]) {
            // Log in the user first
            var requestStart = new Date().getTime();
            exports.urlReq(reqUrl.protocol + '//' + reqUrl.host + '/api/auth/login', {
                method: 'POST',
                params: {'username': options.auth.userid, 'password': options.auth.password}
            }, function(body, success, res) {
                cookies[options.auth.userid] = res.headers['set-cookie'][0].split(';')[0];
                var requestEnd = new Date().getTime();
                telemetry('Login', requestEnd - requestStart);
                finishUrlReq(reqUrl, options, cb);
            });
        } else {
            finishUrlReq(reqUrl, options, cb);
        }
    } else {
        finishUrlReq(reqUrl, options, cb);
    }
}

var finishUrlReq = function(reqUrl, options, cb) {
    var requestStart = new Date().getTime();
    // http.request settings
    var settings = {
        host: reqUrl.hostname,
        port: reqUrl.port || 80,
        path: reqUrl.pathname,
        headers: options.headers || {},
        method: options.method || 'GET'
    };

    settings.headers['Referer'] = reqUrl.protocol + '//' + reqUrl.host + '/test';
    // Check if there already is a cookie for this user
    settings.headers['Host'] = reqUrl.host;
    if (options.auth) {
        settings.headers['Cookie'] = cookies[options.auth.userid];
    }

    // if there are params:
    if(options.params) {
        options.params = querystring.stringify(options.params);
        if (settings.method === 'GET') {
            settings.path += '?' + options.params;
        } else if (settings.method === 'POST') {
            settings.headers['Content-Type'] = 'application/x-www-form-urlencoded';
            settings.headers['Content-Length'] = options.params.length;
        }
    }

    // MAKE THE REQUEST
    var req = http.request(settings);

    // if there are params: write them to the request
    if(options.params && settings.method === 'POST') { req.write(options.params); }

    // when the response comes back
    req.on('response', function(res) {
        res.body = '';
        res.setEncoding('utf-8');

        // concat chunks
        res.on('data', function(chunk) { res.body += chunk; });

        // when the response has finished
        res.on('end', function() {
            
            // fire callback
            exports.requests++;
            if (options.telemetry) {
                var requestEnd = new Date().getTime();
                telemetry(options.telemetry, requestEnd - requestStart);
            }
            if (res.statusCode === 500 || res.statusCode === 400 || res.statusCode === 401 || res.statusCode === 403) {
                if (!options.ignoreFail) {
                    exports.errors.push({
                        'settings': settings,
                        'response': res.body
                    });
                    console.log(res.body);
                }
                cb(res.body, false, res);
            } else {
                cb(res.body, true, res);
            }
        });
    });

    // end the request
    req.end();
};

exports.filePost = function(reqUrl, file, name, options, cb) {
    // parse url to chunks
    reqUrl = url.parse(reqUrl);

    // Check if we need to log the user in first
    if (options.auth) {
        if (!cookies[options.auth.userid]) {
            // Log in the user first
            var requestStart = new Date().getTime();
            exports.urlReq(reqUrl.protocol + '//' + reqUrl.host + '/api/auth/login', {
                method: 'POST',
                params: {'username': options.auth.userid, 'password': options.auth.password}
            }, function(body, success, res) {
                cookies[options.auth.userid] = res.headers['set-cookie'][0].split(';')[0];
                var requestEnd = new Date().getTime();
                telemetry('Login', requestEnd - requestStart);
                finishFilePost(reqUrl, file, name, options, cb);
            });
        } else {
            finishFilePost(reqUrl, file, name, options, cb);
        }
    } else {
        finishFilePost(reqUrl, file, name, options, cb);
    }
};

var finishFilePost = function(reqUrl, file, name, options, cb) {
    if(typeof options === "function"){ cb = options; options = {}; }// incase no options passed in

    var lf = "\r\n";

    var boundary = "----Boundary" + Math.round(Math.random() * 1000000000000);
    var post_data = [];
    for (var param in options.params) {
        var header = util.format('Content-Disposition: form-data; name="%s"' + lf + lf, param);
        post_data.push(new Buffer(boundary + lf, 'ascii'));
        post_data.push(new Buffer(header, 'ascii'));
        post_data.push(new Buffer(options.params[param] + lf, 'utf8'));
    }

    // Add the filebody.
    var fileBody = fs.readFileSync(file);
    var contentType = mime.lookup(file);
    var fileBodyHeader = '';
    fileBodyHeader += util.format('Content-Disposition: form-data; name="file"; filename="%s"' + lf, name);
    fileBodyHeader += util.format('Content-Type: %s' + lf + lf, contentType);
    post_data.push(new Buffer(boundary + lf, 'ascii'));
    post_data.push(new Buffer(fileBodyHeader, 'ascii'));
    post_data.push(new Buffer(fileBody + lf, 'utf8'));
    post_data.push(new Buffer(boundary + '--' + lf, 'ascii'));


    // Determine the length of this request so we can pass it in the Content-Length header.
    var length = 0;
    for(var i = 0; i < post_data.length; i++) {
        length += post_data[i].length;
    }

    // parse url to chunks
    reqUrl = url.parse(reqUrl);

    // http.request settings
    var settings = {
        'host': reqUrl.hostname,
        'port': reqUrl.port || 80,
        'path': reqUrl.pathname,
        'headers': options.headers || {},
        'method': 'POST'
    };

    settings.headers['Host'] = reqUrl.host;
    if (options.auth) {
        settings.headers['Cookie'] = cookies[options.auth.userid];
    }
    settings.headers['Content-Type'] = 'multipart/form-data; boundary=' + boundary.substr(2);
    settings.headers['Content-Length'] = length;

    // MAKE THE REQUEST
    var req = http.request(settings);
    for (var k = 0; k < post_data.length; k++) {
        req.write(post_data[k]);
    }

    // when the response comes back
    req.on('response', function(res){
        res.body = '';
        res.setEncoding('utf-8');

        // concat chunks
        res.on('data', function(chunk){ res.body += chunk; });

        // when the response has finished
        res.on('end', function(){

            // fire callback
            exports.requests++;
            if (res.statusCode === 500 || res.statusCode === 400 || res.statusCode === 401 || res.statusCode === 403) {
                if (!options.ignoreFail){
                    console.log(res.body);
                    exports.errors++;
                }
                cb(res.body, false, res);
            } else {
                cb(res.body, true, res);
            }
        });
    });

    // end the request
    req.end();
};

////////////////
// LOAD NAMES //
////////////////

var maleFirstNames = exports.loadFileIntoArray('./data/male.first.txt');
var femaleFirstNames = exports.loadFileIntoArray('./data/female.first.txt');
var lastNames = exports.loadFileIntoArray('./data/all.last.txt');

////////////////
// LOAD FILES //
////////////////

var cities = exports.loadFileIntoArray('./data/cities.txt');
var randomUrls = exports.loadFileIntoArray('./data/urls/random.txt');
var youtubeUrls = exports.loadFileIntoArray('./data/urls/youtube.txt');

////////////////
// LOAD WORDS //
////////////////

var verbs = exports.loadFileIntoArray('./data/verbs.txt');
var nouns = exports.loadFileIntoArray('./data/nouns.txt');
var keywords = exports.loadFileIntoArray('./data/keywords.txt');
Generators.english.prototype.NOUN = Generators.english.words(nouns);
Generators.english.prototype.VERBAS = Generators.english.words(verbs);

//////////////////////////
// USER DATA GENERATION //
//////////////////////////

exports.generateSentence = function(total) {
    if (!total || total === 1) {
        return Generators.english.sentence();
    }
    var sentences = [];
    for (var i = 0; i < total; i++) {
        sentences.push(Generators.english.sentence());
    }
    return sentences.join(' ');
};

exports.generateParagraph = function(total) {
    if (!total || total === 1) {
        return Generators.english.paragraph();
    } else {
        return Generators.english.paragraphs(total);
    }
};

exports.generateFirstName = function(sex) {
    if (!sex) {
        sex = exports.randomize([[0.5, 'M'],[0.5, 'F']]);
    }
    var firstName = '';
    if (sex === 'M') {
        firstName = maleFirstNames[Math.floor(Math.random() * maleFirstNames.length)].toLowerCase();
    } else if (sex === 'F') {
        firstName = femaleFirstNames[Math.floor(Math.random() * femaleFirstNames.length)].toLowerCase();
    }
    return firstName[0].toUpperCase() + firstName.substring(1);
};

exports.generateLastName = function() {
    var lastName = lastNames[Math.floor(Math.random() * lastNames.length)].toLowerCase();
    return lastName[0].toUpperCase() + lastName.substring(1);
};

exports.generateName = function(sex) {
    return exports.generateFirstName(sex) + ' ' + exports.generateLastName();
};

exports.generateId = function(batchid, seed) {
    return 'batch' + batchid + '-' + (seed.join('-').toLowerCase()) + '-' + Math.round(Math.random() * 1000);
};

exports.generateEmail = function(seed) {
    var domains = ['googlemail.com', 'hotmail.com', 'gmail.com', 'cam.ac.uk', 'yahoo.com'];
    return seed.join('_').toLowerCase() + '@' + domains[Math.floor(Math.random() * domains.length)];
};

exports.generatePassword = function() {
    var passwords = exports.loadFileIntoArray('./data/passwords.txt');
    return passwords[Math.floor(Math.random() * passwords.length)];
};

exports.generateKeywords = function(total) {
    var toReturn = [];
    for (var i = 0; i < total; i++) {
        // 50% is from a dedicated keywords list, 50% is from the noun list
        var fromDedicated = exports.randomize([[0.5, true], [0.5, false]]);
        if (fromDedicated) {
            toReturn.push(keywords[Math.floor(Math.random() * keywords.length)]);
        } else {
            toReturn.push(nouns[Math.floor(Math.random() * nouns.length)]);
        }
    }
    return toReturn;
};

exports.generateDepartment = function() {
    var departments = exports.loadFileIntoArray('./data/departments.txt');
    return departments[Math.floor(Math.random() * departments.length)];
};

exports.generateCollege = function() {
    var colleges = exports.loadFileIntoArray('./data/colleges.txt');
    return colleges[Math.floor(Math.random() * colleges.length)];
};

exports.generateCity = function() {
    return cities[Math.floor(Math.random() * cities.length)];
};

exports.generateUrl = function(type) {
    if (type === 'youtube') {
        return youtubeUrls[Math.floor(Math.random() * youtubeUrls.length)];
    } else {
        return randomUrls[Math.floor(Math.random() * randomUrls.length)];
    }
};

