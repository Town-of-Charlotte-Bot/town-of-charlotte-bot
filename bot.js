/*
    Some help from the following:
    https://gist.github.com/eslachance/3349734a98d30011bb202f47342601d3
    https://anidiotsguide_old.gitbooks.io/discord-js-bot-guide/content/information/understanding-asyncawait.html
*/

// What we need to start off with
const Discord = require("discord.js");
const client = new Discord.Client();
const package = require("./package.json");
const commands = require("./info/commands.json");
const prefix = package.settings.prefix;
var logs = [];

// Store internal game data
var game = {
    day: 0,
    nightlyDead: [],
    alive: {},
    dead: [],
    players: {},
    master: ""
};

/*
    Actions (so I can keep them straight):
    lock - role-blocks target, protects from harm
    block - role-blocks target
    kill - kills target
    clues - gives two options for target's role
    revive - makes the target live
*/

// Simple database of all roles (thought about reading/writing to a JSON file, but this is easier)
var roles = {
    good: {
        Investigator: {
            state: null,
            txt: "Target 1 person each night for a clue to their role (lists some possible roles).",
            abilities: {
                clues: [Infinity]
            },
            immunity: {
                night: false,
                bite: false,
                detect: false
            }
        },
        Jailor: {
            state: null,
            txt: "Lock up 1 person each night. Target can't perform their night action and is safe from shots. You may execute your target once.",
            abilities: {
                lock: [Infinity, "You were locked up by the Jailor!"],
                kill: [1, "You were executed by the Jailor!"]
            },
            immunity: {
                night: false,
                bite: false,
                detect: false
            }
        },
        Doctor: {
            state: null,
            txt: "Heal 1 person each night, preventing them from dying.",
            abilities: {
                revive: [Infinity]
            },
            immunity: {
                night: false,
                bite: false,
                detect: false
            }
        }
    },
    evil: {
        Godfather: {
            state: null,
            txt: "Selects target for mafia to kill, if no mafioso you will perform it.",
            abilities: {
                kill: [Infinity, "You were killed by the Mafia!"]
            },
            immunity: {
                night: true,
                bite: true,
                detect: true
            }
        },
        Mafioso: {
            state: null,
            txt: "Carry out the Godfather's order and kill his target. Becomes Godfather if he dies.",
            abilities: {
                
            },
            immunity: {
                night: true,
                bite: true,
                detect: true
            }
        }
    },
    neutral: {
        "Serial Killer": {
            state: null,
            txt: "Kills someone each night.",
            abilities: {
                
            },
            immunity: {
                night: true,
                bite: true,
                detect: true
            },
            wins: "solo"
        }
    }
};

// Iterates to represent which type of role is being given, the ratio being 3 good to 1 evil to 1 neutral
var roleType = 1;

// Boolean that triggers if a game is available for joining
var gameNow = false;
// Boolean that triggers if a game is being played
var playing  = false;

// When the bot loads
client.on("ready", () => {
    console.log(`Ready for action! Serving ${client.users.size} users in ${client.channels.size} channels of ${client.guilds.size} servers.`);
    //client.user.setGame("Town of Charlotte");
});

// Debugging
client.on("debug", debug => {
    logs.push(debug);
});

