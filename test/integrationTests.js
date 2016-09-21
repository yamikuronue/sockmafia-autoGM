'use strict';

const chai = require('chai'),
	sinon = require('sinon');
const AutoGM = require('../src/autoGM');
const SockMafia = require('sockmafia');
const rimraf = require('rimraf-promise');

//promise library plugins
require('sinon-as-promised');
require('chai-as-promised');
chai.use(require('sinon-chai'));
chai.should();

//=====mock out sockbot itself ====/
const fakeTopic = {
	id: 1234,
	watch: () => Promise.resolve()
};
const fakeRoom = {
	send: () => Promise.resolve(),
	id: 1
};
const fakeForum = {
	username: 'abot',
	on: () => 1,
	removeListener: () => 1,
	Post: {
		reply: () => Promise.resolve()
	},
	Topic: {
		get: () => fakeTopic
	},
	Category: {
		get: () => Promise.resolve({
			addTopic: () => fakeTopic
		})
	},
	Chat: {
		create: () => Promise.resolve(fakeRoom)
	},
	User: {
		getByName: (name) => Promise.resolve({
			username: name
		})
	},
};


describe('AutoGM Games', function() {
	this.timeout(5000);

	let sandbox;
	beforeEach(() => {
		sandbox = sinon.sandbox.create();
		return rimraf('intTestDb').then(() => {
			AutoGM.plugin(fakeForum, {});
			SockMafia.plugin(fakeForum, {
				db: 'intTestDb'
			});
		});
	});
	
	afterEach(() => {
		sandbox.restore();
	});
	
	/* Scenario 1:
		- 2 mafia, 6 players (2:4)
		- Day 1: lynch town (2:3)
		- Night 1: kill town (2:2, scum win)
	*/
	it('Scenario 1', () => {
		sandbox.spy(fakeForum.Post, 'reply');
		//Step 1: game setup triggered
		return AutoGM.createGame().then(() => {
			//validate
			fakeForum.Post.reply.should.have.been.calledWith(1234, undefined);
			fakeForum.Post.reply.firstCall.args[2].should.include('Signups are now open!');
			fakeForum.Post.reply.reset();
			
			//force normal flavor
			AutoGM.internals.flavor = 'normal';
			
			//sending rolecards is very slow
			sandbox.stub(AutoGM, 'sendRolecard').resolves();
		//Step 2: eight people join
			return Promise.all([
				AutoGM.internals.game.addPlayer('player1'),
				AutoGM.internals.game.addPlayer('player2'),
				AutoGM.internals.game.addPlayer('player3'),
				AutoGM.internals.game.addPlayer('player4'),
				AutoGM.internals.game.addPlayer('player5'),
				AutoGM.internals.game.addPlayer('player6'),
			]);
		
		})
		//Step 3: Game start timer expires
		.then(() => AutoGM.startGame())
		.then(() => {
			//validate
			AutoGM.sendRolecard.should.have.callCount(6);
			fakeForum.Post.reply.should.have.been.calledWith(1234, undefined);
			fakeForum.Post.reply.firstCall.args[2].should.include('Your little town has been under seige');
			fakeForum.Post.reply.secondCall.args[2].should.include('Let the game begin! It is now day.');
			fakeForum.Post.reply.reset();
			
		//Step 4: Lynch a townie	
			let lynchee;
			for (let i = 1; i <= 3; i++) {
				if (AutoGM.internals.scum.indexOf(`player${i}`) === -1) {
					lynchee = `player${i}`;
					break;
				}
			}
														
			return AutoGM.internals.game.killPlayer(lynchee)
			//Step 4.5: mafia sends a signal to AutoGM
			.then(() => AutoGM.onLynch(lynchee));
		})
		.then(() => {
			//validate
			fakeForum.Post.reply.should.have.been.calledWith(1234, undefined);
			fakeForum.Post.reply.firstCall.args[2].should.include('has died!');
			fakeForum.Post.reply.firstCall.args[2].should.include('Vanilla Town');
			fakeForum.Post.reply.secondCall.args[2].should.include('It is now night.');
			fakeForum.Post.reply.reset();
			
		//Step 5: Kill a townie
			let target;
			for (let i = 6; i >= 3; i--) {
				if (AutoGM.internals.scum.indexOf(`player${i}`) === -1) {
					target = `player${i}`;
					break;
				}
			}
			return AutoGM.internals.game.registerAction(123, AutoGM.internals.scum[0], target, 'target', 'scum');
		})
		//Step 6: Night timer expires
		.then(() => AutoGM.onNightEnd())
		.then(() => {
			//validate
			fakeForum.Post.reply.should.have.been.calledWith(1234, undefined);
			fakeForum.Post.reply.firstCall.args[2].should.include('has died!');
			fakeForum.Post.reply.firstCall.args[2].should.include('Vanilla Town');
			fakeForum.Post.reply.secondCall.args[2].should.include('The game is over! Scum won!');
			fakeForum.Post.reply.reset();
		});
	});
	
	/* Scenario 2:
		- 2 mafia, 6 players (2:4)
		- Day 1: no-lynch (2:4)
		- Night 1: kill town (2:3)
		- Day 2: lynch town (2:2, scum win)
	*/
	it('Scenario 2', () => {
		sandbox.spy(fakeForum.Post, 'reply');
		//Step 1: game setup triggered
		return AutoGM.createGame().then(() => {
			//validate
			fakeForum.Post.reply.should.have.been.calledWith(1234, undefined);
			fakeForum.Post.reply.firstCall.args[2].should.include('Signups are now open!');
			fakeForum.Post.reply.reset();
			
			//force normal flavor
			AutoGM.internals.flavor = 'normal';
			
			//sending rolecards is very slow
			sandbox.stub(AutoGM, 'sendRolecard').resolves();
		//Step 2: eight people join
			return Promise.all([
				AutoGM.internals.game.addPlayer('player1'),
				AutoGM.internals.game.addPlayer('player2'),
				AutoGM.internals.game.addPlayer('player3'),
				AutoGM.internals.game.addPlayer('player4'),
				AutoGM.internals.game.addPlayer('player5'),
				AutoGM.internals.game.addPlayer('player6'),
			]);
		
		})
		//Step 3: Game start timer expires
		.then(() => AutoGM.startGame())
		.then(() => {
			//validate
			AutoGM.sendRolecard.should.have.callCount(6);
			fakeForum.Post.reply.should.have.been.calledWith(1234, undefined);
			fakeForum.Post.reply.firstCall.args[2].should.include('Your little town has been under seige');
			fakeForum.Post.reply.secondCall.args[2].should.include('Let the game begin! It is now day.');
			fakeForum.Post.reply.reset();
			
		//Step 4: no-lynch
			return AutoGM.onDayEnd();
		})
		.then(() => {
			//validate
			fakeForum.Post.reply.should.have.been.calledWith(1234, undefined);
			fakeForum.Post.reply.firstCall.args[2].should.include('It is now night.');
			fakeForum.Post.reply.reset();
			
		//Step 5: Kill a townie
			let target;
			for (let i = 6; i >= 3; i--) {
				if (AutoGM.internals.scum.indexOf(`player${i}`) === -1) {
					target = `player${i}`;
					break;
				}
			}
			return AutoGM.internals.game.registerAction(123, AutoGM.internals.scum[0], target, 'target', 'scum');
			
			
		})
		//Step 6: Night timer expires
		.then(() => AutoGM.onNightEnd())
		.then(() => {
			//validate
			fakeForum.Post.reply.should.have.been.calledWith(1234, undefined);
			fakeForum.Post.reply.firstCall.args[2].should.include('has died!');
			fakeForum.Post.reply.firstCall.args[2].should.include('Vanilla Town');
			fakeForum.Post.reply.secondCall.args[2].should.include('It is now day');
			fakeForum.Post.reply.reset();
			
		//Step 4: Lynch a townie	
			let lynchee;
			for (let i = 1; i <= 3; i++) {
				if (AutoGM.internals.scum.indexOf(`player${i}`) === -1) {
					lynchee = `player${i}`;
					break;
				}
			}
														
			return AutoGM.internals.game.killPlayer(lynchee)
			//Step 4.5: mafia sends a signal to AutoGM
			.then(() => AutoGM.onLynch(lynchee));
		}).then(() => {
			//validate
			fakeForum.Post.reply.should.have.been.calledWith(1234, undefined);
			fakeForum.Post.reply.firstCall.args[2].should.include('has died!');
			fakeForum.Post.reply.firstCall.args[2].should.include('Vanilla Town');
			fakeForum.Post.reply.secondCall.args[2].should.include('Scum won');
			fakeForum.Post.reply.reset();
		});
	});
	
	/* Scenario 3:
		- 2 mafia, 8 players (2:6)
		- Day 1: lynch scum (1:6)
		- Night 1: kill scum (1:5)
		- Day 2: lynch scum (0:4, town win)
	*/
});
