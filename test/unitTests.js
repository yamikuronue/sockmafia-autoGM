'use strict';
/*globals describe, it, beforeEach, afterEach*/

const chai = require('chai'),
	sinon = require('sinon');
const SockMafia = require('sockmafia');
const AutoGM = require('../src/autoGM');
const Moment = require('moment');

//promise library plugins
require('sinon-as-promised');
require('chai-as-promised');
chai.use(require('sinon-chai'));
chai.should();

describe('AutoGM', () => {
	let sandbox;
	
	beforeEach(() => {
		sandbox = sinon.sandbox.create();
	});
	
	afterEach(() => {
		sandbox.restore();
	});
	
	describe('plugin', () => {
		const fakeConfig = {
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
			sandbox.stub(AutoGM, 'init').resolves()
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
		
		it('Should lose the game', () => {
			AutoGM.internals.game = 'stuff';
			
			return AutoGM.deactivate().then(() => {
				chai.expect(AutoGM.internals.game).to.be.undefined;
			});
		});
	});
	
	describe('init', () => {
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
					get: () => fakeCat
				}
			};
			
			AutoGM.internals.game = fakeGame;
			AutoGM.internals.forum = fakeForum;
			AutoGM.internals.myName = 'aBot';
		});
		
		it('Should create a thread', () => {
			sandbox.spy(fakeCat, 'addTopic');
			return AutoGM.init().then(() => {
				fakeCat.addTopic.should.have.been.called;
			});
		});
		
		it('Should watch the thread', () => {
			sandbox.spy(fakeTopic, 'watch');
			return AutoGM.init().then(() => {
				fakeTopic.watch.should.have.been.called;
			});
		});
		
		it('Should create a game', () => {
			sandbox.spy(fakeDao, 'createGame');
			return AutoGM.init().then(() => {
				fakeDao.createGame.should.have.been.calledWith(fakeTopic.id);
			});
		});
		
		it('Should add itself as a mod', () => {
			sandbox.spy(fakeGame, 'addModerator');
			return AutoGM.init().then(() => {
				fakeGame.addModerator.should.have.been.calledWith('aBot');
			});
		});
		
		it('Should post a call for signups', () => {
			sandbox.spy(fakeForum.Post, 'reply');
			return AutoGM.init().then(() => {
				fakeForum.Post.reply.should.have.been.called;
			});
		});
		
		it('Should chill for 48 hours', () => {
			const expected = Moment().add(48, 'hours');
			sandbox.stub(AutoGM, 'setTimer');
			return AutoGM.init().then(() => {
				AutoGM.setTimer.should.have.been.called;
				const actual = AutoGM.setTimer.firstCall.args[0];
				Moment(actual).isSameOrAfter(expected).should.be.true;
			});
		});
	});
	
	describe('startGame', () => {
		let fakeForum;
		
		before(() => {
			fakeForum = {
				Post: {
					reply: () => Promise.resolve()
				}
			};
			
			AutoGM.internals.forum = fakeForum;
			
			AutoGM.internals.game = {
				livePlayers: [],
				newDay: () => Promise.resolve(),
				topicID: 123
			};
		});
		
		function player(p) {
			return {
				username: p
			};
		}
		
		it('Should deactivate with 0 players', () => {
			sandbox.stub(AutoGM, 'deactivate').resolves();
			return AutoGM.startGame().then(() => {
				AutoGM.deactivate.should.have.been.called;
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
			sandbox.spy(AutoGM.internals.game, 'newDay');
			sandbox.spy(fakeForum.Post, 'reply');
			sandbox.stub(AutoGM, 'setTimer').resolves();
			
			return AutoGM.startGame().then(() => {
				AutoGM.deactivate.should.not.have.been.called;
				AutoGM.internals.game.newDay.should.have.been.called;
				fakeForum.Post.reply.should.have.been.called;
			});
		});
		
		it('Should assign 2 scum with 6 players', () => {
			AutoGM.internals.game.livePlayers = [player('one'), player('two'), player('three'), player('four'), player('five'), player('six')];
			sandbox.stub(AutoGM, 'setTimer').resolves();
			
			return AutoGM.startGame().then(() => {
				AutoGM.internals.scum.should.include('one');
				AutoGM.internals.scum.should.include('two');
				AutoGM.internals.scum.should.not.include('three');
			});
		});
		
		it('Should assign 3 scum with 8 players', () => {
			AutoGM.internals.game.livePlayers = [player('one'), player('two'), player('three'), player('four'), player('five'), player('six'), player('seven'), player('eight')];
			sandbox.stub(AutoGM, 'setTimer').resolves();
			
			return AutoGM.startGame().then(() => {
				AutoGM.internals.scum.should.include('one');
				AutoGM.internals.scum.should.include('two');
				AutoGM.internals.scum.should.include('three');
				AutoGM.internals.scum.should.not.include('four');
			});
		});
		
		it('Should assign 4 scum with 11 players', () => {
			AutoGM.internals.game.livePlayers = [player('one'), player('two'), player('three'), player('four'), player('five'), player('six'), player('seven'), player('eight'), player('nine'), player('ten'), player('eleven')];
			sandbox.stub(AutoGM, 'setTimer').resolves();
			
			return AutoGM.startGame().then(() => {
				AutoGM.internals.scum.should.include('one');
				AutoGM.internals.scum.should.include('two');
				AutoGM.internals.scum.should.include('three');
				AutoGM.internals.scum.should.include('four');
				AutoGM.internals.scum.should.not.include('five');
			});
		});
		
		it('Should chill for three days', () => {
			AutoGM.internals.game.livePlayers = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
			sandbox.stub(AutoGM, 'setTimer').resolves();
			const expected = Moment().add(72, 'hours');
			
			return AutoGM.startGame().then(() => {
				AutoGM.setTimer.should.have.been.called;
				const actual = AutoGM.setTimer.firstCall.args[0];
				Moment(actual).isSameOrAfter(expected).should.be.true;
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
			const expected = Moment().add(24, 'hours');
			
			return AutoGM.onDayEnd().then(() => {
				AutoGM.setTimer.should.have.been.called;
				const actual = AutoGM.setTimer.firstCall.args[0];
				Moment(actual).isSameOrAfter(expected).should.be.true;
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
			
			AutoGM.internals.game = {
				livePlayers: [],
				getActionOfType: () => null,
				killPlayer: () => Promise.resolve(),
				newDay: () => Promise.resolve(),
				nextPhase: () => Promise.resolve(),
				topicID: 123
			};
		});
		
		it('Should kill scum\'s pick', () => {
			sandbox.stub(AutoGM.internals.game, 'getActionOfType').returns({
				isCurrent: true,
				target: 'johnny'
			});
			
			sandbox.spy(AutoGM.internals.game, 'killPlayer');
			sandbox.stub(AutoGM, 'checkWin').returns(false);
			
			return AutoGM.onNightEnd().then(() => {
				AutoGM.internals.game.killPlayer.should.have.been.calledWith('johnny');
			});
		});
		
		it('Should not kill if scum missed the buzzer', () => {
			sandbox.spy(AutoGM.internals.game, 'killPlayer');
			sandbox.stub(AutoGM, 'checkWin').returns(false);
			
			return AutoGM.onNightEnd().then(() => {
				AutoGM.internals.game.killPlayer.should.not.have.been.called;
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
			const expected = Moment().add(72, 'hours');
			
			return AutoGM.onNightEnd().then(() => {
				AutoGM.setTimer.should.have.been.called;
				const actual = AutoGM.setTimer.firstCall.args[0];
				Moment(actual).isSameOrAfter(expected).should.be.true;
			});
		});
		
		it('Should post if town Won', () => {
			sandbox.stub(AutoGM, 'checkWin').returns('Town');
			sandbox.spy(fakeForum.Post, 'reply');
			return AutoGM.onNightEnd().then(() => {
				fakeForum.Post.reply.should.have.been.called;
				fakeForum.Post.reply.firstCall.args[2].should.include('Town');
			});
		});
		
		it('Should post if scum Won', () => {
			sandbox.stub(AutoGM, 'checkWin').returns('Scum');
			sandbox.spy(fakeForum.Post, 'reply');
			return AutoGM.onNightEnd().then(() => {
				fakeForum.Post.reply.should.have.been.called;
				fakeForum.Post.reply.firstCall.args[2].should.include('Scum');
			});
		});
		
		it('Should deactivate if the game is over', () => {
			sandbox.stub(AutoGM, 'checkWin').returns('Cuckoo');
			sandbox.spy(AutoGM, 'deactivate');
			return AutoGM.onNightEnd().then(() => {
				AutoGM.deactivate.should.have.been.called;
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
				newDay: () => Promise.resolve(),
				nextPhase: () => Promise.resolve(),
				topicID: 123
			};
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
		
		it('Should deactivate if the game is over', () => {
			sandbox.stub(AutoGM, 'checkWin').returns('Cuckoo');
			sandbox.spy(AutoGM, 'deactivate');
			return AutoGM.onLynch().then(() => {
				AutoGM.deactivate.should.have.been.called;
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

	describe('setTimer', () => {
		let clock;
		
		before(() => {
			AutoGM.internals.forum = {
				on: () => 1,
				removeListener: () => 1
			};
		});
		
		beforeEach(() => {
			clock = sinon.useFakeTimers();
			return AutoGM.activate();
		});
		
		afterEach(() => {
			clock.restore();
			return AutoGM.deactivate();
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
	
});
