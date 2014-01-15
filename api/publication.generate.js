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
var fs = require('fs');

var general = require('./general.js');
var messageGenerator = require('./message.generate.js');

////////////////////////////
// PUBLICATION PARAMETERS //
////////////////////////////

var DISTRIBUTIONS = {
    'SOURCEIDS': [1, 1, 1, 4],
    'PUBLISHER': [2, 2, 1, 25],
    'DATE': {
        'YEAR': [2005, 15, 1990, 2014],
        'MONTH': [6, 6, 0, 11],
        'DAY': [15, 15, 0, 31],
    },
    'NR_OF_AUTHORS': [2, 1, 0, 6],
    'OAE_AUTHORS_PER_PUBLICATION': [2, 1, 1, 6],
    'HAS_ISSUE_NUMBER': [[0.25, true], [0.75, false]],
    'HAS_PAGE_NUMBERS': [[0.80, true], [0.20, false]],
};

///////////////////////
// Publication Model //
///////////////////////

var publications = 0;

exports.Publication = function(batchid, users) {
    var that = {};

    publications++;

    that.id = general.generateId(batchid, [publications]).replace(/[^a-zA-Z 0-9]+/g,'-');

    that.sourceIds = generateSourceIds();

    that.displayName = general.generateSentence(1);
    that.displayName = that.displayName[0].toUpperCase() + that.displayName.substring(1);
    that.publicationType = getRandomPublicationType();
    that.publisher = general.generateKeywords(general.ASM(DISTRIBUTIONS.PUBLISHER)).join(' ') + ' Press';
    that.date = new Date(general.ASM([2005, 15, 1990, 2012]), 1, 1).getTime();

    var nrOfOAEAuthors = general.ASM(DISTRIBUTIONS.OAE_AUTHORS_PER_PUBLICATION);
    var nrOfNonOAEAuthors = general.ASM(DISTRIBUTIONS.NR_OF_AUTHORS) - nrOfOAEAuthors;

    that.authors = [ ];
    for (var i = 0; i < nrOfOAEAuthors; i++) {
        var author = getAuthor(users);
        that.authors.push({'name': author.displayName, 'id': author.id});
    }
    for (var i = 0; i < nrOfNonOAEAuthors; i++) {
        var author = general.generateLastName() + ' ' + general.generateFirstName()[0];
        that.authors.push({'name': author});
    }

    var hasIssueNumber = general.randomize(DISTRIBUTIONS.HAS_ISSUE_NUMBER);
    if (hasIssueNumber) {
        that.issueNumber = Math.floor(Math.random()*10000);
        var hasPageNumbers = general.randomize(DISTRIBUTIONS.HAS_PAGE_NUMBERS);
        that.pageBegin = Math.floor(Math.random()*300);
        that.pageEnd = that.pageBegin + 2 + Math.floor(Math.random() * 25);
    }


    return that;
};

var getAuthor = function(users) {
    var index = 0;

    var bucket = Math.floor(Math.random(0, 70));
    if (bucket <= 10) {
        index = Math.floor(Math.random() * users.length);
    } else if (bucket > 10 && bucket <= 30) {
        // Get an index in the 10% - 30% range
        index = Math.floor(10 * users.length/100) + Math.floor(Math.random() * (20 * users.length/100));
    } else if (bucket > 30) {
        // Get an index in the 30% - 70% range
        index = Math.floor(30 * users.length/100) + Math.floor(Math.random() * (40 * users.length/100));
    }

    return users[index];
};

/**
 * @return {String} A random publication type
 */
var getRandomPublicationType = function() {
    var types = ['artefact', 'book', 'chapter', 'composition', 'conference', 'dataset', 'design', 'exhibition', 'internet publication', 'journal article', 'other', 'patent', 'performance', 'poster', 'report', 'scholarly edition', 'software', 'thesis / dissertation', 'working paper'];
    return types[Math.floor(Math.random() * types.length)];
};

var generateSourceIds = function() {
    var sourceTypes = ['wos', 'wos-lite', 'mendeley', 'pubmed', 'arxiv'];
    var nrOfSourceIds = general.ASM(DISTRIBUTIONS.SOURCEIDS);
    var sources = [];
    for (var i = 0; i < nrOfSourceIds; i++) {
        var source = sourceTypes[Math.floor(Math.random() * sourceTypes.length)];
        source += '#' + Math.floor(Math.random()*100000);
        sources.push(source);
    }
    return sources;
};

