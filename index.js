/*
  Requirements:
  
  - Admins must have the role "Gamemaster"
  - Bot must have the role "Gamemaster"
  - Server must have the role "Playing Game" (currently an ID assignment)
  - Mafia members must create their own group DM chat (since bots do not have the ability to join/create them)
  
  
  Future Implements:
  - use .awaitMessages for lynching
*/

// Keep the bot online
var express = require("express")
var app = express()
app.get("/", (request, response) => {
  response.sendStatus(200)
});
app.listen(process.env.PORT)


// Dependencies
const Discord = require("discord.js")
const client = new Discord.Client()
const TOKEN = process.env.TOKEN
const prefix = "."
const gameTitle = "Town of Salem"
const playRole = "458590289477763073"
let logs = []


/*
    Some help from the following:
    https://gist.github.com/eslachance/3349734a98d30011bb202f47342601d3
    https://anidiotsguide_old.gitbooks.io/discord-js-bot-guide/content/information/understanding-asyncawait.html
*/

let roles = {
    Jailor: {
        name: "Jailor",
        txt: "Lock up 1 person each night. Target can't perform their night action and is safe from shots. You may execute your target once.",
        action: {
            rb: [Infinity, "You were locked up by the Jailor!"],
            kill: [1, "You were attacked!"]
        },
        immune: {},
        team: "town",
        canTarget: true,
        canSleep: true,
        canTargetSelf: true
    },
    Investigator: {
        name: "Investigator",
        txt: "Target 1 person each night for a clue to their role (lists some possible roles).",
        action: {
            detect: [Infinity]
        },
        immune: {},
        team: "town",
        canTarget: true,
        canSleep: true,
        canTargetSelf: true
    },
    Doctor: {
        name: "Doctor",
        txt: "Heal 1 person each night, preventing them from dying.",
        priority: "p2",
        action: {
            heal: [Infinity, "You were healed by the doctor!"]
        },
        immune: {},
        team: "town",
        canTarget: true,
        canSleep: true,
        canTargetSelf: true
    },
    Godfather: {
        name: "Godfather",
        txt: "Select a target for mafia to kill, if no mafioso you will perform it.",
        action: {
            kill: [Infinity, "You were attacked!"]
        },
        immune: {
            kill: true,
            bite: true,
            detect: true,
            rb: true
        },
        team: "mafia",
        canTarget: true,
        canSleep: true
    },
    Mafioso: {
        name: "Mafioso",
        txt: "Carry out the Godfather's order and kill his target. You become Godfather if he dies.",
        action: {},
        immune: {
            kill: false,
            bite: false,
            detect: false,
            rb: false
        },
        team: "mafia",
        canTarget: true
    },
    "Serial Killer": {
        name: "Serial Killer",
        txt: "Kills someone each night.",
        action: {
            
        },
        immune: {
            kill: true,
            bite: true,
            detect: false,
            rb: false
        },
        team: "neutral",
        canTarget: true
    }
},
    town = [],
    mafia = [],
    neutral = []

// Randomizer code borrowed from:  https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random
function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Function that takes player list and randomly assigns roles
function assignRoles(playerList) {
    let roleList = ["Godfather", "Jailor"]
    
    // Add two other town roles, to keep the 1/3 ratio as closely as possible
    /*roleList.push("Town")
    roleList.push("Town")
    
    for (var j = 0; j < 12 - 4; j++) {
        if (j % 4 === 0) {
            roleList.push("Mafia")
        } else {
            roleList.push("Town")
        }
    }*/
  
    for (var i = roleList.length - 1, rand; i > -1; i--) {
        rand = getRandomInt(0, i)
        // console.log(roleList[rand])
        playerList[Object.keys(playerList)[i]].role = roleList[rand]
        playerList[Object.keys(playerList)[i]].txt = roles[roleList[rand]].txt
        roleList.splice(rand, 1)
    }
}


function runActions(roleList) {
    
}


/*
    Internal Game-Data Keys
    
    day - The in-game day
    alive - The players who are alive; key: user tag, data: Player Object
    dead - The players who have died; key: user tag, data: Player Object
    master - The Gamemaster; user tag
*/

