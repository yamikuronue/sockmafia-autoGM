'use strict';

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
        for (let i = 0; i < length + 4; i++) {
            longEdge += '=';
        }
        
        for (let i = 0; i < lines.length; i++) {
            let padding = '';
            for (let j = 0; j < (length - lines[i].length); j++) {
                padding += ' ';
            }
            lines[i] = `| ${lines[i]}${padding} |`;
        }
        output += `${longEdge}\n${lines.join('\n')}\n${longEdge}`;
        return output;
    }
};
