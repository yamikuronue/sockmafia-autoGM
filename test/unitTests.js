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
    
    describe('init', () => {
        let fakeDao, fakeGame, fakeForum, fakeTopic;
        
        before(() => {
            fakeDao = {
                getGameById: () => Promise.resolve(fakeGame),
                createGame: () => Promise.resolve(fakeGame)
            }
            SockMafia.internals.dao = fakeDao;
            
            fakeTopic = {
                watch: () => Promise.resolve()
            }
            
            fakeForum = {
                Post: {
                    reply: () => Promise.resolve()
                },
                Topic: {
                    get: () => fakeTopic
                }
            }
            
            AutoGM.internals.game = fakeGame;
            AutoGM.internals.forum = fakeForum;
        });
        
        beforeEach(() => {
            return AutoGM.activate();
        });
        
        afterEach(() => {
           return AutoGM.deactivate(); 
        });
        
        it('Should create a thread', () => {
        
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
                fakeDao.createGame.should.have.been.called;
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
            }
            
            AutoGM.internals.forum = fakeForum;
            
            AutoGM.internals.game = {
                livePlayers: [],
                newDay: () => Promise.resolve(),
                topicID: 123
            }
        });
        
        it('Should deactivate with 0 players', () => {
            sandbox.stub(AutoGM, 'deactivate').resolves();
            return AutoGM.startGame().then(() => {
                AutoGM.deactivate.should.have.been.called;
            });
        });
        
        it('Should start day 1 with 12 players', () => {
            AutoGM.internals.game.livePlayers = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
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
        
        it('Should chill for three days', () => {
            AutoGM.internals.game.livePlayers = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']
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
            }
            
            AutoGM.plugin(fakeForum);
            
            AutoGM.internals.game = {
                livePlayers: [],
                newDay: () => Promise.resolve(),
                topicID: 123
            }
        });
        
     });
})