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
        // I know this isn't very syntactually good, but it's easier to read
        var txt = "\n\n__** Help **__\n"
        + "\n_General Commands_"
        + "\n`//help` - Lists bot commands\n"
        + "\n_Game Commands_\n"
        + "`//game-current` - Shows stats about the current game\n"
        + "`//game-day` - Gives the day of the current game\n"
        + ""
        + "`//game-dead` - Lists the players who are dead in the current game\n"
        + "`//game-alive` - Lists the players who are alive in the current game";
        message.channel.send(txt);
    } else if (message.content === prefix + "logieboi") {
        message.channel.send("***Logie da Bear!***");
    } else if (message.content === prefix + "konurpapa") {
        message.channel.send("_Woot!_");
    }
});

Client.login(process.env.BOT_TOKEN);
