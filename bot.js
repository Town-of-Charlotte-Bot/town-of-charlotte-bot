// Main
const Discord = require("discord.js");
const Client = new Discord.Client();

const prefix = "//";
//var data = JSON.parse(fs.readFileSync("package.json", "utf8"));

Client.on("ready", () => {
    console.log('I am ready!');
    Client.user.setPresence({ status: 'online', game: { name: 'GAME' } });
});

//const args = message.content.slice(prefix.length).trim().split(/ +/g);
//const command = args.shift().toLowerCase();

Client.on("message", message => {
    if (message.content === prefix + /ping/i) {
        message.reply('Pong!');
  	} else if (message.content === prefix + "help") {
        message.reply("\n\n__**Help**__\n\n*General Commands*\n`//help` - Lists bot commands\n\n*Game Commands*\n`//game-current` - Shows stats about the current game");
    } else if (message.content === prefix + "logieboi") {
        message.reply("***Logie da Bear!***");
    }
});

Client.login(process.env.BOT_TOKEN);
