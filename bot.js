/*
    Some help from the following:
    https://gist.github.com/eslachance/3349734a98d30011bb202f47342601d3
    https://anidiotsguide_old.gitbooks.io/discord-js-bot-guide/content/information/understanding-asyncawait.html
*/

const Discord = require("discord.js");
const client = new Discord.Client();
const package = require("./package.json");
const commands = require("./info/commands.json");
const prefix = package.settings.prefix;
var logs = [];

/*
    Simple Database Explanation
    
    Role: {
    - The name of the role/object
    
    txt: "Hello"
    - The infotext about the role
    
    priority: "p3"
    - The priority of the role (6 to -1)
    
    abilities: {
    - The list of abilities the role has
    
    kill: [Infinity, "You died!"]
    - The type of action, the number of times it can be done per game, and the text sent to the target
    
    immunity: {
    - List of immunities, with booleans to show which ones the role has
    
    wins: "town"
    - The way the role wins; either town, mafia, or a neutral way (such as solo, with the winning side, etc.)
    
    canTargetSelf: 0
    - A number (either 0 or 1) representing whether the user can target themselves (if >0, can only be done 1 time per game)
    
    canSleep: true
    - Whether the role can sleep (choose not to perform an action)
    
    actsPerNight: 1
    - The number of actions the role can take per night
*/
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
            detect: false,
            roleBlock: false
        },
        wins: "town",
        canTargetSelf: 0,
        canSleep: true,
        actsPerNight: 1
    },
    Jailor: {
        txt: "Lock up 1 person each night. Target can't perform their night action and is safe from shots. You may execute your target once.",
        priority: "p6",
        abilities: {
            lock: [Infinity, "You were locked up by the Jailor!"],
            kill: [1, "You were attacked!"]
        },
        immunity: {
            night: false,
            bite: false,
            detect: false,
            roleBlock: false
        },
        wins: "town",
        canTargetSelf: 0,
        canSleep: true,
        actsPerNight: 2
    },
    Doctor: {
        txt: "Heal 1 person each night, preventing them from dying.",
        priority: "p2",
        abilities: {
            heal: [Infinity, "You were healed by the doctor!"]
        },
        immunity: {
            night: false,
            bite: false,
            detect: false,
            roleBlock: false
        },
        wins: "town",
        canTargetSelf: 1,
        canSleep: true,
        actsPerNight: 1
    },
    Godfather: {
        txt: "Select a target for mafia to kill, if no mafioso you will perform it.",
        priority: "p3",
        abilities: {
            kill: [Infinity, "You were attacked!"]
        },
        immunity: {
            night: true,
            bite: true,
            detect: true,
            roleBlock: true
        },
        wins: "solo",
        canTargetSelf: 0,
        canSleep: true,
        actsPerNight: 1
    },
    Mafioso: {
        txt: "Carry out the Godfather's order and kill his target. You become Godfather if he dies.",
        priority: "p3",
        abilities: {},
        immunity: {
            night: false,
            bite: false,
            detect: false,
            roleBlock: false
        },
        wins: "mafia",
        canTargetSelf: 0,
        canSleep: false,
        actsPerNight: 1
    },
    "Serial Killer": {
        txt: "Kills someone each night.",
        priority: "p3",
        abilities: {

        },
        immunity: {
            night: true,
            bite: true,
            detect: false,
            roleBlock: false
        },
        wins: "solo",
        canTargetSelf: 0,
        canSleep: false,
        actsPerNight: 1
    }
};

/*
    Internal Game-Data Keys
    
    day - The in-game day
    nightlyDead - The players who died in the previous night; key: username, data: role
    alive - The players who are alive; key: username, data: Object
    dead - The players who have died; key: username, data: Object
    master - The Gamemaster; stores username and id as .username and .id
    actions - The actions taken during the previous/current night; key: username, data: Object
    numActed - The number of players that have performed an action that night (no data stored, only .length property used)
*/
var game = {
    day: 0,
    nightlyDead: [],
    alive: {},
    dead: {},
    master: {},
    actions: {
        p6: {},
        p5: {},
        p4: {},
        p3: {},
        p2: {},
        p1: {},
        p0: {},
        p_1: {}
    },
    numActed: []
};

var setup = {
    roleType: 1,
    gameNow: false,
    playing: false,
    addPlayer: function(name, role) {
        return game.alive[name] = new Player(name, role);
    },
    players: []
};

var Player = function(name, role) {
    this.username = name.username;
    this.id = name.id;
    this.role = role;
    this.infoText = roles[this.role].txt;
    this.getAbilities = roles[this.role].abilities;
    this.canTargetSelf = roles[this.role].canTargetSelf;
    this.canSleep = roles[this.role].canSleep;
    this.actsPerNight = roles[this.role].actsPerNight;
    this.hasImmunity = function(type) {
        return roles[this.role].immunity[type];
    };
};

