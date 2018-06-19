const Discord = require("discord.js");
const Client = new Discord.Client();

// Main
const prefix = "//";
//var data = JSON.parse(fs.readFileSync("package.json", "utf8"));

// Load
Client.on("ready", () => {
    console.log('Ready for action!');
    Clinet.setGame(prefix + "help");
});

// Message
Client.on("message", message => {
    const args = message.content.slice(prefix.length).trim().split(/ +/g);
    const command = args.shift().toLowerCase();
    
    if (message.content === prefix + /ping/i) {
        message.channel.send('Pong!');
  	} else if (message.content === prefix + "help") {
        // I know this isn't especially syntactually good, but it makes it easier to read
        message.channel.send({
            embed: {
                color: 3447003,
                author: {
                    name: "> Help <"
                },
                title: "List of commands",
                fields: [
                    {
                        name: "General",
                        value: "`help` - Lists bot commands"
                    },
                    {
                        name: "Game",
                        value: "`game-join` - Join the currently initiated game\n"
                            + "`game-stats` - Show vital-statistics about the current game\n"
                            + "`game-players` - Lists all players in the current game\n"
                            + "`players-dead` - Lists the players who are dead in the current game\n"
                            + "`players-alive` - Lists the players who are alive in the current game"
                    },
                    {
                        name: "Gamemaster Commands",
                        value: "`game-initiate` - Initiate a new game for players to join\n"
                            + "`game-start` - Start a new game with the players that have joined\n"
                            + "`game-end` - End the current game\n"
                            + "`players-good` - DMs the user a list of all good players in the current game\n"
                            + "`players-evil` - DMs the user a list of all evil players in the current game\n"
                            + "`players-neutral` - DMs the user a list of all neutral players in the current game\n"
                            + "`players-list` - DMs the user a list of all players in the current game and their respective roles"
                    }
                ],
                footer: {
                    text: "Command Prefix: " + prefix
                }
            }
        });
    } else if (message.content === prefix + "logieboi") {
        message.channel.send("***Logie da Bear!***");
    } else if (message.content === prefix + "konurpapa") {
        message.channel.send("_Woot!_");
    }
});

Client.login(process.env.BOT_TOKEN);
