'use strict';
/*globals describe, it, beforeEach, afterEach, should*/

const chai = require('chai'),
	sinon = require('sinon');
const SockMafia = require('sockmafia');
const AutoGM = require('../src/autoGM');
const viewHelper = require('../src/viewHelper');
const Moment = require('moment');
const fs = require('fs');

//promise library plugins
require('sinon-as-promised');
require('chai-as-promised');
chai.use(require('sinon-chai'));
chai.should();

function player(p) {
	return {
		username: p,
		addProperty: sinon.stub().resolves()
	};
}

describe('AutoGM', () => {
	let sandbox;
	
	beforeEach(() => {
		sandbox = sinon.sandbox.create();
		AutoGM.internals.flavor = 'normal'; //don't let weird flavors break tests
	});
	
	afterEach(() => {
		AutoGM.internals.config = AutoGM.defaultConfig;
		sandbox.restore();
	});
	
	describe('plugin', () => {
		const fakeConfig = {
			category: 12,
			minPlayers: 7
		};

		const fakeForum = {
			username: 'abot',
			on: () => 1,
			removeListener: () => 1
		};
		
		it('must return a plugin object', () => {
			AutoGM.plugin(fakeForum, fakeConfig).should.include.keys('activate', 'deactivate');
		});
		
		it('should save the forum reference', () => {
			AutoGM.plugin(fakeForum, fakeConfig);
			AutoGM.internals.forum.should.deep.equal(fakeForum);
		});
		
		it('should capture its name', () => {
			AutoGM.plugin(fakeForum, fakeConfig);
			AutoGM.internals.myName.should.equal(fakeForum.username);
		});
		
		
		it('should capture the category', () => {
			AutoGM.plugin(fakeForum, fakeConfig);
			AutoGM.internals.config.category.should.equal(fakeConfig.category);
		});
		
		it('should capture timer lengths', () => {
			const configWithPhases = {
				phases: {
					day: '1 hour',
					night: '2 hours',
					init: '3 hours'
				}
			};
			AutoGM.plugin(fakeForum, configWithPhases);
			AutoGM.internals.config.phases.should.deep.equal(configWithPhases.phases);
		});
		
		it('should capture minimum players', () => {
			AutoGM.plugin(fakeForum, fakeConfig);
			AutoGM.internals.config.minPlayers.should.equal(fakeConfig.minPlayers);
		});
		
		it('should enforce a bare minimum of 2 players', () => {
			const configWithMinimalPlayers = {
				minPlayers: 0
			};
			
			AutoGM.plugin(fakeForum, configWithMinimalPlayers);
			AutoGM.internals.config.minPlayers.should.equal(2);
		});
	});

	describe('activate', () => {
		let clock;
		
		before(() => {
			AutoGM.internals.forum = {
				on: () => 1,
				removeListener: () => 1
			};
			
			clock = sinon.useFakeTimers();
		});
		
		beforeEach(() => {
			sandbox.stub(AutoGM, 'init').resolves();
		});
		
		afterEach(() => {
			clock.restore();
			return AutoGM.deactivate();
		});
		
		it('Should start the internal clock', () => {
			sandbox.spy(clock, 'setInterval');
			
			return AutoGM.activate().then(() => {
				clock.setInterval.should.have.been.called;
			});
		});
		
		it('Should listen for lynch events', () => {
			sandbox.spy(AutoGM.internals.forum, 'on');
			
			return AutoGM.activate().then(() => {
				AutoGM.internals.forum.on.should.have.been.calledWith('mafia:playerLynched');
			});
		});
		
		it('Should init the game', () => {
			return AutoGM.activate().then(() => {
				AutoGM.init.should.have.been.called;
			});
		});
	});
	
	describe('deactivate', () => {
		let clock;
		
		before(() => {
			AutoGM.internals.forum = {
				on: () => 1,
				removeListener: () => 1
			};
			
			clock = sinon.useFakeTimers();
		});
		
		beforeEach(() => {
			sandbox.stub(AutoGM, 'init').resolves();
			return AutoGM.activate();
		});
		
		afterEach(() => {
			clock.restore();
		});
		
		it('Should stop the internal clock', () => {
			sandbox.spy(clock, 'clearInterval');
			
			return AutoGM.deactivate().then(() => {
				clock.clearInterval.should.have.been.called;
			});
		});
		
		it('Should stop listening for lynch events', () => {
			sandbox.spy(AutoGM.internals.forum, 'removeListener');
			
			return AutoGM.deactivate().then(() => {
				AutoGM.internals.forum.removeListener.should.have.been.calledWith('mafia:playerLynched');
			});
		});

	});
	
	describe('init', () => {
		it('Should load when there is a game to load', () => {
			sandbox.stub(AutoGM, 'load').resolves(true);
			sandbox.stub(AutoGM, 'createGame').resolves();
			AutoGM.init().then(() => {
				AutoGM.load.should.have.been.called;
				AutoGM.createGame.should.not.have.been.called;
			});
		});
		
		it('Should create a game when there is no game to load', () => {
			sandbox.stub(AutoGM, 'load').resolves(false);
			sandbox.stub(AutoGM, 'createGame').resolves();
			AutoGM.init().then(() => {
				AutoGM.load.should.have.been.called;
				AutoGM.createGame.should.have.been.called;
			});
		});
	});
	
	describe('createGame', () => {
		let fakeDao, fakeGame, fakeForum, fakeTopic, fakeCat;
		
		before(() => {
			fakeGame = {
				addModerator: () => Promise.resolve()
			};
			
			fakeCat = {
				addTopic: () => fakeTopic
			};
			
			fakeDao = {
				getGameById: () => Promise.resolve(fakeGame),
				createGame: () => Promise.resolve(fakeGame)
			};
			
			SockMafia.internals.dao = fakeDao;
			
			fakeTopic = {
				id: 1234,
				watch: () => Promise.resolve()
			};
			
			fakeForum = {
				Post: {
					reply: () => Promise.resolve()
				},
				Topic: {
					get: () => fakeTopic
				},
				Category: {
					get: () => Promise.resolve(fakeCat)
				}
			};
			
			AutoGM.internals.game = fakeGame;
			AutoGM.internals.forum = fakeForum;
			AutoGM.internals.myName = 'aBot';
		});
		
		beforeEach(() => {
			sandbox.stub(Math, 'random').returns(0);
		});
		
		it('Should create a thread', () => {
			sandbox.spy(fakeCat, 'addTopic');
			return AutoGM.createGame().then(() => {
				fakeCat.addTopic.should.have.been.called;
			});
		});
		
		it('Should create a thread in the right category', () => {
			AutoGM.internals.config.category = 13;
			sandbox.spy(fakeForum.Category, 'get');
			return AutoGM.createGame().then(() => {
				fakeForum.Category.get.should.have.been.calledWith(13);
			});
		});
		
		it('Should watch the thread', () => {
			sandbox.spy(fakeTopic, 'watch');
			return AutoGM.createGame().then(() => {
				fakeTopic.watch.should.have.been.called;
			});
		});
		
		it('Should create a game', () => {
			sandbox.spy(fakeDao, 'createGame');
			return AutoGM.createGame().then(() => {
				fakeDao.createGame.should.have.been.calledWith(fakeTopic.id);
			});
		});
		
		it('Should pick a flavor', () => {
			AutoGM.internals.flavor = 'weird';
			return AutoGM.createGame().then(() => {
				Math.random.should.have.been.called;
				AutoGM.internals.flavor.should.equal('normal');
			});
		});
		
		it('Should add itself as a mod', () => {
			sandbox.spy(fakeGame, 'addModerator');
			return AutoGM.createGame().then(() => {
				fakeGame.addModerator.should.have.been.calledWith('aBot');
			});
		});
		
		it('Should post a call for signups', () => {
			sandbox.spy(fakeForum.Post, 'reply');
			return AutoGM.createGame().then(() => {
				fakeForum.Post.reply.should.have.been.called;
			});
		});
		
		it('Should chill for 48 hours', () => {
			const expected =  '48 hours';
			sandbox.stub(AutoGM, 'setTimer');
			return AutoGM.createGame().then(() => {
				AutoGM.setTimer.should.have.been.called;
				AutoGM.setTimer.firstCall.args[0].should.equal(expected);
				AutoGM.setTimer.firstCall.args[1].should.equal(AutoGM.startGame);
			});
		});
	});
	
	describe('startGame', () => {
		let fakeForum;
		
		before(() => {
			const fakeRoom = {
				send: () => Promise.resolve(),
				id: 1
			};
			
			fakeForum = {
				Post: {
					reply: () => Promise.resolve()
				},
				Chat: {
					create: () => Promise.resolve(fakeRoom)
				},
				User: {
					getByName: (name) => Promise.resolve({
						username: name
					})
				},
				removeListener: () => Promise.resolve()
			};
			
			AutoGM.internals.forum = fakeForum;
			
			//Use default config
			AutoGM.internals.config = AutoGM.defaultConfig;
			
		});
		
		beforeEach(() => {
			AutoGM.internals.game = {
				livePlayers: [],
				newDay: () => Promise.resolve(),
				topicID: 123,
				moderators: [],
				addChat: () => 1,
				setActive: () => Promise.resolve(),
				setInactive: () => Promise.resolve()
			};
			
			sandbox.stub(AutoGM, 'sendRolecard', (index, user) => Promise.resolve(fakeForum.User.getByName(user)));
		});
		
		it('Should deactivate with 0 players', () => {
			sandbox.stub(AutoGM, 'deactivate').resolves();
			sandbox.spy(fakeForum.Post, 'reply');
			
			return AutoGM.startGame().then(() => {
				AutoGM.deactivate.should.have.been.called;
				fakeForum.Post.reply.should.have.been.called;
			});
		});
		
		it('Should deactivate on error', () => {
			AutoGM.internals.game.livePlayers = [player('one'), player('two'), player('three'), player('four'), player('five'), player('six')];
			AutoGM.sendRolecard.restore();
			sandbox.stub(AutoGM, 'sendRolecard').rejects(new Error());
			sandbox.stub(AutoGM, 'deactivate').resolves();
			sandbox.spy(fakeForum.Post, 'reply');
			
			return AutoGM.startGame().then(() => {
				AutoGM.deactivate.should.have.been.called;
				fakeForum.Post.reply.should.have.been.called;
				fakeForum.Post.reply.firstCall.args[2].should.include(':wtf:');
			});
		});
		
		it('Should deactivate with 5 players', () => {
			AutoGM.internals.game.livePlayers = [player('one'), player('two'), player('three'), player('four'), player('five')];
			sandbox.stub(AutoGM, 'deactivate').resolves();
			return AutoGM.startGame().then(() => {
				AutoGM.deactivate.should.have.been.called;
			});
		});
		
		it('Should start day 1 with 6 players', () => {
			AutoGM.internals.game.livePlayers = [player('one'), player('two'), player('three'), player('four'), player('five'), player('six')];
			sandbox.spy(AutoGM, 'deactivate');
			sandbox.spy(AutoGM.internals.game, 'setActive');
			sandbox.spy(fakeForum.Post, 'reply');
			sandbox.stub(AutoGM, 'setTimer').resolves();
			
			return AutoGM.startGame().then(() => {
				AutoGM.deactivate.should.not.have.been.called;
				AutoGM.internals.game.setActive.should.have.been.called;
				fakeForum.Post.reply.should.have.been.called;
			});
		});
		
		it('Should assign 1 scum with 6 players', () => {
			AutoGM.internals.game.livePlayers = [player('one'), player('two'), player('three'), player('four'), player('five'), player('six')];
			sandbox.stub(AutoGM, 'setTimer').resolves();
			
			return AutoGM.startGame().then(() => {
				AutoGM.internals.scum.should.include('one');
				AutoGM.internals.scum.should.not.include('two');
				AutoGM.internals.scum.should.not.include('three');
			});
		});
		
		it('Should assign 2 scum with 8 players', () => {
			AutoGM.internals.game.livePlayers = [player('one'), player('two'), player('three'), player('four'), player('five'), player('six'), player('seven'), player('eight')];
			sandbox.stub(AutoGM, 'setTimer').resolves();
			
			return AutoGM.startGame().then(() => {
				AutoGM.internals.scum.should.include('one');
				AutoGM.internals.scum.should.include('two');
				AutoGM.internals.scum.should.not.include('three');
				AutoGM.internals.scum.should.not.include('four');
				
				AutoGM.internals.game.livePlayers[0].addProperty.should.have.been.calledWith('scum');
				AutoGM.internals.game.livePlayers[1].addProperty.should.have.been.calledWith('scum');
				AutoGM.internals.game.livePlayers[2].addProperty.should.not.have.been.calledWith('scum');
				AutoGM.internals.game.livePlayers[3].addProperty.should.not.have.been.calledWith('scum');
			});
		});
		
		it('Should assign 3 scum with 12 players', () => {
			AutoGM.internals.game.livePlayers = [player('one'), player('two'), player('three'), player('four'), player('five'),
													player('six'), player('seven'), player('eight'), player('nine'), player('ten'),
													player('eleven'), player('twelve')];
			sandbox.stub(AutoGM, 'setTimer').resolves();
			
			return AutoGM.startGame().then(() => {
				AutoGM.internals.scum.should.include('one');
				AutoGM.internals.scum.should.include('two');
				AutoGM.internals.scum.should.include('three');
				AutoGM.internals.scum.should.not.include('four');
				AutoGM.internals.scum.should.not.include('five');
			});
		});
		
		it('Should assign 4 scum with 16 players', () => {
			AutoGM.internals.game.livePlayers = [player('one'), player('two'), player('three'), player('four'), player('five'),
													player('six'), player('seven'), player('eight'), player('nine'), player('ten'),
													player('eleven'), player('twelve'), player('thirteen'), player('fourteen'), player('fifteen'), player('sixteen')];
													
			sandbox.stub(AutoGM, 'setTimer').resolves();
			
			return AutoGM.startGame().then(() => {
				AutoGM.internals.scum.should.include('one');
				AutoGM.internals.scum.should.include('two');
				AutoGM.internals.scum.should.include('three');
				AutoGM.internals.scum.should.include('four');
				AutoGM.internals.scum.should.not.include('five');
			});
		});
		
		it('Should send role cards', () => {
			AutoGM.internals.game.livePlayers = [player('one'), player('two'), player('three'), player('four'), player('five'), player('six')];

			return AutoGM.startGame().then(() => {
				AutoGM.sendRolecard.should.have.callCount(6);
			});
		});
		
		it('Should create a scum chat', () => {
			AutoGM.internals.game.livePlayers = [player('one'), player('two'), player('three'), player('four'), player('five'), player('six'), player('seven'), player('eight')];
			sandbox.spy(fakeForum.Chat, 'create');
			AutoGM.internals.scum = [];
			
			return AutoGM.startGame().then(() => {
				fakeForum.Chat.create.should.have.been.called;
				const scumList = fakeForum.Chat.create.firstCall.args[0].map((value) => value.username);
				scumList.should.include('one');
				scumList.should.include('two');
				scumList.should.not.include('three');
			});
		});
		
		it('Should start the day', () => {
			AutoGM.internals.game.livePlayers = [player('one'), player('two'), player('three'), player('four'), player('five'), player('six')];
			sandbox.spy(AutoGM.internals.game, 'setActive');
			sandbox.spy(fakeForum.Post, 'reply');

			return AutoGM.startGame().then(() => {
				AutoGM.internals.game.setActive.should.have.been.called;
				fakeForum.Post.reply.should.have.been.called;
			});
		});
		
		it('Should chill for three days', () => {
			AutoGM.internals.game.livePlayers = [player('one'), player('two'), player('three'), player('four'), player('five'), player('six')];
			sandbox.stub(AutoGM, 'setTimer').resolves();
			const expected = '72 hours';
			
			return AutoGM.startGame().then(() => {
				AutoGM.setTimer.should.have.been.called;
				AutoGM.setTimer.firstCall.args[0].should.equal(expected);
				AutoGM.setTimer.firstCall.args[1].should.equal(AutoGM.onDayEnd);
			});
		});
	});
	
	describe('endGame', () => {
		beforeEach(() => {
			AutoGM.internals.config = AutoGM.defaultConfig;
			sandbox.stub(AutoGM, 'deactivate').resolves();
			sandbox.stub(AutoGM, 'createGame').resolves();
		});
		
		it('should trash the game', () => {
			AutoGM.internals.game = 'game object goes here';
			AutoGM.endGame().then(() => should.not.exist(AutoGM.internals.game));
		});
		
		it('should deactivate if not in loop mode', () => {
			AutoGM.internals.config.loop = false;
			AutoGM.endGame().then(() => AutoGM.deactivate().should.have.been.called);
		});
		
		it('should start a new game if in loop mode', () => {
			AutoGM.internals.config.loop = true;
			AutoGM.endGame().then(() => AutoGM.createGame().should.have.been.called);
		});
	});
	
	describe('sendRoleCard', () => {
			let fakeForum;
		
		before(() => {
			const fakeRoom = {
				send: () => Promise.resolve(),
				id: 1
			};
			
			fakeForum = {
				Post: {
					reply: () => Promise.resolve()
				},
				Chat: {
					create: sinon.stub().resolves(fakeRoom)
				},
				User: {
					getByName: (name) => Promise.resolve({
						username: name
					})
				},
				removeListener: () => Promise.resolve()
			};
			
			AutoGM.internals.forum = fakeForum;
			
			
		});
		
		beforeEach(() => {
			AutoGM.internals.game = {
				livePlayers: [],
				newDay: () => Promise.resolve(),
				topicID: 123,
				moderators: [],
				addChat: () => 1,
				setActive: () => 1,
				setInactive: () => 1
			};
		});
		
		it('Should send Town rolecard to townies', () => {
			AutoGM.internals.scum = [];
			return AutoGM.sendRolecard(0, 'player').then(() => {
				fakeForum.Chat.create.should.have.been.called;
				fakeForum.Chat.create.firstCall.args[1].should.contain('Vanilla Town');
			});
		});
		
		it('Should send Scum rolecard to scum', () => {
			AutoGM.internals.scum = ['player'];
			return AutoGM.sendRolecard(0, 'player').then(() => {
				fakeForum.Chat.create.should.have.been.called;
				fakeForum.Chat.create.firstCall.args[1].should.contain('Mafia Goon');
			});
		});
	});
	
	describe('onDayEnd', () => {
		let fakeForum;
		
		before(() => {
			fakeForum = {
				Post: {
					reply: () => Promise.resolve()
				}
			};
			
			AutoGM.plugin(fakeForum);
			
			AutoGM.internals.game = {
				livePlayers: [],
				newDay: () => Promise.resolve(),
				nextPhase: () => Promise.resolve(),
				topicID: 123
			};
		});
		
		it('Should move to night', () => {
			sandbox.spy(AutoGM.internals.game, 'nextPhase');
			return AutoGM.onDayEnd().then(() => {
				AutoGM.internals.game.nextPhase.should.have.been.called;
			});
		});
		
		it('Should post in the thread', () => {
			sandbox.spy(fakeForum.Post, 'reply');
			return AutoGM.onDayEnd().then(() => {
				fakeForum.Post.reply.should.have.been.called;
			});
		});
		
		it('Should chill for a day', () => {
			sandbox.stub(AutoGM, 'setTimer').resolves();
			const expected = '24 hours';
			
			return AutoGM.onDayEnd().then(() => {
				AutoGM.setTimer.should.have.been.called;
				AutoGM.setTimer.firstCall.args[0].should.equal(expected);
				AutoGM.setTimer.firstCall.args[1].should.equal(AutoGM.onNightEnd);
			});
		});
	});

	describe('onNightEnd', () => {
		let fakeForum;
		
		beforeEach(() => {
			fakeForum = {
				Post: {
					reply: () => Promise.resolve()
				},
				removeListener: () => 1
			};
			
			AutoGM.internals.forum = fakeForum;
			AutoGM.internals.scum = ['one'];
			
			AutoGM.internals.game = {
				livePlayers: [],
				allPlayers: [player('one'), player('two'), player('three'), player('four')],
				getActionOfType: () => null,
				killPlayer: () => Promise.resolve(),
				newDay: () => Promise.resolve(),
				nextPhase: () => Promise.resolve(),
				topicID: 123
			};
			
			sandbox.stub(AutoGM, 'endGame').resolves();

		});
		
		it('Should kill scum\'s pick', () => {
			sandbox.stub(AutoGM.internals.game, 'getActionOfType').returns({
				isCurrent: true,
				target: {
					username: 'johnny'
				}
			});
			
			sandbox.spy(AutoGM.internals.game, 'killPlayer');
			sandbox.spy(AutoGM, 'postFlip');
			sandbox.stub(AutoGM, 'checkWin').returns(false);
			
			return AutoGM.onNightEnd().then(() => {
				AutoGM.internals.game.killPlayer.should.have.been.calledWith({username: 'johnny'});
				AutoGM.postFlip.should.have.been.calledWith('johnny');
			});
		});
		
		it('Should not kill if scum missed the buzzer', () => {
			sandbox.spy(AutoGM.internals.game, 'killPlayer');
			sandbox.stub(AutoGM, 'checkWin').returns(false);
			sandbox.spy(fakeForum.Post, 'reply');
			
			return AutoGM.onNightEnd().then(() => {
				AutoGM.internals.game.killPlayer.should.not.have.been.called;
				fakeForum.Post.reply.should.have.been.called;
			});
		});
		
		it('Should check for a win', () => {
			sandbox.spy(AutoGM, 'checkWin');
			return AutoGM.onNightEnd().then(() => {
				AutoGM.checkWin.should.have.been.called;
			});
		});
		
		it('Should move to day if the game is not over', () => {
			sandbox.stub(AutoGM, 'checkWin').returns(false);
			sandbox.spy(AutoGM.internals.game, 'newDay');
			return AutoGM.onNightEnd().then(() => {
				AutoGM.internals.game.newDay.should.have.been.called;
			});
		});
		
		it('Should post in the thread if the game is not over', () => {
			sandbox.stub(AutoGM, 'checkWin').returns(false);
			sandbox.spy(fakeForum.Post, 'reply');
			return AutoGM.onNightEnd().then(() => {
				fakeForum.Post.reply.should.have.been.called;
			});
		});
		
		it('Should chill for 3 days if a new day dawned', () => {
			sandbox.stub(AutoGM, 'checkWin').returns(false);
			sandbox.stub(AutoGM, 'setTimer').resolves();
			const expected = '72 hours';
			
			return AutoGM.onNightEnd().then(() => {
				AutoGM.setTimer.should.have.been.called;
				AutoGM.setTimer.firstCall.args[0].should.equal(expected);
				AutoGM.setTimer.firstCall.args[1].should.equal(AutoGM.onDayEnd);
			});
		});

		it('Should post if town Won', () => {
			sandbox.stub(AutoGM, 'checkWin').returns('Town');
			sandbox.spy(fakeForum.Post, 'reply');
			return AutoGM.onNightEnd().then(() => {
				fakeForum.Post.reply.should.have.been.called;
				fakeForum.Post.reply.secondCall.args[2].should.include('Town won');
				fakeForum.Post.reply.secondCall.args[2].should.include('Congratulations to @two, @three, and @four');
			});
		});
		
		it('Should post if scum Won', () => {
			sandbox.stub(AutoGM, 'checkWin').returns('Scum');
			sandbox.spy(fakeForum.Post, 'reply');
			return AutoGM.onNightEnd().then(() => {
				fakeForum.Post.reply.should.have.been.called;
				fakeForum.Post.reply.secondCall.args[2].should.include('Scum won');
				fakeForum.Post.reply.secondCall.args[2].should.include('Congratulations to @one');
			});
		});
		
		it('Should end if the game is over', () => {
			sandbox.stub(AutoGM, 'checkWin').returns('Cuckoo');
			return AutoGM.onNightEnd().then(() => {
				AutoGM.endGame.should.have.been.called;
			});
		});
		
	});

	describe('onLynch', () => {
		let fakeForum;
		
		beforeEach(() => {
			fakeForum = {
				Post: {
					reply: () => Promise.resolve()
				},
				removeListener: () => 1
			};
			
			AutoGM.plugin(fakeForum);
			
			AutoGM.internals.game = {
				livePlayers: [],
				allPlayers: [player('one'), player('two'), player('three'), player('four')],
				newDay: () => Promise.resolve(),
				nextPhase: () => Promise.resolve(),
				topicID: 123
			};
			
			AutoGM.internals.scum = ['one'];
			
			sandbox.stub(AutoGM, 'postFlip').resolves();
			sandbox.stub(AutoGM, 'endGame').resolves();
		});
		
		it('Should post the flip', () => {
			sandbox.stub(AutoGM, 'checkWin').returns('Town');
			sandbox.spy(fakeForum.Post, 'reply');
			return AutoGM.onLynch('someone').then(() => {
				AutoGM.postFlip.should.have.been.calledWith('someone');
			});
		});
		
		it('Should post if town Won', () => {
			sandbox.stub(AutoGM, 'checkWin').returns('Town');
			sandbox.spy(fakeForum.Post, 'reply');
			return AutoGM.onLynch().then(() => {
				fakeForum.Post.reply.should.have.been.called;
				fakeForum.Post.reply.firstCall.args[2].should.include('Town');
			});
		});
		
		it('Should post if scum Won', () => {
			sandbox.stub(AutoGM, 'checkWin').returns('Scum');
			sandbox.spy(fakeForum.Post, 'reply');
			return AutoGM.onLynch().then(() => {
				fakeForum.Post.reply.should.have.been.called;
				fakeForum.Post.reply.firstCall.args[2].should.include('Scum');
			});
		});
		
		it('Should end if the game is over', () => {
			sandbox.stub(AutoGM, 'checkWin').returns('Cuckoo');
			return AutoGM.onLynch().then(() => {
				AutoGM.endGame.should.have.been.called;
			});
		});
		
		it('Should call onDayEnd if the game is not over', () => {
			sandbox.stub(AutoGM, 'checkWin').returns(false);
			sandbox.spy(AutoGM, 'onDayEnd');
			return AutoGM.onLynch().then(() => {
				AutoGM.onDayEnd.should.have.been.called;
			});
		});
	});

	describe('checkWin', () => {
		beforeEach(() => {
			AutoGM.internals.game = {
				livePlayers: [],
				newDay: () => Promise.resolve(),
				nextPhase: () => Promise.resolve(),
				topicID: 123
			};
		});
		
		it('Should return Scum when the scum equal the town', () => {
			AutoGM.internals.game.livePlayers = [{
				username: 'scum1'
			},
			{
				username: 'town1'
			}];
			
			AutoGM.internals.scum = ['scum1'];
			
			AutoGM.checkWin().should.equal('Scum');
		});
		
		it('Should return Scum when the scum outnumber the town', () => {
			AutoGM.internals.game.livePlayers = [{
				username: 'scum1'
			},
			{
				username: 'scum2'
			},
			{
				username: 'town1'
			}];
			
			AutoGM.internals.scum = ['scum1', 'scum2'];
			
			AutoGM.checkWin().should.equal('Scum');
		});
		
		it('Should return Town when the scum are all dead', () => {
			AutoGM.internals.game.livePlayers = [
			{
				username: 'town1'
			}];
			
			AutoGM.internals.scum = ['scum1', 'scum2'];
			
			AutoGM.checkWin().should.equal('Town');
		});
		
		it('Should return false otherwise', () => {
			AutoGM.internals.game.livePlayers = [
			{
				username: 'scum2'
			},
			{
				username: 'town1'
			},
			{
				username: 'town2'
			},
			{
				username: 'town3'
			}];
			
			AutoGM.internals.scum = ['scum1', 'scum2'];
			
			AutoGM.checkWin().should.be.false;
		});
	});

	describe('checkMylo', () => {
		beforeEach(() => {
			AutoGM.internals.game = {
				livePlayers: [],
				newDay: () => Promise.resolve(),
				nextPhase: () => Promise.resolve(),
				topicID: 123
			};
		});
		
		it('Should return LyLo when there is one more town than scum', () => {
			AutoGM.internals.game.livePlayers = [{
				username: 'scum1'
			},
			{
				username: 'town1'
			},
			{
				username: 'town2'
			}];
			
			AutoGM.internals.scum = ['scum1'];
			
			AutoGM.checkMylo().should.equal('LyLo');
		});
		
		it('Should return MyLo when there is two more town than scum', () => {
			AutoGM.internals.game.livePlayers = [{
				username: 'scum1'
			},
			{
				username: 'town1'
			},
			{
				username: 'town2'
			},
			{
				username: 'town3'
			}];
			
			AutoGM.internals.scum = ['scum1'];
			
			AutoGM.checkMylo().should.equal('MyLo');
		});
		
		it('Should return false when there is three more town than scum', () => {
			AutoGM.internals.game.livePlayers = [{
				username: 'scum1'
			},
			{
				username: 'town1'
			},
			{
				username: 'town2'
			},
			{
				username: 'town3'
			},
			{
				username: 'town4'
			}];
			
			AutoGM.internals.scum = ['scum1'];
			
			AutoGM.checkMylo().should.equal(false);
		});
	});
	describe('setTimer', () => {
		let clock;
		
		before(() => {
			AutoGM.internals.forum = {
				on: () => 1,
				removeListener: () => 1
			};
		});
		
		beforeEach(() => {
			sandbox.stub(AutoGM, 'init').resolves();
			sandbox.stub(AutoGM, 'save').resolves();
			clock = sinon.useFakeTimers();
			return AutoGM.activate();
		});
		
		afterEach(() => {
			clock.restore();
			return AutoGM.deactivate();
		});
		
		it('Should persist game state', () => {
			const callback = sandbox.stub().resolves();
			
			return AutoGM.setTimer(Moment().add(10, 'ms'), callback).then(() => {
				AutoGM.save.should.have.been.called;
			});
		});
		
		it('Should call the callback when the time passes', () => {
			const callback = sandbox.stub().resolves();
			
			return AutoGM.setTimer(Moment().add(10, 'ms'), callback).then(() => {
				clock.tick(20);
				callback.should.have.been.called;
			});
		});
		
		it('Should not call the callback when the time has not yet passed', () => {
			const callback = sandbox.stub().resolves();
			
			return AutoGM.setTimer(Moment().add(1000, 'ms'), callback).then(() => {
				clock.tick(20);
				callback.should.not.have.been.called;
			});
		});
	});
	
	describe('cancelTimer', () => {
		it('Should remove the timer', () => {
			return AutoGM.setTimer('2 minutes', sandbox.stub().resolves())
			.then(() => AutoGM.cancelTimer())
			.then(() => chai.expect(AutoGM.internals.timer.nextAlert).to.be.undefined);
		});
	});

	describe('save', () => {
		beforeEach(() => {
			sandbox.stub(fs, 'writeFile').yields();
			SockMafia.internals.dao = {
				save: sandbox.stub()
			};
		});
		
		it('should persist to disc', () => {
			return AutoGM.save().then(() => {
				fs.writeFile.should.have.been.called;
			});
		});
		
		it('should reject if an error occurs', () => {
			fs.writeFile.throws('error');
			return AutoGM.save().should.reject;
		});
		
		it('should persist scum', () => {
			AutoGM.internals.scum = ['player1', 'player2'];
			return AutoGM.save().then(() => {
				const data = JSON.parse(fs.writeFile.firstCall.args[1]);
				data.should.contain.key('scum');
				data.scum.should.deep.equal(AutoGM.internals.scum);
			});
		});
		
		it('should persist game thread', () => {
			AutoGM.internals.game = {
				topicId: 123
			};
			return AutoGM.save().then(() => {
				const data = JSON.parse(fs.writeFile.firstCall.args[1]);
				data.should.contain.key('thread');
				data.thread.should.equal(123);
			});
		});
		
		it('should persist flavor', () => {
			AutoGM.internals.flavor = 'Strawberry';
			return AutoGM.save().then(() => {
				const data = JSON.parse(fs.writeFile.firstCall.args[1]);
				data.should.contain.key('flavor');
				data.flavor.should.equal('Strawberry');
			});
		});
		
		it('should persist next alert date', () => {
			AutoGM.internals.timer.nextAlert = new Moment();
			AutoGM.internals.timer.callback = 'function';
			const expected = AutoGM.internals.timer.nextAlert.toISOString();
			
			return AutoGM.save().then(() => {
				const data = JSON.parse(fs.writeFile.firstCall.args[1]);
				data.should.contain.key('timer');
				data.timer.should.contain.key('nextAlert');
				data.timer.nextAlert.should.equal(expected);
			});
		});
		
		it('should persist callback of startGame', () => {
			AutoGM.internals.timer.nextAlert = new Moment();
			AutoGM.internals.timer.callback = AutoGM.startGame;
			const expected = 'startGame';
			
			return AutoGM.save().then(() => {
				const data = JSON.parse(fs.writeFile.firstCall.args[1]);
				data.should.contain.key('timer');
				data.timer.should.contain.key('callback');
				data.timer.callback.should.equal(expected);
			});
		});
		
		it('should persist callback of onDayEnd', () => {
			AutoGM.internals.timer.nextAlert = new Moment();
			AutoGM.internals.timer.callback = AutoGM.onDayEnd;
			const expected = 'onDayEnd';
			
			return AutoGM.save().then(() => {
				const data = JSON.parse(fs.writeFile.firstCall.args[1]);
				data.should.contain.key('timer');
				data.timer.should.contain.key('callback');
				data.timer.callback.should.equal(expected);
			});
		});
		
		it('should persist callback of onNightEnd', () => {
			AutoGM.internals.timer.nextAlert = new Moment();
			AutoGM.internals.timer.callback = AutoGM.onNightEnd;
			const expected = 'onNightEnd';
			
			return AutoGM.save().then(() => {
				const data = JSON.parse(fs.writeFile.firstCall.args[1]);
				data.should.contain.key('timer');
				data.timer.should.contain.key('callback');
				data.timer.callback.should.equal(expected);
			});
		});
	});
	
	describe('load', () => {
		const minFile = '{"scum": [], "thread": 123}';
		const fakeGame = {
					topicId: 123
				};
		
		beforeEach(() => {
			sandbox.stub(fs, 'readFile');
			SockMafia.internals.dao = {
				getGameByTopicId: () => Promise.resolve(fakeGame)
			};
		});
		
		it('Should resolve on success', () => {
			fs.readFile.yields(undefined, minFile);
			AutoGM.load().should.resolve;
		});
		
		it('Should reject on error', () => {
			fs.readFile.yields('error', undefined);
			AutoGM.load().should.reject;
		});
		
		it('Should resolve if file not found', () => {
			fs.readFile.yields({
				code: 'ENOENT'
			}, undefined);

			return AutoGM.load().then((res) => {
				res.should.be.false;
			});
		});
		
		it('Should read the file', () => {
			fs.readFile.yields(undefined, minFile);
			return AutoGM.load().then(() => {
				fs.readFile.should.have.been.called;
			});
		});
		
		it('Should handle empty files', () => {
			AutoGM.internals.scum = [];
			fs.readFile.yields(undefined, '');
			return AutoGM.load().then((result) => {
				AutoGM.internals.scum.should.deep.equal([]);
				result.should.be.false;
			});
		});
		
		it('Should handle no game state', () => {
			AutoGM.internals.scum = [];
			fs.readFile.yields(undefined, '{}');
			return AutoGM.load().then((result) => {
				AutoGM.internals.scum.should.deep.equal([]);
				result.should.be.false;
			});
		});
		
		it('Should retrieve the game', () => {
			AutoGM.internals.game = undefined;
			fs.readFile.yields(undefined, minFile);
			sandbox.spy(SockMafia.internals.dao, 'getGameByTopicId');

			return AutoGM.load().then(() => {
				SockMafia.internals.dao.getGameByTopicId.should.have.been.called;
				AutoGM.internals.game.should.deep.equal(fakeGame);
			});
		});
		
		it('Should read in the scum', () => {
			AutoGM.internals.scum = [];
			fs.readFile.yields(undefined, '{"scum": ["player1", "player2"]}');
			return AutoGM.load().then(() => {
				AutoGM.internals.scum.should.deep.equal(['player1', 'player2']);
			});
		});
		
		it('Should read in the flavor', () => {
			AutoGM.internals.flavor = 'Vanilla';
			fs.readFile.yields(undefined, '{"scum": ["player1", "player2"],"flavor": "Chocolate"}');
			return AutoGM.load().then(() => {
				AutoGM.internals.flavor.should.equal('Chocolate');
			});
		});
		
		it('Should read in nextAlert', () => {
			const expected = new Moment();
			AutoGM.internals.timer.nextAlert = '';
			fs.readFile.yields(undefined, JSON.stringify({
				scum: [],
				timer: {
					nextAlert: expected.toISOString()
				}
			}));

			return AutoGM.load().then(() => {
				AutoGM.internals.timer.nextAlert.isSame(expected).should.be.true;
			});
		});
		
		it('Should deserialize callback from startGame', () => {
			AutoGM.internals.timer.callback = undefined;
			fs.readFile.yields(undefined, JSON.stringify({
				scum: [],
				timer: {
					nextAlert: new Moment().toISOString(),
					callback: 'startGame'
				}
			}));

			return AutoGM.load().then(() => {
				AutoGM.internals.timer.callback.should.equal(AutoGM.startGame);
			});
		});
		
		it('Should deserialize callback from onDayEnd', () => {
			AutoGM.internals.timer.callback = undefined;
			fs.readFile.yields(undefined, JSON.stringify({
				scum: [],
				timer: {
					nextAlert: new Moment().toISOString(),
					callback: 'onDayEnd'
				}
			}));

			return AutoGM.load().then(() => {
				AutoGM.internals.timer.callback.should.equal(AutoGM.onDayEnd);
			});
		});
		
		it('Should deserialize callback from onNightEnd', () => {
			AutoGM.internals.timer.callback = undefined;
			fs.readFile.yields(undefined, JSON.stringify({
				scum: [],
				timer: {
					nextAlert: new Moment().toISOString(),
					callback: 'onNightEnd'
				}
			}));

			return AutoGM.load().then(() => {
				AutoGM.internals.timer.callback.should.equal(AutoGM.onNightEnd);
			});
		});
	});
});

describe('viewHelper', () => {
	describe('drawBoxAroundText', () => {
		it('should return text with a box around it', () => {
			const text = 'This is a line length 24\nAnd a short one\nAnd so on';
			const output = viewHelper.drawBoxAroundText(text);
			const outlines = output.split('\n');
			
			outlines[0].should.equal('╔══════════════════════════╗');
			outlines[1].should.equal('║ This is a line length 24 ║');
			outlines[2].should.equal('║ And a short one          ║');
			outlines[3].should.equal('║ And so on                ║');
			outlines[4].should.equal('╚══════════════════════════╝');

		});
	});
	
	describe('makeList', () => {
		it('should handle 0 names', () => viewHelper.makeList([]).should.equal('nobody'));
		it('should handle one name', () => viewHelper.makeList(['one']).should.equal('@one'));
		it('should handle two names', () => viewHelper.makeList(['one', 'two']).should.equal('@one and @two'));
		it('should handle three names', () => viewHelper.makeList(['one', 'two', 'three']).should.equal('@one, @two, and @three'));
		it('should handle invalid input', () => viewHelper.makeList(false).should.equal('nobody'));
		it('should handle invalid input', () => viewHelper.makeList('banana').should.equal('nobody'));
	});
});
