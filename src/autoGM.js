'use strict';
const debug = require('debug')('sockbot:mafia');
const SockMafia = require('sockmafia');
const Moment = require('moment');

let Forum, game;

const internals = {
    forum: Forum,
    game: game,
    scum: [],
    myName: '',
    timer: {
        nextAlert: undefined,
        callback: undefined,
        handle: undefined
    }
};
exports.internals = internals;

exports.defaultConfig = {
    phases: {
        init: 48,
        day: 72,
        night: 24
    }
};


/**
 * Sockbot 3.0 Activation function
 * @returns {Promise} A promise that will resolve when the activation is complete
 */
exports.activate = function activate() {
    internals.timer.handle = setInterval(timer, 10);
    internals.forum.on('mafia:playerLynched', exports.onLynch);
    return exports.init();
};

exports.deactivate = function deactivate() {
    internals.game = undefined;
    internals.forum.removeListener('mafia:playerLynched', exports.onLynch);
    clearInterval(internals.timer.handle);
    return Promise.resolve();
};


/**
 * Sockbot 3.0 Plugin function
 * @param  {Forum} forum  The forum provider's Forum class
 * @param  {Object} config The plugin-specific configuration
 * @returns {Object}        A temporary object representing this instance of the forum
 */
exports.plugin = function plugin(forum, config) {
    internals.forum = forum;
    internals.myName = forum.username;
    
    if (config === null || typeof config !== 'object') {
		config = {};
	}
	
	Object.keys(exports.defaultConfig).forEach((key) => {
		if (!config[key]) {
			config[key] = exports.defaultConfig[key];
		}
	});
    
    internals.config = config;
    return {
		activate: exports.activate,
		deactivate: exports.deactivate
	};
};

exports.setTimer = function setTimer(expires, callback) {
    internals.timer.callback = callback;
    internals.timer.nextAlert = expires;
    return Promise.resolve();
};

function timer() {
    if (internals.timer.nextAlert && Moment().isSameOrAfter(internals.timer.nextAlert)) {
        internals.timer.nextAlert = undefined;
        internals.timer.callback();
    }
}


exports.init = function() {
    //TODO: configurable category
    const cat = 22;
    let threadID;
    
    const threadTitle = 'Auto-generated Mafia Game Thread';
    const threadOP = 'This is an automatic mafia thread. This will be the main game thread for the game';
    
    //TODO: create scum chat
    
    return internals.forum.Category.get(cat).then((category) => category.addTopic(threadTitle, threadOP))
        .then((thread) => {
            threadID = thread.id;
            return thread.watch();
        })
        .then(() => SockMafia.internals.dao.createGame(threadID, 'autoGame-' + threadID, false))
        .then((g) => {
            internals.game = g;
        })
        .then(() => internals.game.addModerator(internals.myName))
        .then(() => internals.forum.Post.reply(threadID, undefined, 'Signups are now open!\n To join the game, please type `!join`.'))
        .then(() => exports.setTimer(Moment().add(internals.config.phases.init, 'hours'), exports.startGame));
};

exports.startGame = function() {
    const players = internals.game.livePlayers;
    
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
        
        //Send role cards
        const rolePromises = [];
        const mods = internals.game.moderators.map((mod) => mod.username);
        for (let i = 0; i < players.length; i++) {
            let message;
            if (internals.scum.indexOf(players[i].username)) {
                message = 'You are a Mafia Goon!\n' +
                    'Every night, you and your companions may choose to kill one person.\n' +
                    'You win when the number of Mafia Goons is equal to or greater than the number of Town players';
            } else {
                message = 'You are a Vanilla Town!\n' +
                    'Your only ability is the daytime vote. Choose wisely!\n' +
                    'You win when all Mafia Goons are dead.';
            }
            
           
            const targets = mods.concat(players[i].username);
            
            const promise = internals.forum.Chat.create(targets, message, 'Auto-generated Mafia Role Card')
                            .then((chatroom) => {
                                internals.game.addChat(chatroom.id);
                                return chatroom.send(message);
                            });
            rolePromises.push(promise);
        }
        
        return Promise.all(rolePromises).then(() => internals.game.newDay())
            .then(() => {
                //Scum chats
                const targets = internals.scum.concat(mods);
                return internals.forum.Chat.create(targets, 'This is the Scum Talk thread. You may talk in this thread at any time.', 
                                                'Auto-generated Mafia Scum Talk');
            })
            .then((chatroom) => internals.game.addChat(chatroom.id))
            .then(() => internals.forum.Post.reply(internals.game.topicID, undefined, 'Let the game begin!'))
            .then(() => exports.setTimer(Moment().add(internals.config.phases.day, 'hours'), exports.onDayEnd));
    } else {
        return exports.deactivate();
    }
};


exports.onDayEnd = function() {
    return internals.game.nextPhase()
    .then(() => internals.forum.Post.reply(internals.game.topicID, undefined, 'It is now night'))
    .then(() => exports.setTimer(Moment().add(internals.config.phases.night, 'hours'), exports.onNightEnd));
};

exports.onLynch = function() {
    const won = exports.checkWin();
    
    if (won) {
        return internals.forum.Post.reply(internals.game.topicID, undefined, 'The game is over! ' + won + ' won!')
            .then(() => exports.deactivate());
    } else {
        return exports.onDayEnd();
    }
};

exports.onNightEnd = function() {
    const action = internals.game.getActionOfType('target', null, 'scum', null, false);
	
	if (action) {
        //Kill the scum's pick
        internals.game.killPlayer(action.target);
	}
				
    const won = exports.checkWin();
    
    if (won) {
        return internals.forum.Post.reply(internals.game.topicID, undefined, 'The game is over! ' + won + ' won!')
            .then(() => exports.deactivate());
    } else {
        return internals.game.newDay()
        .then(() => internals.forum.Post.reply(internals.game.topicID, undefined, 'It is now day'))
        .then(() => exports.setTimer(Moment().add(internals.config.phases.day, 'hours'), exports.onNightEnd));
    }
};

exports.checkWin = function() {
    let scum = 0; 
    let town = 0;

    const players = internals.game.livePlayers;
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
};
