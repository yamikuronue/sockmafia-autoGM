'use strict';
const debug = require('debug')('sockbot:mafia');
const SockMafia = require('sockmafia');
const Moment = require('moment');

let Forum, game;

let internals = {
    forum: Forum,
    game: game,
    scum: [],
    myName: '',
    timer: {
        nextAlert: undefined,
        callback: undefined,
        handle: undefined
    }
}
exports.internals = internals;


/**
 * Sockbot 3.0 Activation function
 * @returns {Promise} A promise that will resolve when the activation is complete
 */
exports.activate = function activate() {
    internals.timer.handle = setInterval(timer, 10);
}

exports.deactivate = function deactivate() {
    internals.game = undefined;
    clearInterval(internals.timer.handle);
    return Promise.resolve();
}


/**
 * Sockbot 3.0 Plugin function
 * @param  {Forum} forum  The forum provider's Forum class
 * @param  {Object} config The plugin-specific configuration
 * @returns {Object}        A temporary object representing this instance of the forum
 */
exports.plugin = function plugin(forum, config) {
    internals.forum = forum;
    
    return {
		activate: exports.activate,
		deactivate: () => exports.deactivate
	};
}

exports.setTimer = function setTimer(expires, callback) {
    internals.timer.callback = callback;
    internals.timer.nextAlert = expires;
    return Promise.resolve();
}

function timer() {
    if (internals.timer.nextAlert && Moment().isSameOrAfter(internals.timer.nextAlert)) {
        internals.timer.nextAlert = undefined;
        internals.timer.callback();
    }
}


exports.init = function() {
    //TODO: Create thread
    const threadID = 12345;
    const thread = internals.forum.Topic.get(threadID);
    
    return thread.watch()
        .then(() => SockMafia.internals.dao.createGame(threadID))
        .then((g) => {
            internals.game = g;
        })
        .then(() => internals.game.addModerator(internals.myName))
        .then(() => internals.forum.Post.reply(threadID, undefined, 'Signups are now open!\n To join the game, please type `!join`.'))
        .then(() => exports.setTimer(Moment().add(48, 'hours'), exports.startGame));
}

exports.startGame = function() {
    let players = internals.game.livePlayers;
    
    if (players.length > 5) {
        //Pick scum
        internals.scum.push(players[0].username);
        internals.scum.push(players[1].username);
        
        if (players.length > 7) {
            internals.scum.push(players[2].username);
        }
        
        if (players.length > 10) {
            internals.scum.push(players[3].username);
        }
        
        return internals.game.newDay()
            .then(() => internals.forum.Post.reply(internals.game.topicID, undefined, 'Let the game begin!'))
            .then(() => exports.setTimer(Moment().add(72, 'hours'), exports.onDayEnd));
    } else {
        return exports.deactivate();
    }
}


exports.onDayEnd = function() {
    return internals.game.nextPhase()
    .then(() => internals.forum.Post.reply(internals.game.topicID, undefined, 'It is now night'))
    .then(() => exports.setTimer(Moment().add(24, 'hours'), exports.onNightEnd));
}

exports.onLynch = function() {
    const won = exports.checkWin();
    
    if (won) {
        return internals.forum.Post.reply(internals.game.topicID, undefined, 'The game is over! ' + won + ' won!')
            .then(() => exports.deactivate());
    } else {
        return exports.onDayEnd();
    }
}

exports.onNightEnd = function() {
    const won = exports.checkWin();
    
    if (won) {
        return internals.forum.Post.reply(internals.game.topicID, undefined, 'The game is over! ' + won + ' won!')
            .then(() => exports.deactivate());
    } else {
        return internals.game.newDay()
        .then(() => internals.forum.Post.reply(internals.game.topicID, undefined, 'It is now day'))
        .then(() => exports.setTimer(Moment().add(72, 'hours'), exports.onNightEnd));
    }
}

exports.checkWin = function() {
    let scum = 0; 
    let town = 0;

    let players = internals.game.livePlayers;
    for (let i = 0; i < players.length; i++ ) {
        if (internals.scum.indexOf(players[i].username) > -1) {
            scum++;
        } else {
            town++;
        }
    }
    
    if (scum >= town) {
        return 'Scum';
    }
    
    if (scum === 0) {
        return 'Town';
    }
    
    return false;
}