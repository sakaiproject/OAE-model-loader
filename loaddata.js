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

var argv = require('optimist')
    .usage('Usage: $0 -b 9 [-s 0] [-h "http://localhost:8080"] [-p admin] [-c 1] [-i 0]')

    .demand('b')
    .alias('b', 'end-batch')
    .describe('b', 'The last batch to load (exclusive, so "-s 0 -b 1" will only load the 0th batch)')

    .alias('s', 'start')
    .describe('s', 'The batch to start at (0-based, so the first batch is "0")')
    .default('s', 0)

    .alias('h', 'server-url')
    .describe('h', 'Server URL')
    .default('h', 'http://localhost:8080')

    .alias('p', 'admin-pw')
    .describe('p', 'Admin Password')
    .default('p', 'admin')

    .alias('c', 'concurrent-batches')
    .describe('c', 'Number of concurrent batches')
    .default('c', 1)

    .alias('i', 'test-batch-interval')
    .describe('i', 'Batch interval for test suites (0 for no test suites)')
    .default('i', 0)
    .argv;

var _ = require('underscore');

var telemetry = require('./api/telemetry.js');

var general = require('./api/general.js');
var userAPI = require('./api/user.dataload.js');
var groupAPI = require('./api/group.dataload.js');
var contentAPI = require('./api/content.dataload.js');
var discussionsAPI = require('./api/discussion.dataload.js');
var publicationAPI = require('./api/publication.dataload.js');
var runSuites = require('./run_suites.js');

//////////////////////////////////////
// OVERALL CONFIGURATION PARAMETERS //
//////////////////////////////////////

var SCRIPT_FOLDER = 'scripts';

var BATCHES = argv['end-batch'];
var SERVER_URL = argv['server-url'];
var ADMIN_PASSWORD = argv['admin-pw'];
var CONCURRENT_BATCHES = argv['concurrent-batches']
var RUN_SUITES = argv['test-batch-interval'];
if (RUN_SUITES) {
    runSuites.clearResults();
}

//////////////////////
// CLEAN PARAMETERS //
//////////////////////

// clear trailing slashes from server url
SERVER_URL = SERVER_URL.replace(/^(.*?)\/+$/, '$1');

////////////////////
// KICK OFF BATCH //
////////////////////

var currentBatch = argv.start - 1;
var batches = [];

// holds the mappings of local ids to server-generated ids
var idMappings = {
    'users': {},
    'groups': {},
    'content': {},
    'discussions': {},
    'publications': {}
};

console.time("Finished running data loader");

var loadNextBatch = function() {
    currentBatch++;

    idMappings['users'][currentBatch] = {};
    idMappings['groups'][currentBatch] = {};
    idMappings['content'][currentBatch] = {};
    idMappings['discussions'][currentBatch] = {};
    idMappings['publications'][currentBatch] = {};

    if (currentBatch < BATCHES) {
        console.log('Loading Batch ' + currentBatch);
        // Load the data from the model
        var users = general.loadJSONFileIntoObject('./scripts/users/' + currentBatch + '.txt');
        var groups = general.loadJSONFileIntoObject('./scripts/groups/' + currentBatch + '.txt');
        var content = general.loadJSONFileIntoObject('./scripts/content/' + currentBatch + '.txt');
        var discussions = general.loadJSONFileIntoObject('./scripts/discussions/' + currentBatch + '.txt');
        var publications = general.loadJSONFileIntoObject('./scripts/publications/' + currentBatch + '.txt');

        batches.push({
            'users': users,
            'groups': groups,
            'content': content,
            'discussions': discussions,
            'publications': publications
        });
        loadUsers(users, groups, content, discussions, publications, currentBatch);
    } else {
        finishedAllBatches();
    }
};

var finishBatch = function(currentBatch) {
    console.log('Finished Loading Batch ' + currentBatch);
    console.log('=================================');
    loadNextBatch();
};

