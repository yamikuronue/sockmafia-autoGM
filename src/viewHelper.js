'use strict';

const Moment = require('moment');

module.exports = {
    drawBoxAroundText: function(text) {
        //Find the longest line
        const lines = text.split('\n');
        let length = 0;
        for (const line of lines) {
            if (length < line.length) {
                length = line.length;
            }
        }
        
        let output = '';
        let longEdge = '';
        
        //We are adding four characters to the length: two spaces, and two pipes
        //But we also need the corners to be special
        //Therefore, we add two to the length of the longest line to get 
        //the number of bars along the long edges
        for (let i = 0; i < length + 2; i++) {
            longEdge += '═';
        }
        
        for (let i = 0; i < lines.length; i++) {
            let padding = '';
            for (let j = 0; j < (length - lines[i].length); j++) {
                padding += ' ';
            }
            lines[i] = `║ ${lines[i]}${padding} ║`;
        }
        output += `╔${longEdge}╗\n${lines.join('\n')}\n╚${longEdge}╝\n`;
        return output;
    },
    
    makeList: function(players) {
        if (!players || !Array.isArray(players)) {
            return 'nobody';
        }
        
        const length = players.length;
        const lastIndex = length - 1;
        
        if (length === 0) {
            return 'nobody';
        }
        
        if (length === 1) {
            return '@' + players[0];
        }
        
        if (length === 2) {
            return `@${players[0]} and @${players[1]}`;
        }
        
        let list = '';
        for (let i = 0; i < lastIndex; i++) {
            list += '@' + players[i] + ', ';
        }
        list += 'and @' + players[lastIndex];
        
        return list;
    },
    
    relativeToAbsoluteTime: function(relative) {
        const parts = relative.split(' ');
        const timestamp = new Moment().add(parts[0], parts[1]);
        return timestamp.utc().format('MMM Do [at] HH:mm [UTC]');
    }
};
