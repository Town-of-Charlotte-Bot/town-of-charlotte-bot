/*
    Some code taken from the following:
    https://gist.github.com/eslachance/3349734a98d30011bb202f47342601d3
*/

// What we need up-front
const Discord = require("discord.js");
const client = new Discord.Client();
const package = require("./package.json");
const commands = require("./info/commands.json");
const prefix = package.settings.prefix;

// Database of all characters
var characters = {
    good: {
        jailor: {
            user: "",
            state: "alive",
            explainTxt: "Lock up 1 person each night. Target can't perform their night action and is safe from shots. You may execute your target once.",
            abilities: {
                block: [Infinity, "You were locked up by the Jailor!"],
                kill: [1, "You were executed by the Jailor!"]
            },
            immunity: {
                night: false,
                bite: false,
                detect: false
            }
        }
    },
    evil: {
        
    },
    neutral: {
        
    }
};
// List of players in the game
var currentPlayers = [];
var oldPlayers = [];

// Boolean that triggers if a game is available for joining
var gameNow = false;

// When the bot loads
client.on("ready", () => {
    console.log(`Ready for action! Serving ${client.users.size} users, in ${client.channels.size} channels of ${client.guilds.size} servers.`);
});

// Server joining/leaving
client.on("guildCreate", guild => {
    console.log(`Joined new server: ${guild.name} (id: ${guild.id}). Serving ${guild.memberCount} new members!`);
});
client.on("guildDelete", guild => {
    console.log(`Removed from server: ${guild.name} (id: ${guild.id}).`);
});

// When a message is posted
client.on("message", async message => {
    if (message.author.bot) return;
    if (message.content.indexOf(prefix) !== 0) return;
    
    // Simple code that helps us separate the command from its arguments
    const args = message.content.slice(prefix.length).trim().split(/ +/g);
    const command = args.shift().toLowerCase();
    
    // Get the Gamemaster role
    const role = message.member.roles.some(r=>["Gamemaster"].includes(r.name));
    
    // All our commands
    switch (command) {
        case "help":
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
                                + "`ping` - Ping the bot, and receive a latency check.\n"
                                + "`info` - Gives info about the _Town of Charlotte_ game and how to play"
                        },
                        {
                            name: "In-Game",
                            value: "`game join` - Join the currently initiated game\n"
                                + "`game stats` - Show vital-statistics about the current game\n"
                                + "`game players` - Lists all players in the current game\n"
                                + "`game role` - DMs the user their role and abilities in the current game\n"
                                + "`players dead` - Lists the players who are dead in the current game\n"
                                + "`players alive` - Lists the players who are alive in the current game"
                        },
                        {
                            name: "For Gamemasters",
                            value: "`delete x` - Bulk-delete messages, where _x_ is the number of messages to delete\n"
                                + "`game start` - Start a new game for players to join\n"
                                + "`game begin` - Begin the game with the players that have joined\n"
                                + "`game end` - End the current game\n"
                                + "`players list` - DMs the user a list of all players in the current game and their respective roles"
                        }
                    ],
                    footer: {
                        text: "Command Prefix: " + prefix
                    }
                }
            }).catch(error => message.reply(`Failed to perform action: ${error}`));
            break;
        case "ping":
            const temp = await message.channel.send("Pinging...");
            temp.edit(`Pong! Latency is ${temp.createdTimestamp - message.createdTimestamp}ms.`);
            break;
        case "info":
            message.channel.send({
                embed: {
                    //color: 3447003,
                    author: {
                        name: "> Game Info <"
                    },
                    title: "How to play the Town of Charlotte game",
                    fields: [
                        {
                            name: "Goal",
                            value: "Info"
                        },
                        {
                            name: "Starting a game",
                            value: "More info"
                        },
                        {
                            name: "During the game",
                            value: "Even more info"
                        }
                    ],
                    footer: {
                        text: "Not what you're looking for? " + prefix + "help"
                    }
                }
            }).catch(error => message.reply(`Failed to perform action: ${error}`));
            break;
        case "game":
            /*let player = message.guild.roles.find("name", "Playing Game");
            console.log(`Got ${player.size} members with that role:\n${JSON.stringify(player)}`);
            
            const guildNames = client.guilds.map(g => g.name).join("\n");
            console.log(guildNames);*/
            
            if (args[0] === "start") {
                if (!role) return message.reply("You are not authorized to perform this action.");
                if (role) {

                }
            }
            
            // game players command
            /*message.channel.send({
                embed: {
                    //color: 3447003,
                    author: {
                        name: "> Players <"
                    },
                    title: "List of players in the current game",
                    fields: [
                        {
                            name: "Users",
                            value: "Test1"
                        },
                        {
                            name: "Number",
                            value: "Test2"
                        }
                    ],
                    footer: {
                        text: "Not what you're looking for? " + prefix + "help"
                    }
                }
            }).catch(error => message.reply(`Failed to perform action: ${error}`));*/
            break;
        case "players":
            message.channel.send({
                embed: {
                    //color: 3447003,
                    author: {
                        name: "> Players <"
                    },
                    title: "List of players in the current game",
                    fields: [
                        {
                            name: "Users",
                            value: "Test1"
                        },
                        {
                            name: "Number",
                            value: "Test2"
                        }
                    ],
                    footer: {
                        text: "Not what you're looking for? " + prefix + "help"
                    }
                }
            }).catch(error => message.reply(`Failed to perform action: ${error}`));
            break;
        case "delete":
            if (!role) return message.reply("You are not authorized to perform this action.");
            if (role) {
                const deleteCount = Number(args[0]);

                if (!deleteCount) return message.reply("Please provide the number of messages to delete.");
                else if (deleteCount < 2 || deleteCount > 100) return message.reply("The number you provided is either too small or too large.");

                const fetched = await message.channel.fetchMessages({limit: deleteCount});
                message.channel.bulkDelete(fetched).catch(error => message.reply(`Failed to perform action: ${error}`));
                console.log(`${message.member} cleared ${deleteCount} messages in ${message.channel}.`);
                message.reply(`_Cleared ${deleteCount} messages._`);
            }
            break;
        case "logieboi":
            message.channel.send(":bear: ***Logie da Bear!*** :bear:");
            break;
        case "konurpapa":
            message.channel.send("_Woot!_");
    }
});

client.login(process.env.BOT_TOKEN);
