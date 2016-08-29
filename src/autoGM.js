'use strict';
const debug = require('debug')('sockbot:mafia:autoGM');
const SockMafia = require('sockmafia');
const Moment = require('moment');
const fs = require('fs');
const rimrafPromise = require('rimraf-promise');

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
    category: 22,
    phases: {
        init: '48 hours',
        day: '72 hours',
        night: '24 hours'
    }
};

/**
 * Sockbot 3.0 Activation function
 * @returns {Promise} A promise that will resolve when the activation is complete
 */
exports.activate = function activate() {
    debug('Activating');
    internals.timer.handle = setInterval(timer, 10);
    internals.forum.on('mafia:playerLynched', exports.onLynch);
    return exports.init();
};

exports.deactivate = function deactivate() {
    debug('Deactivating');
    internals.forum.removeListener('mafia:playerLynched', exports.onLynch);
    clearInterval(internals.timer.handle);
    return Promise.resolve();
};

function endGame() {
    internals.game = undefined;
    return rimrafPromise('autoGMdata');
}


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
    debug('Setting timer for ' + expires);
    if (!Moment.isMoment(expires)) {
        const parts = expires.split(' ');
        expires = new Moment().add(parts[0], parts[1]);
    }
    internals.timer.callback = callback;
    internals.timer.nextAlert = expires;
    return exports.save();
};

exports.cancelTimer = function cancelTimer() {
    internals.timer.nextAlert = undefined;
    internals.timer.callback = undefined;
};

function timer() {
    if (internals.timer.nextAlert && Moment().isSameOrAfter(internals.timer.nextAlert)) {
        debug('Timer expired!');
        internals.timer.nextAlert = undefined;
        internals.timer.callback();
    }
}


exports.init = function() {
    debug('Initializing');
    
    return exports.load().then((result) => {
        if (result) {
            debug('Restored game in progress');
            return Promise.resolve();
        } else {
            return exports.createGame();
        }
    });
    
};

exports.createGame = function() {
    let threadID;
    const threadTitle = 'Auto-generated Mafia Game Thread';
    const threadOP = 'This is an automatic mafia thread. This will be the main game thread for the game';
    
    debug('Creating game');
    
    return internals.forum.Category.get(internals.config.category).then((category) => category.addTopic(threadTitle, threadOP))
        .then((thread) => {
            threadID = thread.id;
            return thread.watch();
        })
        .then(() => SockMafia.internals.dao.createGame(threadID, 'autoGame-' + threadID, false))
        .then((g) => {
            internals.game = g;
        })
        .then(() => internals.game.addModerator(internals.myName))
        .then(() => internals.forum.Post.reply(threadID, undefined, 'Signups are now open!\n To join the game, please type `!join`.\n The game will start in ' + internals.config.phases.init))
        .then(() => exports.setTimer(internals.config.phases.init, exports.startGame));
};

exports.sendRolecard = function(index, username) {
    let message, target;
    if (internals.scum.indexOf(username) > -1) {
        message = 'You are a Mafia Goon!\n' +
            'Every night, you and your companions may choose to kill one person.\n' +
            'You win when the number of Mafia Goons is equal to or greater than the number of Town players';
    } else {
        message = 'You are a Vanilla Town!\n' +
            'Your only ability is the daytime vote. Choose wisely!\n' +
            'You win when all Mafia Goons are dead.';
    }

    return new Promise( (resolve) => {
            //Insert a delay to stop them from all firing off at once
            setTimeout(resolve, 1000 * index);
        })
        .then(() => internals.forum.User.getByName(username))
        .then((t) => {
            target = t;
            return internals.forum.Chat.create(target, message, 'Auto-generated Mafia Role Card');
        })
        .then((chatroom) => {
            internals.game.addChat(chatroom.id);
            return Promise.resolve(target);
        });
};

