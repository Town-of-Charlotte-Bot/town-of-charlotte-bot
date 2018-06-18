const Discord = require("discord.js");
const Client = new Discord.Client();

// Main
const prefix = "//";
//var data = JSON.parse(fs.readFileSync("package.json", "utf8"));

// Load
Client.on("ready", () => {
    console.log('Ready for action!');
});

// Message
Client.on("message", message => {
    const args = message.content.slice(prefix.length).trim().split(/ +/g);
    const command = args.shift().toLowerCase();
    
    if (message.content === prefix + /ping/i) {
        message.channel.send('Pong!');
  	} else if (message.content === prefix + "help") {
        var txt = "\n\n__** Help **__\n";
        txt += "\n_General Commands_";
        txt += "\n`//help` - Lists bot commands\n";
        txt += "\n_Game Commands_\n";
        txt += "`//game-current` - Shows stats about the current game\n";
        txt += "`//game-day` - Gives the day of the current game\n";
        txt += "`//game-dead` - Lists the players who are dead in the current game\n";
        txt += "`//game-alive` - Lists the players who are alive in the current game";
        message.channel.send(txt);
    } else if (message.content === prefix + "logieboi") {
        message.channel.send("***Logie da Bear!***");
    } else if (message.content === prefix + "konurpapa") {
        message.channel.send("_Woot!_");
    }
});

Client.login(process.env.BOT_TOKEN);
