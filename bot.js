// Main
const Discord = require("discord.js");
const Client = new Discord.Client();

const prefix = "//";
var frameCount = 0;

Client.on("ready", () => {
    console.log('I am ready!');
    Client.user.setGame('Town of Charlotte');
});

Client.on("message", message => {
    if (message.content === prefix + "ping") {
        message.reply('pong');
  	} else if (message.content === prefix + "help") {
        message.reply("\n\n**Help**\n\n`//help` - Displays a list of bot commands\n");
    }
});

Client.login(process.env.BOT_TOKEN);