exports.startGame = function startGame() {
    debug('Running game start routine');
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
        const scumUsers = [];
        for (let i = 0; i < players.length; i++) {
            const promise = exports.sendRolecard(i, players[i].username).then((target) => {
                if (internals.scum.indexOf(players[i].username)) {
                    scumUsers.push(target);
                }
            });
            rolePromises.push(promise);
        }
        
        return Promise.all(rolePromises)
            .then(() => internals.game.setActive())
            .then(() => internals.game.newDay())
            .then(() => {
                //Scum chat
                return internals.forum.Chat.create(scumUsers, 'This is the Scum Talk thread. You may talk in this thread at any time.',
                                                'Auto-generated Mafia Scum Talk');
            })
            .then((chatroom) => internals.game.addChat(chatroom.id))
            .then(() => internals.forum.Post.reply(internals.game.topicId, undefined, 'Let the game begin! It is now day. The day will end in ' + internals.config.phases.day))
            .then(() => exports.setTimer(internals.config.phases.day, exports.onDayEnd))
            .catch((err) => {
                return internals.forum.Post.reply(internals.game.topicId, undefined, ':wtf: Sorry folks, I need to cancel this one; I\'ve hit an error. \n Error was: ' + err)
                    .then(() => internals.forum.Post.reply(internals.game.topicId, undefined, err.stack))
                    .then(() => internals.game.setInactive())
                    .then(() => exports.deactivate());
            });
    } else {
        debug('Cancelling game in ' + internals.game.topicId);
        return internals.forum.Post.reply(internals.game.topicId, undefined, 'I\'m sorry, there were not enough players. Better luck next time!')
        .then(() => internals.game.setInactive())
        .then(()=> exports.deactivate());
    }
};


exports.onDayEnd = function onDayEnd() {
    debug('running Day End routine');
    return internals.game.nextPhase()
    .then(() => internals.forum.Post.reply(internals.game.topicId, undefined, 'It is now night. Night will end in ' + internals.config.phases.night))
    .then(() => exports.setTimer(internals.config.phases.night, exports.onNightEnd));
};

exports.onLynch = function() {
    debug('running Lynch routine');
    exports.cancelTimer();
    const won = exports.checkWin();
    
    if (won) {
        return internals.forum.Post.reply(internals.game.topicId, undefined, 'The game is over! ' + won + ' won!')
            .then(() => endGame())
            .then(() => exports.deactivate());
    } else {
        return exports.onDayEnd();
    }
};

exports.onNightEnd = function onNightEnd() {
    debug('running Night End routine');
    const action = internals.game.getActionOfType('target', null, 'scum', null, false);
	
	if (action) {
        //Kill the scum's pick
        internals.game.killPlayer(action.target);
	}
				
    const won = exports.checkWin();
    
    if (won) {
        return internals.forum.Post.reply(internals.game.topicId, undefined, 'The game is over! ' + won + ' won!')
            .then(() => endGame())
            .then(() => exports.deactivate());
    } else {
        return internals.game.newDay()
        .then(() => internals.forum.Post.reply(internals.game.topicId, undefined, 'It is now day. Day will end in ' + internals.config.phases.day))
        .then(() => exports.setTimer(internals.config.phases.day, exports.onDayEnd));
    }
};

exports.checkWin = function() {
    debug('Checking for win');
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

exports.save = function() {
    const persistData = {
        scum: internals.scum,
        thread: internals.game.topicId,
        timer: { }
    };
    
    if (internals.timer.nextAlert && internals.timer.callback) {
        persistData.timer.nextAlert = internals.timer.nextAlert.toISOString();
        persistData.timer.callback = internals.timer.callback.name;
    }
    
    return new Promise((resolve) => {
        fs.writeFile('autoGMdata', JSON.stringify(persistData), 'utf8', resolve);
    });
};

exports.load = function() {
    return new Promise((resolve, reject) => {
        fs.readFile('autoGMdata', (err, d) => {
          if (err)  {
              if (err.code === 'ENOENT' ) {
                  resolve(false);
                  return;
              }
              reject(err);
              return;
          }
          let data;
          
          try {
            data = JSON.parse(d);
          } catch (e) {
              resolve(false);
              return;
          }
          
          if (data.scum) {
              internals.scum = data.scum;
              
              if (data.timer) {
                  internals.timer.nextAlert = Moment(data.timer.nextAlert, Moment.ISO_8601);
                  
                  if (data.timer.callback === 'startGame') {
                      internals.timer.callback = exports.startGame;
                  } else if (data.timer.callback === 'onDayEnd') {
                      internals.timer.callback = exports.onDayEnd;
                  } else if (data.timer.callback === 'onNightEnd') {
                      internals.timer.callback = exports.onNightEnd;
                  }
              }
              
               SockMafia.internals.dao.getGameByTopicId(data.thread).then((g) => {
                   internals.game = g;
                   resolve(true);
               }).catch((_) => {
                   resolve(true);
               });
          } else {
              resolve(false);
          }
        });
    });
};
