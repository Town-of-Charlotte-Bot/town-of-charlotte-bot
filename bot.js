// Main
const Discord = require("discord.js");
const Client = new Discord.Client();

const prefix = "//";
var frameCount = 0;

Client.on("ready", () => {
    console.log('I am ready!');
});

Client.on("message", message => {
    if (message.content === prefix + "ping") {
        message.reply('pong');
  	} else if (message.content === prefix + "help") {
        message.reply("**Help**\n\n");
    }
});

//Client.setPlayingGame("Town of Charlotte");

Client.login(process.env.BOT_TOKEN);
