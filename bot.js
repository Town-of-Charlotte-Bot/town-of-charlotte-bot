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

// Store internal game data
var game = {
    day: 0,
    nightlyDead: [],
    alive: [],
    dead: []
};

// Database of all roles
var roles = {
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

// Boolean that triggers if a game is available for joining
var gameNow = false;
// Boolean that triggers if a game is being played
var playing  = false;

// When the bot loads
client.on("ready", () => {
    console.log(`Ready for action! Serving ${client.users.size} users in ${client.channels.size} channels of ${client.guilds.size} servers.`);
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
    message.channel.startTyping();
    
    // Ignore bots
    if (message.author.bot) return;
    // Ignore anything that isn't a command (doesn't start with the prefix)
    if (message.content.indexOf(prefix) !== 0) return;
    
    if (message.guild == null) {
        message.reply("_Woot!_");
    }
    
    // Simple code that helps us separate the command from its arguments
    const args = message.content.slice(prefix.length).trim().split(/ +/g);
    const command = args.shift().toLowerCase();
    
    // Check if the user has the Gamemaster role (AKA privileges)
    const role = message.member.roles.some(r=>["Gamemaster"].includes(r.name));
    // Convert the array of players into a string, and check if the user is one of them
    const playerIndex = game.alive.join().indexOf(message.member);
    
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
                                + "`ping` - Ping the bot, and receive a latency check\n"
                                + "`info` - Gives info about the _Town of Charlotte_ game and how to play"
                        },
                        {
                            name: "In-Game",
                            value: "`game join` - Join the started game\n"
                                + "`game leave` - Leave the current game\n"
                                + "`game stats` - Show vital statistics about the current game\n"
                                + "`game players` - Lists all players in the current game\n"
                                + "`roles list` - Lists all roles\n"
                                + "`roles x` - Provides specific info on a role, where _x_ is the role name"
                        },
                        {
                            name: "For Gamemasters",
                            value: "`delete x` - Bulk-delete messages, where _x_ is the number of messages to delete\n"
                                + "`game start` - Start a new game for players to join\n"
                                + "`game begin` - Begin the game with the players that have joined\n"
                                + "`game end` - End the current game\n"
                                + "`roles players` - DMs the user a list of all players in the current game and their respective roles"
                        },
                        {
                            name: "Dev Tools",
                            value: "`run x` - Run the proceeding code, where _x_ is the code to run\n"
                                + "`print x` - Print the output of the proceeding code, where _x_ is the code to run"
                        }
                    ],
                    footer: {
                        text: "Command Prefix: " + prefix
                    }
                }
            }).catch(error => message.reply(`Failed to perform action: ${error}`));
            message.channel.stopTyping();
            break;
        case "ping":
            const temp = await message.channel.send("Pinging...").catch(error => message.reply(`Failed to perform action: ${error}`));
            temp.edit(`Pong! Latency is ${temp.createdTimestamp - message.createdTimestamp}ms.`);
            message.channel.stopTyping();
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
            message.channel.stopTyping();
            break;
        case "game":
            switch (args[0]) {
                case "join":
                    if (!gameNow) message.reply("There is no game to join. Either a game has not been started, or one is already in progress.");
                    if (gameNow && playerIndex === -1) {
                        game.alive.push(message.member);
                        message.channel.send("_" + message.author + " has joined the game._");
                        message.author.send("You are now in the game!").catch(error => message.reply(`Failed to perform action: ${error}`));
                        console.log(message.author);
                    }
                    if (gameNow && playerIndex !== -1) {
                        message.reply("You have already joined the game.");
                    }
                    message.channel.stopTyping();
                    break;
                case "leave":
                    if (playerIndex === -1) message.reply("There is no game for you to leave.");
                    if ((gameNow || playing) && playerIndex !== -1) {
                        game.alive.splice(playerIndex, 1);
                        message.channel.send("_" + message.author + " has left the game._").catch(error => message.reply(`Failed to perform action: ${error}`));
                    }
                    message.channel.stopTyping();
                    break;
                case "players":
                    if ((!gameNow && !playing) || game.alive.length < 1) message.reply("There are no players to show. Either a game has not been started, or there are no players yet in the current game.");
                    else if (gameNow || playing) {
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
                                        value: game.alive.join("\n")
                                    },
                                    {
                                        name: "Number",
                                        value: game.alive.length
                                    }
                                ],
                                footer: {
                                    text: "Not what you're looking for? " + prefix + "help"
                                }
                            }
                        }).catch(error => message.reply(`Failed to perform action: ${error}`));
                    }
                    message.channel.stopTyping();
                    break;
                case "start":
                    if (!role) message.reply("You are not authorized to perform this action.");
                    if (role && (gameNow || playing)) message.reply("There is already a game in progress.");
                    if (role && !gameNow && !playing) {
                        gameNow = true;
                        message.channel.send({
                            embed: {
                                //color: 3447003,
                                author: {
                                    name: "> Game Started <"
                                },
                                fields: [
                                    {
                                        name: "A new Town of Charlotte game has just been started.",
                                        value: "To join the game, type `" + prefix + "game join` and you will be DMed your role."
                                    }
                                ],
                                footer: {
                                    text: "Need help? " + prefix + "help"
                                }
                            }
                        }).catch(error => message.reply(`Failed to perform action: ${error}`));
                    }
                    message.channel.stopTyping();
                    break;
                case "end":
                    if (!role) message.reply("You are not authorized to perform this action.");
                    if (role && (gameNow || !playing)) message.reply("There is no current game to end. If a game has just been started, type `//game begin` and then it may be ended.");
                    if (role && !gameNow && playing) {
                        playing = false;
                        game.alive = [];
                        game.day = 0;
                        message.channel.send("The current game has been ended.").catch(error => message.reply(`Failed to perform action: ${error}`));
                    }
                    message.channel.stopTyping();
                    break;
                case "begin":
                    if (!role) message.reply("You are not authorized to perform this action.");
                    if (role && !gameNow) message.reply("There is no current game to begin.");
                    if (role && gameNow) {
                        gameNow = false;
                        playing = true;
                        message.channel.send({
                            embed: {
                                //color: 3447003,
                                author: {
                                    name: "> Game Has Begun <"
                                },
                                fields: [
                                    {
                                        name: "The game is afoot!",
                                        value: "No more players may join. The game will now begin!"
                                    }
                                ],
                                footer: {
                                    text: "Need help? " + prefix + "help"
                                }
                            }
                        }).catch(error => message.reply(`Failed to perform action: ${error}`));
                    }
                    message.channel.stopTyping();
                    break;
                case "stats":
                    if (!playing) message.reply("There is no current game to show the stats of.");
                    if (playing) {
                        message.channel.send({
                            embed: {
                                //color: 3447003,
                                author: {
                                    name: "> Vital Statistics <"
                                },
                                title: "Current game stats",
                                fields: [
                                    {
                                        name: "General",
                                        value: "Day " + game.day + "\n"
                                            + "Died last night:\n" + (game.nightlyDead.length >= 1) ? game.nightlyDead.join("\n") : "None"
                                    },
                                    {
                                        name: "Alive",
                                        value: (game.alive.length >= 1) ? game.alive.join("\n") : "None"
                                    },
                                    {
                                        name: "Dead",
                                        value: (game.dead.length >= 1) ? game.dead.join("\n") : "None"
                                    }
                                ],
                                footer: {
                                    text: "Not what you're looking for? " + prefix + "help"
                                }
                            }
                        }).catch(error => message.reply(`Failed to perform action: ${error}`));
                    }
                    message.channel.stopTyping();
            }
            break;
        case "roles":
            message.channel.send({
                embed: {
                    //color: 3447003,
                    author: {
                        name: "> Game Roles <"
                    },
                    title: "List of all roles in the Town of Charlotte game",
                    fields: [
                        {
                            name: "Role1",
                            value: "Brief summary"
                        },
                        {
                            name: "Role2",
                            value: "Another brief summary"
                        }
                    ],
                    footer: {
                        text: "Not what you're looking for? " + prefix + "help"
                    }
                }
            }).catch(error => message.reply(`Failed to perform action: ${error}`));
            message.channel.stopTyping();
            break;
        case "delete":
            if (!role) message.reply("You are not authorized to perform this action.");
            if (role) {
                const deleteCount = Number(args[0]);

                if (!deleteCount) message.reply("Please provide the number of messages to delete.");
                else if (deleteCount < 2 || deleteCount > 100) message.reply("The number you provided is either too small or too large.");

                const fetched = await message.channel.fetchMessages({limit: deleteCount});
                message.channel.bulkDelete(fetched).catch(error => message.reply(`Failed to perform action: ${error}`));
                console.log(`${message.member} cleared ${deleteCount} messages in ${message.channel}.`);
                message.reply(`_Cleared ${deleteCount} messages._`);
            }
            message.channel.stopTyping();
            break;
        case "logieboi":
            message.channel.send(":bear: ***Logie da Bear!*** :bear:");
            message.channel.stopTyping();
            break;
        case "konurpapa":
            message.channel.send("_Woot!_");
            message.channel.stopTyping();
    }
    if (message.content.startsWith(prefix + "run")) {
        if (!role) message.reply("You are not authorized to perform this action.");
        if (role) {
            return eval(message.content.substr(5));
        }
        message.channel.stopTyping();
    }
    if (message.content.startsWith(prefix + "print")) {
        if (!role) message.reply("You are not authorized to perform this action.");
        if (role) {
            message.channel.send(eval(message.content.substr(7)));
        }
        message.channel.stopTyping();
    }
});

client.login(process.env.BOT_TOKEN);