var finishedAllBatches = function() {
    telemetry.stopTelemetry();
    console.timeEnd('Loading Batches');
    console.log('*****************************');
    if (general.errors.length) {
        console.log('Error details:');
        console.log(general.errors);
    }
    console.log('Requests made: ' + general.requests);
    console.log('Request errors: ' + general.errors.length);
    console.log('Finished generating ' + BATCHES + ' batches');
    console.timeEnd("Finished running data loader");
    console.log('*****************************');
};

var checkRunSuites = function(currentBatch) {
    if (RUN_SUITES && currentBatch % RUN_SUITES === 0) {
        // run the test suite before continuing
        runSuites.runSuites(batches, currentBatch - 1, SERVER_URL, finishBatch);
    } else {
        finishBatch(currentBatch);
    }
};

///////////
// USERS //
///////////

var loadUsers = function(users, groups, content, discussions, publications, currentBatch) {
    var currentUser = -1;
    var usersToLoad = _.values(users);
    var loadNextUser = function() {
        currentUser++;
        if (currentUser < usersToLoad.length) {
            var nextUser = usersToLoad[currentUser];
            userAPI.loadUser(nextUser, SERVER_URL, function() {
                if (!nextUser.originalid || !nextUser.generatedid) {
                    console.log('    Warning: User "%s" was not assigned a generated id.', nextUser.id);
                } else {
                    idMappings['users'][currentBatch][nextUser.originalid] = {
                        id: nextUser.originalid,
                        generatedId: nextUser.generatedid
                    };
                }

                loadNextUser();
            });
            if (currentUser % 10 === 0) {
                console.log('  ' + new Date().toUTCString() + ': Finished Loading User ' + currentUser + ' of ' + usersToLoad.length);
            }
        } else {
            general.writeObjectToFile('./scripts/generatedIds/users-' + currentBatch + '.txt', idMappings['users'][currentBatch]);
            console.log('  ' + new Date().toUTCString() + ': Finished Loading ' + usersToLoad.length + ' Users');
            return loadFollowing(users, groups, content, discussions, publications, currentBatch);
        }
    };
    loadNextUser();
};

var loadFollowing = function(users, groups, content, discussions, publications, currentBatch) {
    var currentUser = -1;
    var usersFollowingToLoad = _.values(users);
    var loadNextUserFollowing = function() {
        currentUser++;
        if (currentUser >= usersFollowingToLoad.length) {
            console.log('  ' + new Date().toUTCString() + ': Finished Loading Followers for ' + usersFollowingToLoad.length + ' Users');
            return loadPublications(users, groups, content, discussions, publications, currentBatch);
        }

        userAPI.loadFollowing(usersFollowingToLoad[currentUser], users, SERVER_URL, loadNextUserFollowing);
    };
    loadNextUserFollowing();
};

var loadPublications = function(users, groups, content, discussions, publications, currentBatch) {
    var currentPublication = -1;
    var publicationsToLoad = _.values(publications);
    var loadNextUserPublications = function() {
        currentPublication++;
        if (currentPublication < publicationsToLoad.length) {
            var publication = publicationsToLoad[currentPublication];

            publicationAPI.loadPublication(publication, users, SERVER_URL, function() {
                if (!publication.originalid || !publication.generatedid) {
                    console.log('    Warning: Publication "%s" was not assigned a generated id.', publication.id);
                } else {
                    idMappings['publications'][currentBatch][publication.originalid] = {
                        id: publication.originalid,
                        generatedId: publication.generatedid
                    };
                }
                if (currentPublication % 10 === 0) {
                    console.log('  ' + new Date().toUTCString() + ': Finished Loading Publication ' + currentPublication + ' of ' + publicationsToLoad.length);
                }
                if (currentPublication >= publicationsToLoad.length) {
                    return loadGroups(users, groups, content, discussions, currentBatch);
                }

                loadNextUserPublications();
            });
        } else {
            general.writeObjectToFile('./scripts/generatedIds/publications-' + currentBatch + '.txt', idMappings['publications'][currentBatch]);
            console.log('  ' + new Date().toUTCString() + ': Finished Loading ' + publicationsToLoad.length + ' Publications');
            return loadGroups(users, groups, content, discussions, currentBatch);
        }
    };
    loadNextUserPublications();
};