client.on("ready", () => {
    client.user.setGame("Town of Charlotte");
    console.log(`Ready for action! Serving ${client.users.size} users in ${client.channels.size} channels of ${client.guilds.size} servers.`);
});

client.on("debug", debug => {
    logs.push(debug);
});

var isEven = function(n) {
    return (n % 2 === 0) ? true : false;
};

var ifUserWithRole = function(role) {
    var string = JSON.stringify(game.alive);
    console.log(string);
    return (string.indexOf(role) === -1) ? false : true;
};

client.on("message", async message => {
    if (message.author.bot) return;
    if (message.content.indexOf(prefix) !== 0) return;
    
    const displayedName = message.author.username.replace(/ /g, "_");
    
    const args = message.content.slice(prefix.length).trim().split(/ +/g);
    const command = args.shift().toLowerCase();
    const listed = (game.alive[message.author.username] === undefined) ? false : true;
    
    // Run algorithm to figure out what happened during the night
    var runActions = function() {
        console.log(`Night ${game.day} is over. All players have done their actions!\n${JSON.stringify(game.actions.p6)}`);
    };
    
    if (command === "action") {
        var gameAction = function(action, target) {
            const authorRole = roles[game.alive[message.author.username].role];
            const ability = authorRole.abilities[action];

            if (game.alive[message.author.username] === undefined) return message.author.send("You are not playing in the current game.");
            if (authorRole.actsPerNight > 0) {
                if (action === "sleep") {
                    if (authorRole.canSleep) {
                        authorRole.actsPerNight = 0;
                        game.actions[authorRole.priority][message.author.username] = {
                            action: "sleep",
                            target: undefined
                        };
                        return message.author.send("You have gone to sleep.");
                    } else return message.author.send("You do not have the ability to sleep.");
                }
                if (args[1] === undefined) return message.author.send("You must provide the username of your target.");
                if (ability === undefined || ability[0] < 1) return message.author.send(`You do not have the ability to ${action} anyone.`);
                if (game.alive[args[1]] === undefined) return message.author.send(`That player could not be ${action}ed. Perhaps you spelled the name incorrectly, or the player is dead.`);
                if (message.author.username === target) {
                    if (authorRole.canTargetSelf > 0) {
                        ability[0]--;
                        authorRole.canTargetSelf--;
                        authorRole.actsPerNight--;
                        game.actions[authorRole.priority][message.author.username] = {
                            action: action,
                            target: target
                        };
                        return message.author.send(`_You ${action}ed yourself._`);
                    } else return message.author.send(`You can't ${action} yourself.`);
                }
                if (game.alive[args[1]] !== undefined && ability[0] >= 1) {
                    ability[0]--;
                    authorRole.actsPerNight--;
                    game.actions[authorRole.priority][message.author.username] = {
                        action: action,
                        target: target
                    };
                    return client.fetchUser(game.alive[args[1]].id).then(user => {
                        message.author.send(`_${args[1]} will be ${action}ed._`);
                        if (ability[1] !== undefined) user.send(ability[1]);
                    }).catch(error => message.author.send(`Failed to perform action: ${error}`));
                }
            } else {
                return message.author.send("You cannot perform multiple actions during the same night.");
            }
        };

        /*
            Role Actions:

            lock - role-blocks target, protects from harm
            block - role-blocks target
            kill - kills target
            investigate - gives two pre-chosen options for target's role
            heal - heals target
        */
        const roleActions = ["sleep", "lock", "block", "kill", "investigate", "heal"];
        var i = 0;
        while (i < roleActions.length) {
            if (args[0] === roleActions[i]) {
                gameAction(args[0], args[1]);
                game.numActed.push();
                if (game.numActed.length === Object.keys(game.alive).length) {
                    runActions();
                }
                return;
            }
            i++;
        }
        if (i === roleActions.length) return message.author.send("That action does not exist. Perhaps you spelled it incorrectly, or the action you were thinking of is different.");
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
                                + "`game night` - End the current day and begin the night\n"
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
                    title: "Welcome to the Town of Charlotte!",
                    fields: [
                        {
                            name: "We have lots of good Townsfolk, but a little organized crime (Mafia), and a few loners (Neutral).",
                            value: "- The town always has a Jailor, 1 or more healing roles, and 1 or more investigative roles. We usually have lots of other roles too, depending on the population size. There might even be more than 1 of the same role!\n"
                                + "- The Mafia always has a Godfather and 1 killer. They often have 1 or more additional roles, depending on the population (usually Mafia is about 1/4 of the population, give or take).\n"
                                + '- Neutral roles are not aligned with the Town or Mafia, and have their own unique win conditions. Usually 1-2 of these may be "armed and dangerous."'
                        },
                        {
                            name: "Typical Night",
                            value: "- Mafia kills someone (can only be stopped if target has Night Immunity, or both the Godfather and the Mafia killer are Role-Blocked).\n"
                                + "- Neutral killer (Arsonist, Serial Killer, Terrorist, Vampire, Werewolf) will select a victim.\n"
                                + "- Investiagtive roles collect information which they may choose to share or not."
                        },
                        {
                            name: "Typical Day",
                            value: "- Deaths are reported, along with how they died.\n"
                                + "- Open discussion amongst the town. People can share information they have gained, make accusations, or claim to be a role... but not everyone will tell the truth!\n"
                                + "- Vote to lynch a suspicious town member, where the majority wins."
                        },
                        {
                            name: "Night Immunity",
                            value: "Can't be killed at night if targeted, except for Werewolf or Arsonist attacks. Still die if run into Bodyguard, Terrorist, or Veteran; and can be executed by Jailor.\n"
                                + "***Arsonist, Godfather, Psychopath, Serial Killer***"
                        },
                        {
                            name: "Role-Blockers",
                            value: "Prevent their targets from performing their actions that night.\n"
                                + "***Comedian, Hypnotist, Jailor***"
                        },
                        {
                            name: "Confusion Roles",
                            value: "May change the outcome of a person's actions.\n"
                                + "***Cleaner, Doctor, Framer, Intimidator, Master of Disguise, Teleporter, Uber Driver***"
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
                    if (!setup.gameNow) message.reply("There is no game to join. Perhaps a game has not been started, or one is already in progress.");
                    if (setup.gameNow && !listed) {
                        message.member.addRole(playingRole).catch(error => message.reply(`Failed to perform action: ${error}`));
                        game.alive[message.author.username] = new Player(message.author, "Jailor");
                        message.channel.send(`_${message.author} has joined the game._`);
                        
                        message.author.send({
                            embed: {
                                //color: 3447003,
                                author: {
                                    name: "> You Joined the Game <"
                                },
                                fields: [
                                    {
                                        name: `Your role is _${game.alive[message.author.username].role}_.`,
                                        value: game.alive[message.author.username].infoText
                                    }
                                ],
                                footer: {
                                    text: `Need help? In the server chat type ${prefix}help`
                                }
                            }
                        }).catch(error => message.reply(`Failed to perform action: ${error}`));
                    }
                    if (setup.gameNow && listed) {
                        message.reply("You have already joined the game.");
                    }
                    break;
                case "leave":
                    if (setup.gameNow && listed) return message.reply("You may not leave until the game has begun.");
                    if (setup.playing && listed) {
                        delete game.alive[message.author.username];
                        message.member.removeRole(playingRole).catch(error => message.reply(`Failed to perform action: ${error}`));
                        
                        return message.channel.send(`_${message.author} has left the game._`).catch(error => message.reply(`Failed to perform action: ${error}`));
                    }
                    if (listed) return message.reply("There is no game for you to leave.");
                    break;
                case "players":
                    if ((!setup.gameNow && !setup.playing) || game.alive.length < 1) message.reply("There are no players to show. Perhaps a game has not been started, or there are no players yet in the current game.");
                    else if (setup.gameNow || setup.playing) {
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
                    if (role && (setup.gameNow || setup.playing)) message.reply("There is already a game in progress.");
                    if (role && !setup.gameNow && !setup.playing) {
                        setup.gameNow = true;
                        game.master.name = message.author.username;
                        game.master.id = message.author.id;
                        message.author.send("You are the Gamemaster.\nAfter each night the action log will be DMed to you, and during the game you can view secret stats about the players.");
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
                    if (role && (setup.gameNow || !setup.playing)) message.reply("There is no current game to end. If a game has just been started, type `//game begin` and then `//game end`.");
                    if (role && !setup.gameNow && setup.playing) {
                        setup.gameNow = false;
                        setup.playing = false;
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
                    if (role && !setup.gameNow) message.reply("There is no current game to begin.");
                    if (role && setup.gameNow) {
                        setup.gameNow = false;
                        setup.playing = true;
                        message.channel.send({
                            embed: {
                                //color: 3447003,
                                author: {
                                    name: "> Game Has Begun <"
                                },
                                fields: [
                                    {
                                        name: "The game is afoot!",
                                        value: "No more players may join. The first night has started - DM me your actions!"
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
                    if (!setup.playing) message.reply("There is no current game to show the stats of.");
                    if (setup.playing) {
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
            if (content == "") content = "_[ Empty Message ]_";
            message.channel.send(content);
        }
    }
});

client.login(process.env.BOT_TOKEN);
