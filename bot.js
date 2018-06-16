// Main
const Discord = require('discord.js');
const Client = new Discord.Client();

var frameCount = 0;

Client.on('ready', () => {
    console.log('I am ready!');
});

Client.on('message', message => {
    if (message.content === 'ping') {
        message.reply('pong');
  	}
});

setInterval(function() {
    frameCount++;
    var request = new XMLHttpRequest();
    request.onload = function() {
        console.log(this.response);
    };
    request.open("GET", "https://www.khanacademy.org/api/internal/discussions/scratchpad/6221507115941888/comments?sort=2", true);
    request.send();
    
    // Borrowed code from a friend
    /*if (frameCount % 10000 === 0) {
        var randOfTheDay = Math.floor(Math.random() * games.length);
        if (blazeIsStreaming) {
            Client.setStreaming("Blaze programming me!", "https://twitch.tv/blazeprogramming", 1);
        } else {
            Client.setPlayingGame(games[randOfTheDay]);
        }
    }*/
}, 1);

Client.setPlayingGame("Town of Charlotte");

Client.login(process.env.BOT_TOKEN);
