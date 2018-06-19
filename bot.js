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
//     let players = message.guild.roles.find("name", "Playing Game").members;
    /*const args = message.content.slice(prefix.length).trim().split(/ +/g);
    const command = args.shift().toLowerCase();*/
    
    if (message.content === prefix + "ping") {
        message.channel.send('Pong!');
  	} else if (message.content === prefix + "help") {
        message.channel.send({
            embed: {
                //color: 3447003,
                author: {
                    name: "> Help <"
                },
                title: "List of commands",
                fields: [
                    {
                        name: "General",
                        value: "`help` - Lists bot commands\n"
                            + "`info` - Gives info about the _Town of Charlotte_ game and how to play"
                    },
                    // I know this isn't especially syntactually good, but it makes it easier to read
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
    } else if (message.content === prefix + "game-players") {
        message.channel.send("Hallo!");
        /*message.channel.send({
            embed: {
                //color: 3447003,
                author: {
                    name: "> Players <"
                },
                title: "List of the players of the current game",
                fields: [
                    {
                        name: "Users:",
                        value: "Test"
                    },
                    {
                        name: "Number:",
                        value: ""
                    }
                ],
                footer: {
                    text: "Not what you're looking for? " + prefix + "help"
                }
            }
        });*/
    } else if (message.content === prefix + "logieboi") {
        message.channel.send(":bear: ***Logie da Bear!*** :bear:");
    } else if (message.content === prefix + "konurpapa") {
        message.channel.send("_Woot!_");
    }
});

Client.login(process.env.BOT_TOKEN);