// Game database
let game = {
    day: 0,
    alive: {},
    dead: {},
    master: ""
}

function roleExists(role) {
    return (JSON.stringify(game.alive).indexOf(role) === -1) ? false : true;
}

/*
  Player prototype
  
  name: discord tag
  id:   discord id
  role: role name
  txt:  role info text
  priority:  the priority the player has when actions are run (alphabetical, a-h)
  has:  if player has been targeted, what has happened to them (attacked, RBed, etc.)
*/
function Player(user) {
    this.name = user.tag
    this.id = user.id
    this.role = null
    this.txt = null
    this.priority = "g"
    this.has = {}/*
    this.getAbilities = roles[this.role].abilities;
    this.canTargetSelf = roles[this.role].canTargetSelf;
    this.canSleep = roles[this.role].canSleep;
    this.actsPerNight = roles[this.role].actsPerNight;
    this.hasImmunity = function(type) {
        return roles[this.role].immunity[type];
    };*/
}

let setup = {
    gameQueued: false,
    playing: false,
}

function addPlayer(author) {
    return game.alive[author.tag] = new Player(author);
}
function getPlayer(author) {
    return game.alive[author.tag]
}
function removePlayer(author) {
    delete game.alive[author.tag]
}

client.on("ready", () => {
    client.user.setActivity(gameTitle);
    console.log("Ready for action!");
    
    // Fill role arrays with each type (so role assignment can pull randomly from the lists)
    for (var i = 0; i < Object.keys(roles).length; i++) {
        if (roles[Object.keys(roles)[i]].team === "town") town.push(roles[Object.keys(roles)[i]].name)
        else if (roles[Object.keys(roles)[i]].team === "mafia") mafia.push(roles[Object.keys(roles)[i]].name)
        else if (roles[Object.keys(roles)[i]].team === "neutral") neutral.push(roles[Object.keys(roles)[i]].name)
    }
});

client.on("debug", debug => {
    logs.push(debug);
});