// When a message is posted
client.on("message", async message => {
    // Ignore bots
    if (message.author.bot) return;
    // Ignore anything that isn't a command (doesn't start with the prefix)
    if (message.content.indexOf(prefix) !== 0) return;
    
    // Simple code that helps us separate the command and its arguments
    const args = message.content.slice(prefix.length).trim().split(/ +/g);
    const command = args.shift().toLowerCase();
    
    // Spent forever trying to get the bot to read DMs and then realized it's the same code as the other command stuff
    switch (command) {
        case "action":
            switch (args[0]) {
                case "kill":
                    if (game.alive[args[1]] === null) {
                        return client.fetchUser(game.players[args[1]]).then(user => {
                            user.send("You died!");
                        }).catch(error => message.author.send(`Failed to perform action: ${error}`));
                    } else {
                        return message.author.send("That player could not be killed. Perhaps you spelled the name incorrectly, or the player is already dead.");
                    }
                    break;
                case "block":
                    return message.author.send("Blocking");
            }
    }
    
    // Check if the user has the Gamemaster role (AKA rights)
    const role = message.member.roles.some(r=>["Gamemaster"].includes(r.name));
    // Convert the array of players into a string, and check if the user is one of them
    const playerIndex = game.alive.indexOf(message.author.username);
    // Grab the playing role
    const playingRole = message.guild.roles.find("name", "Playing Game");
    
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
                            value: "`print x` - Print the output of the proceeding code, where _x_ is the code to run"
                        }
                    ],
                    footer: {
                        text: `Command Prefix: ${prefix}`
                    }
                }
            }).catch(error => message.reply(`Failed to perform action: ${error}`));
            break;
        case "ping":
            const temp = await message.channel.send("Pinging...").catch(error => message.reply(`Failed to perform action: ${error}`));
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
                        text: `Not what you're looking for? ${prefix}help`
                    }
                }
            }).catch(error => message.reply(`Failed to perform action: ${error}`));
            break;
        case "game":
            switch (args[0]) {
                case "join":
                    if (!gameNow) message.reply("There is no game to join. Perhaps a game has not been started, or one is already in progress.");
                    if (gameNow && playerIndex === -1) {
                        game.players[message.author.username] = message.author.id;
                        game.alive.push(message.author.username);
                        message.member.addRole(playingRole).catch(error => message.reply(`Failed to perform action: ${error}`));
                        
                        // The iterating thing that decides what role is being given (need to rewrite all this)
                        switch (roleType) {
                            case 1:
                            case 2:
                            case 3:
                                game.alive[message.author.username] = Object.keys(roles.good)[Math.round(Math.random(0, roles.length - 1))];
                                break;
                            case 4:
                                game.alive[message.author.username] = Object.keys(roles.evil)[Math.round(Math.random(0, roles.length - 1))];
                                break;
                            case 5:
                                game.alive[message.author.username] = Object.keys(roles.neutral)[Math.round(Math.random(0, roles.length - 1))];
                        }
                        if (roleType < 5) roleType++;
                        if (roleType >= 5) roleType = 1;
                        
                        message.channel.send(`_${message.author} has joined the game._`);
                        
                        // Check roleType and return the appropriate string
                        var type = (roleType > 0 && roleType < 4) ? "good" : (roleType === 4) ? "evil" : "neutral";
                        
                        // Send a message to the player with their role and the explanation
                        message.author.send(`Your role is _${game.alive[message.author.username]}_.\n${roles[type][game.alive[message.author.username]].txt}`).catch(error => message.reply(`Failed to perform action: ${error}`));
                    }
                    if (gameNow && playerIndex !== -1) {
                        message.reply("You have already joined the game.");
                    }
                    break;
                case "leave":
                    if (playerIndex === -1) message.reply("There is no game for you to leave.");
                    if (gameNow && playerIndex > -1) message.reply("You may not leave until the game has begun.");
                    if (playing && playerIndex > -1) {
                        delete game.players[message.author.username];
                        delete game.alive[message.author.username];
                        message.member.removeRole(playingRole).catch(error => message.reply(`Failed to perform action: ${error}`));
                        
                        message.channel.send(`_${message.author} has left the game._`).catch(error => message.reply(`Failed to perform action: ${error}`));
                    }
                    break;
                case "players":
                    if ((!gameNow && !playing) || game.alive.length < 1) message.reply("There are no players to show. Perhaps a game has not been started, or there are no players yet in the current game.");
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
                                    text: `Not what you're looking for? ${prefix}help`
                                }
                            }
                        }).catch(error => message.reply(`Failed to perform action: ${error}`));
                    }
                    break;
                case "start":
                    if (!role) message.reply("You are not authorized to perform this action.");
                    if (role && (gameNow || playing)) message.reply("There is already a game in progress.");
                    if (role && !gameNow && !playing) {
                        gameNow = true;
                        game.master = message.author.username;
                        message.author.send("You are the Gamemaster for the current game. After each night the action log will be DMed to you, and during the game you can view secret stats about the players.");
                        message.channel.send({
                            embed: {
                                //color: 3447003,
                                author: {
                                    name: "> Game Started <"
                                },
                                fields: [
                                    {
                                        name: "A new Town of Charlotte game has just been started.",
                                        value: `To join the game, type \`${prefix}game join\` and you will be DMed your role.`
                                    }
                                ],
                                footer: {
                                    text: `Need help? ${prefix}help`
                                }
                            }
                        }).catch(error => message.reply(`Failed to perform action: ${error}`));
                    }
                    break;
                case "end":
                    if (!role) message.reply("You are not authorized to perform this action.");
                    if (role && (gameNow || !playing)) message.reply("There is no current game to end. If a game has just been started, type `//game begin` and then `//game end`.");
                    if (role && !gameNow && playing) {
                        // Reset the game object
                        game = {
                            day: 0,
                            nightlyDead: [],
                            alive: {},
                            dead: [],
                            players: {},
                            master: ""
                        };
                        message.channel.send("The current game has been ended.").catch(error => message.reply(`Failed to perform action: ${error}`));
                    }
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
                                    text: `Need help? ${prefix}help`
                                }
                            }
                        }).catch(error => message.reply(`Failed to perform action: ${error}`));
                    }
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
                                    text: `Not what you're looking for? ${prefix}help`
                                }
                            }
                        }).catch(error => message.reply(`Failed to perform action: ${error}`));
                    }
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
                        text: `Not what you're looking for? ${prefix}help`
                    }
                }
            }).catch(error => message.reply(`Failed to perform action: ${error}`));
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
            break;
        case "logs":
            //message.channel.send(logs.join("\n"));
            message.reply("This command is not working yet.");
            break;
        case "logieboi":
            message.channel.send(":bear: ***Logie da Bear!*** :bear:");
            break;
        case "konurpapa":
            message.channel.send("_Woot!_");
    }
    if (message.content.startsWith(prefix + "print")) {
        if (!role) message.reply("You are not authorized to perform this action.");
        if (role) {
            var content = eval(message.content.substr(7));
            if (message.channel.send(content) == "") content = "\n";
            message.channel.send(content);
        }
    }
});

client.login(process.env.BOT_TOKEN);