////////////
// GROUPS //
////////////

var loadGroups = function(users, groups, content, discussions, currentBatch) {
    var currentGroup = -1;
    var groupsToLoad = _.values(groups);
    var loadNextGroup = function() {
        currentGroup++;
        if (currentGroup < groupsToLoad.length) {
            var nextGroup = groupsToLoad[currentGroup];

            // convert all group membership ids to the generated user ids
            for (var role in nextGroup.roles) {
                nextGroup.roles[role].users = _.map(nextGroup.roles[role].users, function(originalUserId) {
                    if (idMappings['users'][currentBatch][originalUserId]) {
                        return idMappings['users'][currentBatch][originalUserId].generatedId;
                    } else {
                        console.log('    Warning: Could not map group membership for user "%s"', originalUserId);
                        return originalUserId;
                    }
                });
            }

            groupAPI.loadGroup(nextGroup, users, SERVER_URL, function() {
                if (!nextGroup.originalid || !nextGroup.generatedid) {
                    console.log('    Warning: User "%s" was not assigned a generated id.', nextGroup.id);
                } else {
                    idMappings['groups'][currentBatch][nextGroup.originalid] = {
                        id: nextGroup.originalid,
                        generatedId: nextGroup.generatedid
                    };
                }

                loadNextGroup();
            });
            if (currentGroup % 10 === 0) {
                console.log('  ' + new Date().toUTCString() + ': Finished Loading Group ' + currentGroup + ' of ' + groupsToLoad.length);
            }
        } else {
            general.writeObjectToFile('./scripts/generatedIds/groups-' + currentBatch + '.txt', idMappings['groups'][currentBatch]);
            console.log('  ' + new Date().toUTCString() + ': Finished Loading ' + groupsToLoad.length + ' Groups');
            loadGroupMemberships(users, groups, content, discussions, currentBatch);
        }
    };
    loadNextGroup();
};

var loadGroupMemberships = function(users, groups, content, discussions, currentBatch) {
    var currentGroupMembership = -1;
    var groupsToLoad = _.values(groups);
    var loadNextGroupMembership = function() {
        currentGroupMembership++;
        if (currentGroupMembership < groupsToLoad.length) {
            var nextGroup = groupsToLoad[currentGroupMembership];

            // Map the original group ids to the generated group ids
            nextGroup.roles.member.groups = _.map(nextGroup.roles.member.groups, function(originalGroupId) {
                return idMappings['groups'][currentBatch][originalGroupId].generatedId;
            });

            nextGroup.roles.manager.groups = _.map(nextGroup.roles.manager.groups, function(originalGroupId) {
                return idMappings['groups'][currentBatch][originalGroupId].generatedId;
            });

            groupAPI.loadGroupMembership(nextGroup, users, SERVER_URL, loadNextGroupMembership);
            if (currentGroupMembership % 10 === 0) {
                console.log('  ' + new Date().toUTCString() + ': Finished Loading Group Memberships ' + currentGroupMembership + ' of ' + groupsToLoad.length);
            }
        } else {
            console.log('  ' + new Date().toUTCString() + ': Finished Loading ' + groupsToLoad.length + 'Group Memberships');
            loadContent(users, groups, content, discussions, currentBatch);
        }
    };
    loadNextGroupMembership();
};

/////////////
// CONTENT //
/////////////