client.on("message", async msg => {
    if (msg.author.bot) return;
    if (msg.content.indexOf(prefix) !== 0) return;
  
    // Split message into array of arguments
    let arg = msg.content.trim().toLowerCase().slice(prefix.length, msg.content.length).split(/ +/g);
    // console.log(arg)
    
    // Check the game.alive object for whether the one who messaged is listed or not
    var listed = (getPlayer(msg.author) === undefined) ? false : true;
    
  
    if (msg.channel.type === "dm") {
        if (setup.playing) {
            if (arg[0] === "action") {
                if (arg[1] === "list") {
                    return msg.channel.send(`This is a list of actions: [...]`).catch(error => msg.reply(`Failed to perform action: ${error}`))
                }
              
                // Roles that self-target
                else if (arg[1] === "alert") {

                }
                // If not a self-target role, give an error when no target is provided
                else if (arg[1] !== undefined && arg[2] === undefined) return msg.channel.send(`You must specify a target to ${arg[1]}.`).catch(error => msg.reply(`Failed to perform action: ${error}`))
                else if (arg[1] === "kill" || arg[1] === "execute") {

                }
                else if (arg[1] === "rb" || arg[1] === "role-block" || arg[1] === "lock") {

                }
                else if (arg[1] === "protect" || arg[1] === "heal") {

                }
                else if (arg[1] === "clean") {

                }
                else if (arg[1] === "teleport") {

                }
                else if (arg[1] === "resurrect") {

                }
                else if (arg[1] === "watch" || arg[1] === "lookout") {

                }
                else if (arg[1] === "investigate") {

                }
                else if (arg[1] === "track") {

                }
                else {
                    msg.channel.send(`You must specify an action to perform.`).catch(error => msg.reply(`Failed to perform action: ${error}`))
                }
              
                // Check if all players have done their actions; if so, run the nightly actions and end the night
            }
            else {
                msg.channel.send(`Sorry, I don't understand that command; check that you spelled it correctly. If you need help, type \`${prefix}help\` in the game server chat.`).catch(error => msg.reply(`Failed to perform action: ${error}`))
            }
        } else {
            msg.channel.send(`Sorry, this command can only be used during a game.`).catch(error => msg.reply(`Failed to perform action: ${error}`))
        }
    }
    else {
        // Check for Discord roles
        let role = msg.member.roles.cache.some(r => ["Gamemaster"].includes(r.name)),
        playingRole = msg.guild.roles.fetch(playRole)
        // console.log(msg.guild.roles.find("name", "Playing Game"))

        // DMs a user by ID
        let dmID = function(id, dm) {
            msg.guild.members.fetch(id).then(user => {user.send(dm)})
        }
        
        if (arg[0] === "help") {
            msg.channel.send({
                embed: {
                    //color: 3447003,
                    title: "> Help",
                    fields: [
                        {
                            name: `I'm _The Assistant_, here to help run your _${gameTitle}_ games!`,
                            value: "Here's a list of my commands:"
                        },
                        {
                            name: "General",
                            value: `\`help\` - Displays the help screen, with the list of all commands
                                    \`ping\` - Ping the bot, and receive a latency check
                                    \`info\` - Gives info about the _${gameTitle}_ game and how to play
                                    \`tip\` - Get a random gameplay tip`

                        },
                        {
                            name: "Game",
                            value: "`game join` - Join the started game\n"
                                + "`game leave` - Leave the current game\n"
                                + "`game stats` - Show vital statistics about the current game\n"
                                + "`game players` - Lists all players in the current game\n"
                                + "`roles list` - Lists all roles\n"
                                + "`roles x` - Provides specific info on a role, where _x_ is the role name"
                        },
                        {
                            name: "Gamemaster",
                            value: "`delete x` - Bulk-delete messages, where _x_ is the number of messages to delete\n"
                                + "`game start` - Start a new game for players to join\n"
                                + "`game begin` - Begin the game with the players that have joined\n"
                                + "`game night` - End the current day and begin the night\n"
                                + "`game end` - End the current game\n"
                                + "`roles players` - DMs the user a list of all players in the current game and their respective roles"
                        },
                        /*{
                            name: "Dev Tools",
                            value: "`print x` - Print the output of the proceeding code, where _x_ is the code to run"
                        }*/
                    ],
                    footer: {
                        text: `Command Prefix: ${prefix}`
                    }
                }
            }).catch(error => msg.reply(`Failed to perform action: ${error}`));
        }
        else if (arg[0] === "ping") {
            const temp = await msg.channel.send("Pinging...").catch(error => msg.reply(`Failed to perform action: ${error}`));
            temp.edit(`Pong! Latency is ${temp.createdTimestamp - msg.createdTimestamp}ms.`);
        }
        else if (arg[0] === "info") {
            msg.channel.send({
                embed: {
                    //color: 3447003,
                    title: `> Game Info\n\nWelcome to _${gameTitle}!_`,
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
                        },
                        {
                            name: "For a more detailed look at roles, see this spreadsheet:",
                            value: "https://docs.google.com/spreadsheets/d/1qAeSs2LM--ik_Z_52Br2pM_0xXFCMiqaxqdmSitysQg/edit#gid=0"
                        }
                    ],
                    footer: {
                        text: `Not what you're looking for? ${prefix}help`
                    }
                }
            }).catch(error => msg.reply(`Failed to perform action: ${error}`));
        }
        else if (arg[0] === "settings") {
            msg.channel.send("Sorry, this feature has not been implemented yet.").catch(error => msg.reply(`Failed to perform action: ${error}`));
        }
        else if (arg[0] === "tip") {
            msg.channel.send("Sorry, this feature has not been implemented yet.").catch(error => msg.reply(`Failed to perform action: ${error}`));
        }

        // Game commands
        else if (arg[0] === "game") {
            if (arg[1] === "join") {
                if (!setup.gameQueued) return msg.reply("there is no game to join. Either a game has not been queued, or one has already started.")
                if (setup.gameQueued && !listed) {
                    if (role && msg.author.tag === game.master) return msg.reply("you are the Gamemaster for the current game.")

                    addPlayer(msg.author)
                    msg.member.roles.add(playRole).catch(error => msg.reply(`Failed to perform action: ${error}`))

                    msg.author.send({
                        embed: {
                            //color: 3447003,
                            title: "> You've joined the game.",
                            fields: [
                                {
                                    name: `Welcome to ${gameTitle}!`,
                                    value: "You will be DMed your role once the game is started."
                                }
                            ],
                            footer: {
                                text: `Need help? In the server chat type ${prefix}help`
                            }
                        }
                    }).catch(error => msg.reply(`Failed to perform action: ${error}`))
                    msg.channel.send(`_${msg.author} has joined the game._`)
                }
                else if (setup.gameQueued && listed) msg.reply("you have already joined the game.")
            }
            else if (arg[1] === "leave") {
                if (role && msg.author.tag === game.master) return msg.reply(`you are the Gamemaster and cannot leave the game. If you wish to end the current game, type \`${prefix}game end\`.`)
                else if (listed) {
                    removePlayer(msg.author)
                    msg.member.roles.remove(playRole).catch(error => msg.reply(`Failed to perform action: ${error}`));

                    return msg.channel.send(`_${msg.author} has left the game._`).catch(error => msg.reply(`Failed to perform action: ${error}`));
                }
                if (!listed) return msg.reply("there is no game to leave. Either a game has not been started, or you are not joined.");
            }
            else if (arg[1] === "players") {
                if (!setup.gameQueued && !setup.playing) msg.reply("a game has not been started.")
                else if (setup.gameQueued) {
                    msg.channel.send({
                        embed: {
                            //color: 3447003,
                            title: "> Players\n\nList of players ready to play:",
                            fields: [
                                {
                                    name: "Name",
                                    value: Object.keys(game.alive).join("\n")
                                },
                                {
                                    name: "Total Players",
                                    value: Object.keys(game.alive).length
                                }
                            ],
                            footer: {
                                text: `Not what you're looking for? ${prefix}help`
                            }
                        }
                    }).catch(error => msg.reply(`Failed to perform action: ${error}`));
                }
                else if (setup.playing) {
                    msg.channel.send({
                        embed: {
                            //color: 3447003,
                            title: "> Players\n\nList of players in the current game:",
                            fields: [
                                {
                                    name: "Alive",
                                    value: Object.keys(game.alive).join("\n")
                                },
                                {
                                    name: "Dead",
                                    value: (Object.keys(game.dead).length === 0) ? "No players" : Object.keys(game.dead).length
                                },
                                {
                                    name: "Total Players",
                                    value: Object.keys(game.alive).length
                                }
                            ],
                            footer: {
                                text: `Not what you're looking for? ${prefix}help`
                            }
                        }
                    }).catch(error => msg.reply(`Failed to perform action: ${error}`));
                }
            }
            else if (arg[1] === "queue") {
                if (!role) msg.reply("you are not a Gamemaster and cannot queue a game.");
                else if (setup.gameQueued || setup.playing) msg.reply("a game has already been queued.");
                else if (!setup.gameQueued && !setup.playing) {
                    setup.gameQueued = true
                    game.master = msg.author.tag

                    addPlayer(msg.author)

                    msg.member.roles.add(playRole).catch(error => msg.reply(`Failed to perform action: ${error}`))

                    msg.author.send({
                        embed: {
                            //color: 3447003,
                            title: "> You are the Gamemaster.",
                            fields: [
                                {
                                    name: "You are the narrator for the game; after each night the action log will be DMed to you.",
                                    value: "You will be DMed your role once the game is started."
                                }
                            ],
                            footer: {
                                text: `Need help? In the server chat type ${prefix}help`
                            }
                        }
                    }).catch(error => msg.reply(`Failed to perform action: ${error}`))
                    msg.channel.send({
                        embed: {
                            //color: 3447003,
                            title: "> Game Queued",
                            fields: [
                                {
                                    name: `A new _${gameTitle}_ game has been queued.`,
                                    value: `To join, type \`${prefix}game join\`. The Gamemaster will start the game shortly.`
                                }
                            ],
                            footer: {
                                text: `Need help? ${prefix}help`
                            }
                        }
                    }).catch(error => msg.reply(`Failed to perform action: ${error}`))
                }
            }
            else if (arg[1] === "start") {
                if (!role) msg.reply("you are not a Gamemaster and cannot start a game.")
                else if (!setup.gameQueued) msg.reply("there is no game to start.")
                else if (setup.gameQueued) {
                    setup.gameQueued = false
                    setup.playing = true
                  
                    assignRoles(game.alive)

                    for (var i = 0; i < Object.keys(game.alive).length; i++) {
                        dmID(game.alive[Object.keys(game.alive)[i]].id, {
                            embed: {
                                //color: 3447003,
                                title: `> Night 1 has started.`,
                                fields: [
                                    {
                                        name: `Your role is _${game.alive[Object.keys(game.alive)[i]].role}_.`,
                                        value: game.alive[Object.keys(game.alive)[i]].txt
                                    }
                                ],
                                footer: {
                                    text: `Need help? In the server chat type ${prefix}help`
                                }
                            }
                        })
                    }

                    msg.channel.send({
                        embed: {
                            //color: 3447003,
                            title: `> The _${gameTitle}_ game has started!`,
                            fields: [
                                {
                                    name: `No more players may join.`,
                                    value: "The first night has begun... DM me your targets!"
                                }
                            ],
                            footer: {
                                text: `Need help? ${prefix}help`
                            }
                        }
                    }).catch(error => msg.reply(`Failed to perform action: ${error}`));
                }
            }
            else if (arg[1] === "end") {
                if (!role) msg.reply("you are not a Gamemaster and cannot end a game.")
                else if (setup.gameQueued || !setup.playing) msg.reply(`there is no game to end. If a game has been queued, type \`${prefix}game start\` and then \`${prefix}game end\`.`)
                else if (!setup.gameQueued && setup.playing) {
                    setup.playing = false

                    // Remove the Playing Game role from all players
                    for (var i = 0; i < Object.keys(game.alive).length; i++) {
                        msg.guild.members.fetch(game.alive[Object.keys(game.alive)[i]].id).then(user => {user.roles.remove(playRole)}).catch(error => msg.reply(`Failed to perform action: ${error}`))
                    }

                    // Reset the game object
                    game = {
                        day: 0,
                        alive: {},
                        dead: {},
                        players: {},
                        master: ""
                    }
                  
                    msg.channel.send({
                        embed: {
                            //color: 3447003,
                            title: `> The current game has been ended.`,
                            footer: {
                                text: `Need help? ${prefix}help`
                            }
                        }
                    }).catch(error => msg.reply(`Failed to perform action: ${error}`));
                }
            }
            else if (arg[1] === "stats") {
                msg.channel.send("Sorry, this feature has not been implemented yet.").catch(error => msg.reply(`Failed to perform action: ${error}`))
            }
            else {
                msg.channel.send(`Sorry, I don't understand that command; check that you spelled it correctly. If you need help, type \`${prefix}help\`.`).catch(error => msg.reply(`Failed to perform action: ${error}`))
            }
        }
        else if (arg[0] === "action") {
            msg.channel.send(`Sorry, this command can only be used in a DM with me.`).catch(error => msg.reply(`Failed to perform action: ${error}`))
        }

        // Gamemaster-only commands
        else if (arg[0] === "delete") {
            msg.channel.send("Sorry, this feature has not been implemented yet.").catch(error => msg.reply(`Failed to perform action: ${error}`))
        }
        else if (arg[0] === "print") {
            msg.channel.send("Sorry, this feature has not been implemented yet.").catch(error => msg.reply(`Failed to perform action: ${error}`))
            /*if (!role) msg.reply("you are not a Gamemaster and cannot run test commands.")
            else {
                var content = eval(msg.content.substr(prefix.length + 6))
                return msg.channel.send((content == "") ? "_[ Empty Message ]_" : content)
            }*/
        }
        else {
            msg.channel.send(`Sorry, I don't understand that command; check that you spelled it correctly. If you need help, type \`${prefix}help\`.`).catch(error => msg.reply(`Failed to perform action: ${error}`))
        }
    }
});

client.login(TOKEN)
