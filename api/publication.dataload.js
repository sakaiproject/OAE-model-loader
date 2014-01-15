/*
 * Copyright 2013 Apereo Foundation (AF) Licensed under the
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

var _ = require('underscore');

var general = require('./general.js');

exports.loadPublication = function(publication, users, SERVER_URL, callback) {
    // It doesn't really matter which user we use to create the publication
    var user = _.values(users)[0];
    createPublication(publication, user, SERVER_URL, function(body, success, res) {
        if (success) {
            try {
                // Get the generated content id and add it to the publication
                publication.originalid = publication.id;
                publication.id = publication.generatedid = JSON.parse(body).publication.id;
            } catch (ex) {
                console.log('Error parsing create publication HTTP response:');
                console.log(body);
                return callback(body, success, res);
            }

            // Link the OAE users
            var authors = publication.authors.slice();
            linkPublicationToUsers(publication, users, SERVER_URL, callback, authors);
        } else {
            callback(body, success, res);
        }
    });
};

var createPublication = function(publication, user, SERVER_URL, callback) {
    var authors = _.map(publication.authors, function(author) { return author.name; });
    general.urlReq(SERVER_URL + '/api/publications/create', {
        method: 'POST',
        auth: user,
        params: {
            'sourceIds': publication.sourceIds,
            'displayName': publication.displayName,
            'publicationType': publication.publicationType,
            'publisher': publication.publisher,
            'date': publication.date,
            'authors': authors,
            'issueNumber': publication.issueNumber,
            'pageBegin': publication.pageBegin,
            'pageEnd': publication.pageEnd
        }
    }, function(body, success, response) {
        if (!success && body.indexOf('administrator')) {
            console.log('Unable to create publication, have you enabled allowUserEntry in the admin UI?');
        }

        return callback(body, success, response);
    });
};

var linkPublicationToUsers = function(publication, users, SERVER_URL, callback, _authors) {
    if (_authors.length === 0) {
        return callback();
    }

    var author = _authors.pop();

    // In case it's a plain-text author
    if (!author.id) {
        return linkPublicationToUsers(publication, users, SERVER_URL, callback, _authors);
    }

    var authorName = author.name;
    var user = users[author.id];

    general.urlReq(SERVER_URL + '/api/publications/' + publication.id + '/link', {
        method: 'POST',
        auth: user,
        params: {
            'authorName': authorName,
            'userId': user.id
        }
    }, function(body, success, response) {
        if (!success && body.indexOf('administrator')) {
            console.log('Unable to link publication to a user, have you enabled allowUserEntry in the admin UI?');
        }

        return callback(body, success, response);
    });
};