var loadContent = function(users, groups, content, discussions, currentBatch) {
    var currentContent = -1;
    var contentToLoad = _.values(content);
    var loadNextContent = function() {
        currentContent++;
        if (currentContent < contentToLoad.length) {
            var nextContent = contentToLoad[currentContent];

            // convert all content membership ids to the generated user ids
            for (var role in nextContent.roles) {
                nextContent.roles[role].users = _.map(nextContent.roles[role].users, function(originalUserId) {
                    if (idMappings['users'][currentBatch][originalUserId]) {
                        return idMappings['users'][currentBatch][originalUserId].generatedId;
                    } else {
                        console.log('    Warning: Could not map content membership for user "%s"', originalUserId);
                        return originalUserId;
                    }
                });
                nextContent.roles[role].groups = _.map(nextContent.roles[role].groups, function(originalGroupId) {
                    if (idMappings['groups'][currentBatch][originalGroupId]) {
                        return idMappings['groups'][currentBatch][originalGroupId].generatedId;
                    } else {
                        console.log('    Warning: Could not map content membership for user "%s"', originalGroupId);
                        return originalGroupId;
                    }
                });
            }

            contentAPI.loadContent(nextContent, users, groups, SERVER_URL, function() {
                idMappings['content'][currentBatch][nextContent.originalid] = {
                    id: nextContent.originalid,
                    generatedId: nextContent.generatedid
                };

                loadNextContent();
            });
            if (currentContent % 10 === 0) {
                console.log('  ' + new Date().toUTCString() + ': Finished Loading Content Item ' + currentContent + ' of ' + contentToLoad.length);
            }
        } else {

            general.writeObjectToFile('./scripts/generatedIds/content-' + currentBatch + '.txt', idMappings['content'][currentBatch]);

            console.log('  ' + new Date().toUTCString() + ': Finished Loading ' + contentToLoad.length + ' Content Items');
            loadDiscussions(users, groups, discussions, currentBatch);
        }
    };
    loadNextContent();
};

/////////////////
// DISCUSSIONS //
/////////////////

var loadDiscussions = function(users, groups, discussions, currentBatch) {
    var currentDiscussion = -1;
    var discussionsToLoad = _.values(discussions);
    var loadNextDiscussion = function() {
        currentDiscussion++;
        if (currentDiscussion < discussionsToLoad.length) {
            var nextDiscussion = discussionsToLoad[currentDiscussion];

            // convert all discussions membership ids to the generated user ids
            for (var role in nextDiscussion.roles) {
                nextDiscussion.roles[role].users = _.map(nextDiscussion.roles[role].users, function(originalUserId) {
                    if (idMappings['users'][currentBatch][originalUserId]) {
                        return idMappings['users'][currentBatch][originalUserId].generatedId;
                    } else {
                        console.log('    Warning: Could not map discussions membership for user "%s"', originalUserId);
                        return originalUserId;
                    }
                });

                nextDiscussion.roles[role].groups = _.map(nextDiscussion.roles[role].groups, function(originalUserId) {
                    if (idMappings['groups'][currentBatch][originalUserId]) {
                        return idMappings['groups'][currentBatch][originalUserId].generatedId;
                    } else {
                        console.log('    Warning: Could not map discussions membership for group "%s"', originalUserId);
                        return originalUserId;
                    }
                });
            }

            discussionsAPI.loadDiscussion(nextDiscussion, users, groups, SERVER_URL, function() {
                idMappings['discussions'][currentBatch][nextDiscussion.originalid] = {
                    id: nextDiscussion.originalid,
                    generatedId: nextDiscussion.generatedid
                };

                loadNextDiscussion();
            });

            if (currentDiscussion % 10 === 0) {
                console.log('  ' + new Date().toUTCString() + ': Finished Loading Discussion ' + currentDiscussion + ' of ' + discussionsToLoad.length);
            }
        } else {

            general.writeObjectToFile('./scripts/generatedIds/discussions-' + currentBatch + '.txt', idMappings['discussions'][currentBatch]);

            console.log('  ' + new Date().toUTCString() + ': Finished Loading ' + discussionsToLoad.length + ' Discussions');
            checkRunSuites(currentBatch);
        }
    };
    loadNextDiscussion();
};

///////////
// START //
///////////

general.createFolder('./scripts/generatedIds');

console.time('Loading Batches');
telemetry.startTelemetry();

for (var b = 0; b < CONCURRENT_BATCHES; b++) {
    loadNextBatch();
}
