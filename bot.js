const Discord = require("discord.js");
const Client = new Discord.Client();

// Main
const prefix = "//";
//var data = JSON.parse(fs.readFileSync("package.json", "utf8"));

// On-load
Client.on("ready", () => {
    console.log('Ready for action!');
});

Client.on("message", message => {
    const args = message.content.slice(prefix.length).trim().split(/ +/g);
    const command = args.shift().toLowerCase();
    
    if (message.content === prefix + /ping/i) {
        message.reply('Pong!');
  	} else if (message.content === prefix + "help") {
        message.reply("\n\n__**Help**__\n\n*General Commands*\n`//help` - Lists bot commands\n\n*Game Commands*\n`//game-current` - Shows stats about the current game\n`//game-day` - Gives the day of the current game\n`//game-dead` - Lists the players who are dead in the current game\n`//game-alive` - Lists the players who are alive in the current game");
    } else if (message.content === prefix + "logieboi") {
        message.reply("***Logie da Bear!***");
    }
});

Client.login(process.env.BOT_TOKEN);
