'use strict';
const debug = require('debug')('sockbot:mafia:autoGM');
const SockMafia = require('sockmafia');
const Moment = require('moment');
const fs = require('fs');
const rimrafPromise = require('rimraf-promise');
const flavorText = require('./flavor.json');
const Handlebars = require('handlebars');

const viewHelper = require('./viewHelper');

let Forum, game;

const internals = {
    mafia: undefined,
    forum: Forum,
    game: game,
    scum: [],
    myName: '',
    flavor: 'normal',
    timer: {
        nextAlert: undefined,
        callback: undefined,
        handle: undefined
    }
};
exports.internals = internals;

exports.defaultConfig = {
    category: 22,
    minPlayers: 6,
    phases: {
        init: '48 hours',
        day: '72 hours',
        night: '24 hours'
    },
    loop: false
};

/**
 * Sockbot 3.0 Activation function
 * @returns {Promise} A promise that will resolve when the activation is complete
 */
exports.activate = function activate() {
    debug('Activating');
    internals.timer.handle = setInterval(timer, 10);
    internals.forum.on('mafia:playerLynched', exports.onLynch);
    internals.mafia.activate();
    return exports.init();
};

exports.deactivate = function deactivate() {
    debug('Deactivating');
    internals.forum.removeListener('mafia:playerLynched', exports.onLynch);
    clearInterval(internals.timer.handle);
    return Promise.resolve();
};

exports.endGame = function endGame() {
    
    return internals.forum.Topic.get(internals.game.topicId)
    .then((topic) => topic.lock())
    .then(() => rimrafPromise('autoGMdata'))
    .then(() => {
        internals.game = undefined;
        if (internals.config.loop) {
            return exports.createGame();
        } else {
            return exports.deactivate();
        }
    });
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
		if (!(key in config)) {
			config[key] = exports.defaultConfig[key];
		}
	});
    
    internals.config = config;
    
    //Enforce absolute minimum
    if (internals.config.minPlayers < 2) {
        internals.config.minPlayers = 2;
    }
    
    //Handle locking not being supported
    if (config.lockThreads) {
        if (!forum.supports('Topics.Lock')) {
           // debug('Disabling lock feature due to lack of support');
            internals.config.lockThreads = false;
        }
    }
    
    //Set up dependency
    internals.mafia = SockMafia.plugin(forum, {});
    
    
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

function pickFlavor() {
    const flavors = Object.keys(flavorText);
    const numFlavors = flavors.length;
    internals.flavor = flavors[Math.floor(Math.random() * numFlavors)];
}

exports.createGame = function() {
    let threadID;
    const threadTitle = 'Auto-generated Mafia Game Thread';
    const threadOP = 'This is an automatic mafia thread. This will be the main game thread for the game';

    debug('Creating game');
        
    pickFlavor();
    debug('Flavor is: ' + internals.flavor);
    
    if (!SockMafia.internals.dao) {
        debug('ERROR! DAO ISSUE!');
        debug(SockMafia.internals);
    }
    
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
        .then(() => internals.forum.Post.reply(threadID, undefined, 'Signups are now open!\n To join the game, please type `!join`.\n The game will start on ' + formatTimeLink(internals.config.phases.init)))
        .then(() => exports.setTimer(internals.config.phases.init, exports.startGame));
};

function getRoleCard(username) {
    let message;
    if (internals.scum.indexOf(username) > -1) {
        message = `You are a ${flavorText[internals.flavor].scum}!\n` +
            'Every night, you and your companions \nmay choose to kill one person.\n' +
            'You win when the number of scum players \nis equal to or greater than the number of town players';
    } else {
        message = `You are a ${flavorText[internals.flavor].town}!\n` +
            'Your only ability is the daytime vote. \nChoose wisely!\n' +
            `You win when all ${flavorText[internals.flavor].scum} are dead.`;
    }
    
    return message;
}

