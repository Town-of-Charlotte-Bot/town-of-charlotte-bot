// BACKUP FILE

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

/*
    Internal Game Data Keys
    
    day - The in-game day
    nightlyDead - The players who died in the previous night; key: username, data: role
    alive - The players who are alive; key: username, data: role
    dead - The players who have died; key: username, data: role
    players - The list of players; key: username, data: id
    master - The Gamemaster
*/
var game = {
    day: 0,
    nightlyDead: {},
    alive: {},
    dead: {},
    players: {},
    master: "",
    actions: {
        p5: {},
        p4: {},
        p3: {},
        p2: {},
        p1: {},
        p0: {},
        p_1: {}
    }
};

var roles = {
    Investigator: {
        txt: "Target 1 person each night for a clue to their role (lists some possible roles).",
        priority: "p1",
        abilities: {
            investigate: [Infinity]
        },
        immunity: {
            night: false,
            bite: false,
            detect: false
        }
    },
    Jailor: {
        txt: "Lock up 1 person each night. Target can't perform their night action and is safe from shots. You may execute your target once.",
        priority: "p4",
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
        txt: "Heal 1 person each night, preventing them from dying.",
        priority: "p2",
        abilities: {
            heal: [Infinity]
        },
        immunity: {
            night: false,
            bite: false,
            detect: false
        }
    },
    Godfather: {
        txt: "Selects target for mafia to kill, if no mafioso you will perform it.",
        priority: "p3",
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
        txt: "Carry out the Godfather's order and kill his target. Becomes Godfather if he dies.",
        priority: "p3",
        abilities: {

        },
        immunity: {
            night: false,
            bite: false,
            detect: false
        }
    },
    "Serial Killer": {
        txt: "Kills someone each night.",
        priority: "p3",
        abilities: {

        },
        immunity: {
            night: true,
            bite: true,
            detect: false
        },
        wins: "solo"
    }
};

var roleType = 1;

var gameNow = false;
var playing  = false;

client.on("ready", () => {
    client.user.setGame("Town of Charlotte");
    console.log(`Ready for action! Serving ${client.users.size} users in ${client.channels.size} channels of ${client.guilds.size} servers.`);
});

client.on("debug", debug => {
    logs.push(debug);
});

// When a message is posted
client.on("message", async message => {
    if (message.author.bot) return;
    if (message.content.indexOf(prefix) !== 0) return;
    
    const args = message.content.slice(prefix.length).trim().split(/ +/g);
    const command = args.shift().toLowerCase();
    const listed = (game.alive[message.author.username] === null) ? false : true;
    
    switch (command) {
        case "action":
            if (listed) {
                let gameAction = function(action) {
                    const ability = roles[game.alive[message.author.username]].abilities[action];

                    if (game.alive[message.author.username] === undefined) return message.author.send("You are not playing in the current game.");
                    if (args[1] === null) return message.author.send("You must provide the username of your target.");
                    if (ability === undefined || ability[0] < 1) return message.author.send(`You do not have the ability to ${action} anyone.`);
                    if (game.alive[args[1]] === null) return message.author.send(`That player could not be ${action}ed. Perhaps you spelled the name incorrectly, or the player is dead.`);
                    if (game.alive[args[1]] !== null && ability[0] >= 1) {
                        game.actions[roles[game.alive[message.author.username]].priority][message.author.username] = action;
                        return client.fetchUser(game.players[args[1]]).then(user => {
                            message.author.send(`_${args[1]} will be ${action}ed._`);
                            if (ability[1] !== undefined) user.send(ability[1]);
                        }).catch(error => message.author.send(`Failed to perform action: ${error}`));
                    }
                };
                
                /*
                    Role Actions (so I can keep them straight):

                    lock - role-blocks target, protects from harm
                    block - role-blocks target
                    kill - kills target
                    investigate - gives two options for target's role
                    heal - heals target
                */
                if (args[0] === "lock") gameAction("lock");
                else if (args[0] === "block") gameAction("block");
                else if (args[0] === "kill") gameAction("kill");
                else if (args[0] === "investigate") gameAction("investigate");
                else if (args[0] === "heal") gameAction("heal");
                else return message.author.send("That action does not exist. Perhaps you spelled it incorrectly, or the action you were thinking of is different.");
            } else {
                return message.author.send("You are not allowed to use this command. Perhaps you have been role-blocked, or you are not alive in the current game.");
            }
    }
    
    const role = message.member.roles.some(r=>["Gamemaster"].includes(r.name));
    const playingRole = message.guild.roles.find("name", "Playing Game");
    
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
                                + "`info` - Gives info about the _Town of Charlotte_ game and how to play\n"
                                + "`tip` - Get a random gameplay tip"
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
        case "tip":
            // Get a random gameplay tip!
            break;
        case "game":
            switch (args[0]) {
                case "join":
                    if (!gameNow) message.reply("There is no game to join. Perhaps a game has not been started, or one is already in progress.");
                    if (gameNow && listed) {
                        game.players[message.author.username] = message.author.id;
                        message.member.addRole(playingRole).catch(error => message.reply(`Failed to perform action: ${error}`));
                        // REWRITE THE FOLLOWING
                        switch (roleType) {
                            case 1:
                            case 2:
                            case 3:
                                game.alive[message.author.username] = Object.keys(roles)[Math.floor(Math.random() * roles.length)];
                                break;
                            case 4:
                                game.alive[message.author.username] = Object.keys(roles)[Math.floor(Math.random() * roles.length)];
                                break;
                            case 5:
                                game.alive[message.author.username] = Object.keys(roles)[Math.floor(Math.random() * roles.length)];
                        }
                        message.channel.send(`_${message.author} has joined the game._`);
                        
                        return message.author.send(`Your role is _${game.alive[message.author.username]}_.\n${roles[game.alive[message.author.username]].txt}`).catch(error => message.reply(`Failed to perform action: ${error}`));
                    }
                    if (gameNow && listed) {
                        message.reply("You have already joined the game.");
                    }
                    break;
                case "leave":
                    if (gameNow && listed) return message.reply("You may not leave until the game has begun.");
                    if (playing && listed) {
                        delete game.players[message.author.username];
                        delete game.alive[message.author.username];
                        message.member.removeRole(playingRole).catch(error => message.reply(`Failed to perform action: ${error}`));
                        
                        return message.channel.send(`_${message.author} has left the game._`).catch(error => message.reply(`Failed to perform action: ${error}`));
                    }
                    if (listed) return message.reply("There is no game for you to leave.");
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
                                        value: Object.keys(game.alive).join("\n")
                                    },
                                    {
                                        name: "Number",
                                        value: Object.keys(game.alive).length
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
                        gameNow = false;
                        playing = false;
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
                                            + "Died last night:\n" + (Object.keys(game.nightlyDead).length >= 1) ? Object.keys(game.nightlyDead).join("\n") : "None"
                                    },
                                    {
                                        name: "Alive",
                                        value: (Object.keys(game.alive).length >= 1) ? Object.keys(game.alive).join("\n") : "None"
                                    },
                                    {
                                        name: "Dead",
                                        value: (Object.keys(game.dead).length >= 1) ? Object.keys(game.dead).join("\n") : "None"
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

                const fetched = await message.channel.fetchMessages({
                    limit: deleteCount
                });
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
