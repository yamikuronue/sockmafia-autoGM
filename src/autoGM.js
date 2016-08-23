'use strict';
const debug = require('debug')('sockbot:mafia');
const SockMafia = require('sockmafia');
const Moment = require('moment');

let Forum, game;

let internals = {
    forum: Forum,
    game: game,
    scum: []
}
exports.internals = internals;


/**
 * Sockbot 3.0 Activation function
 * @returns {Promise} A promise that will resolve when the activation is complete
 */
exports.activate = function activate() {
    
}

exports.deactivate = function deactivate() {
    game = undefined;
    return Promise.resolve();
}


/**
 * Sockbot 3.0 Plugin function
 * @param  {Forum} forum  The forum provider's Forum class
 * @param  {Object} config The plugin-specific configuration
 * @returns {Object}        A temporary object representing this instance of the forum
 */
exports.plugin = function plugin(forum, config) {
    Forum = forum;
    
    return {
		activate: exports.activate,
		deactivate: () => exports.deactivate
	};
}

exports.setTimer = function setTimer(expires, callback) {
    
}


exports.init = function() {
    //TODO: Create thread
    const threadID = 12345;
    const thread = internals.forum.Topic.get(threadID);
    
    return thread.watch().then(() => {
        internals.game = SockMafia.internals.dao.createGame(threadID);
        return internals.forum.Post.reply(threadID, undefined, 'Signups are now open!\n To join the game, please type `!join`.');
    })
    .then(() => exports.setTimer(Moment().add(48, 'hours'), exports.startGame));
    
      
}

exports.startGame = function() {
    if (internals.game.livePlayers.length > 0) {
        return internals.game.newDay()
            .then(() => internals.forum.Post.reply(internals.game.topicID, undefined, 'Let the game begin!'))
            .then(() => exports.setTimer(Moment().add(72, 'hours'), exports.onDayEnd));
    } else {
        return exports.deactivate();
    }
}


exports.onNightEnd = function() {
    
}

exports.onDayEnd = function() {
    
}

exports.onLynch = function() {
    
}

exports.onNightEnd = function() {
    
}

exports.checkWin = function() {
    
}

exports.endGame = function() {
    
}