exports.sendRolecard = function(index, username) {
    let target;
    const message = '\n```\n' + viewHelper.drawBoxAroundText(getRoleCard(username)) + '```\n';

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

/**
 * Post the flavor and role card for a death
 * @param {String} username The person who died. This will be passed to a template as "victim"
 * @param {String} type The type of template to use for the death. Should be one of "lynch" or "kill"
 * @returns {Promise} A promise that will resolve after the flip is posted
 */
exports.postFlip = function postFlip(username, type) {
    const deathTemplate = Handlebars.compile(flavorText[internals.flavor][type]);
    let message = deathTemplate({
        victim: username
    });
    
    message += `\n\n**${username}** has died! Role card: \n`;
    
    message += '\n```\n' + viewHelper.drawBoxAroundText(getRoleCard(username)) + '```\n';

    return internals.forum.Post.reply(internals.game.topicId, undefined, message);
};

function formatTimeLink(offset) {
    const timeString = viewHelper.relativeToAbsoluteTime(offset);
    const time = Moment(timeString, 'MMM Do [at] HH:mm [UTC]');
    return `<a href="${viewHelper.getDateTimeLink(time)}">${timeString}</a>`;
}

exports.startGame = function startGame() {
    debug('Running game start routine');
    const players = internals.game.livePlayers;
    internals.scum = [];
    
    if (players.length >= internals.config.minPlayers) {
        //Pick scum
        internals.scum.push(players[0].username);
        
        if (players.length >= 8) {
            internals.scum.push(players[1].username);
        }
        
        if (players.length >= 12) {
            internals.scum.push(players[2].username);
        }
        
        if (players.length >= 16) {
            internals.scum.push(players[3].username);
        }
        
        //Send role cards
        const rolePromises = [];
        const scumUsers = [];
        for (let i = 0; i < players.length; i++) {
            const promise = exports.sendRolecard(i, players[i].username).then((target) => {
                if (internals.scum.indexOf(players[i].username) > -1) {
                    scumUsers.push(target);
                    players[i].addProperty('scum');
                }
            });
            rolePromises.push(promise);
        }
        
        return Promise.all(rolePromises)
            .then(() => internals.game.setActive())
            //.then(() => internals.game.newDay()) //This I believe is unnecessary as it results in day 2.
            .then(() => {
                //Scum chat
                debug('Creating scum chat room');
                return internals.forum.Chat.create(scumUsers, 'This is the Scum Talk thread. You may talk in this thread at any time.',
                                                'Auto-generated Mafia Scum Talk');
            })
            .then((chatroom) => {
                debug('Adding scum chatroom to game. Chatroom object:');
                debug(chatroom);
                internals.game.addChat(chatroom.id);
            })
            .then(() => internals.forum.Post.reply(internals.game.topicId, undefined, flavorText[internals.flavor].openingScene))
            .then(() => internals.forum.Post.reply(internals.game.topicId, undefined, 'Let the game begin! It is now day. The day will end on ' +  formatTimeLink(internals.config.phases.day)))
            .then(() => exports.setTimer(internals.config.phases.day, exports.onDayEnd))
            .then(() => internals.game.setValue('phaseEnd', formatTimeLink(internals.config.phases.day)))
            .catch((err) => {
                debug(err);
                return internals.forum.Post.reply(internals.game.topicId, undefined, ':wtf: Sorry folks, I need to cancel this one; I\'ve hit an error. \n Error was: ' + err)
                    .then(() => internals.forum.Post.reply(internals.game.topicId, undefined, err.stack))
                    .then(() => exports.endGame());
            });
    } else {
        debug('Cancelling game in ' + internals.game.topicId);
        return internals.forum.Post.reply(internals.game.topicId, undefined, 'I\'m sorry, there were not enough players. Better luck next time!')
        .then(()=> exports.endGame());
    }
};


exports.onDayEnd = function onDayEnd() {
    debug('running Day End routine');
    return internals.game.nextPhase()
    .then(() => internals.forum.Post.reply(internals.game.topicId, undefined, 'It is now night. Night will end on ' + formatTimeLink(internals.config.phases.night)))
    .then(() => exports.setTimer(internals.config.phases.night, exports.onNightEnd))
    .then(() => internals.game.setValue('phaseEnd', formatTimeLink(internals.config.phases.night)));
};

exports.onLynch = function(username) {
    debug('running Lynch routine');
    exports.cancelTimer();
    
    return exports.postFlip(username, 'lynch').then(() => {
        const won = exports.checkWin();
        
        if (won) {
            return internals.forum.Post.reply(internals.game.topicId, undefined, getWinMsg(won))
                .then(() => exports.endGame());
        } else {
            return exports.onDayEnd();
        }
    });
};

function getWinMsg(won) {
    const wintype = won.toLowerCase() + 'Win';
    let winmsg = flavorText[internals.flavor][wintype];
    winmsg += '\n\n';
    winmsg += 'The game is over! ' + won + ' won! Congratulations to ';
    
    if (won.toLowerCase() === 'scum') {
        winmsg += viewHelper.makeList(internals.scum);
    } else {
        const nonScum = internals.game.allPlayers.map((player) => player.username).filter((player) => internals.scum.indexOf(player) === -1);
        winmsg += viewHelper.makeList(nonScum);
    }
    
    return winmsg;
}

exports.onNightEnd = function onNightEnd() {
    debug('running Night End routine');
    const action = internals.game.getActionOfType('target', null, 'scum', null, false);
    debug('action was: ');
    debug(action);
	
	return Promise.resolve().then(() => {
        if (action) {
            //Kill the scum's pick
            internals.game.killPlayer(action.target);
            return exports.postFlip(action.target.username, 'kill');
        } else {
            return internals.forum.Post.reply(internals.game.topicId, undefined, 'The night was quiet.');
        }
    }).then(() => {
        const won = exports.checkWin();
        const warn = exports.checkMylo();
        if (won) {
            return internals.forum.Post.reply(internals.game.topicId, undefined, getWinMsg(won))
                .then(() => exports.endGame());
        } else {
            return internals.game.newDay()
            .then(() => internals.forum.Post.reply(internals.game.topicId, undefined,
                        'It is now day. Day will end on ' +  formatTimeLink(internals.config.phases.day)))
            .then(() => {
                if (warn) {
                    return internals.forum.Post.reply(internals.game.topicId, undefined,
                    'WARNING! It is now ' + warn);
                }
            })
            .then(() => exports.setTimer(internals.config.phases.day, exports.onDayEnd))
            .then(() => internals.game.setValue('phaseEnd', formatTimeLink(internals.config.phases.day)));
        }
	});
};

exports.checkWin = function() {
    debug('Checking for win');
    const count = getPlayerCounts();
    
    if (count.scum >= count.town) {
        return 'Scum';
    }
    
    if (count.scum === 0) {
        return 'Town';
    }
    
    return false;
};

function getPlayerCounts() {
    const counts = {
        scum: 0,
        town: 0
    };
    
     const players = internals.game.livePlayers;
    for (let i = 0; i < players.length; i++ ) {
        if (internals.scum.indexOf(players[i].username) > -1) {
            counts.scum++;
        } else {
            counts.town++;
        }
    }
    
    return counts;
}


exports.checkMylo = function() {
    debug('Checking for myLo/lyLo');
    const count = getPlayerCounts();
    
    if (count.scum + 1 === count.town) {
        return 'LyLo';
    }
    
    if (count.scum + 2 === count.town) {
        return 'MyLo';
    }
    debug('Game count: ' + count);
    return false;
};

exports.save = function() {
    const persistData = {
        scum: internals.scum,
        thread: internals.game.topicId,
        flavor: internals.flavor,
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
              internals.flavor = data.flavor;
              
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
