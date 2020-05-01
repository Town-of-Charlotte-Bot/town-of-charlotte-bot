/*
  Requirements:
  
  - Admins must have the role "Gamemaster"
  - Bot must have the role "Gamemaster"
  - Server must have the role "Playing Game" (currently an ID assignment)
  - Mafia members must create their own group DM chat (since bots do not have the ability to join/create them)
  
  
  Future Implements:
  
  - Bot will respond to normal sentences with keywords instead of commands only:  https://discordjs.guide/popular-topics/collectors.html#message-collectors
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
let logs = [],


// Role Database
/*
    Role: {
        name: "Role",
        txt: "This is info text."
        action: {
            action1: [Infinity, "This alert message is sent to the target"], // Message is only sent to target if role action goes through
            action2: [3, "This alert message is sent to the target"]
        }
        immune: {
            kill: true,
            detect: true,
            rb: true,
            control: true
        },
        looksLike: "Role1, Role2, Role3",
        team: "town",
        type: "protective",
        canTarget: true,
        canSleep: true
    }
*/

roles = {
    // Necessary
    Jailor: {
        name: "Jailor",
        txt: "Lock up 1 person each night. Target can't perform their night action and is safe from shots. You may execute your target once.",
        action: {
            rb: [Infinity, "You have been jailed!"],
            kill: [1, "You were executed by the Jailor!"]
        },
        immune: {},
        looksLike: "",
        team: "town",
        type: "necessary",
        canTarget: true,
        canSleep: true
    },
    Godfather: {
        name: "Godfather",
        txt: "Select a target for mafia to kill, if no mafioso you will perform it.",
        action: {
            kill: [Infinity, "You were shot by the mafia!"]
        },
        immune: {
            kill: true,
            detect: true
        },
        looksLike: "",
        team: "mafia",
        canTarget: true,
        canSleep: true
    },
    
    // Town Protection
    Doctor: {
        name: "Doctor",
        txt: "Heal 1 person each night, preventing them from dying.",
        action: {
            heal: [Infinity, "You were healed by the doctor!"]
        },
        immune: {},
        looksLike: "",
        team: "town",
        type: "protection",
        canTarget: true,
        canSleep: true
    },
    Bodyguard: {
        name: "Bodyguard",
        txt: "Protect someone from an attacker, killing them and also dying yourself. You may make yourself immune 1 night without guarding",
        action: {
            heal: [Infinity, "The bodyguard protected you!"]
        },
        immune: {},
        looksLike: "",
        team: "town",
        type: "protection",
        canTarget: true,
        canSleep: true
    },
  
    // Town Support
    Comedian: {
        name: "Comedian",
        txt: "Distract 1 person each night, preventing thier night action(s).",
        action: {
            rb: [Infinity, "You were role-blocked!"]
        },
        immune: {},
        looksLike: "",
        team: "town",
        type: "support",
        canTarget: true,
        canSleep: true
    },
    Intimidator: {
        name: "Intimidator",
        txt: "Players right next to you know your role and must vote with you. They cannot reveal your role, and you survive 1 normal gunshot",
        action: {
            rb: [Infinity, `You have been intimidated by __! You must vote with them in all town lynchings.`]
        },
        immune: {},
        looksLike: "",
        team: "town",
        type: "support",
        canTarget: true,
        canSleep: true
    },
  
    // Town Killing
    Vigilante: {
        name: "Vigilante",
        txt: "Can choose to shoot someone 3 times at night, if the person shot is town and dies, Vigilante suicides next night. Has 1 vest",
        action: {
            kill: [3, "You were shot by the Vigilante!"]
        },
        immune: {},
        looksLike: "",
        team: "town",
        type: "killing",
        canTarget: true,
        canSleep: true
    },
  
    // Town Investigative
    Investigator: {
        name: "Investigator",
        txt: "Target 1 person each night for a clue to their role (lists some possible roles).",
        action: {
            investigate: [Infinity]
        },
        immune: {},
        looksLike: "",
        team: "town",
        type: "investigative",
        canTarget: true,
        canSleep: true
    },
    Lookout: {
        name: "Lookout",
        txt: "Watch 1 person to see who visits them",
        action: {
            investigate: [Infinity]
        },
        immune: {},
        looksLike: "",
        team: "town",
        type: "investigative",
        canTarget: true,
        canSleep: true
    },
  
    // Mafia
    Cleaner: {
        name: "Cleaner",
        txt: "Choose a person every night, if they die, they do not show their role or give a death speech. (3 uses)",
        action: {
            clean: [3, "Your death was cleaned up by the mafia!"]
        },
        immune: {},
        looksLike: "",
        team: "mafia",
        canTarget: true,
        canSleep: true
    },
    
    // Neutral Evil
    Lunatic: {
        name: "Lunatic",
        txt: "Trick the town into lynching you.",
        action: {},
        immune: {},
        looksLike: "",
        team: "neutral",
        type: "evil",
        canTarget: false,
        canSleep: true
    },
    
    // Neutral Killing
    "Serial Killer": {
        name: "Serial Killer",
        txt: "Kill someone each night.",
        action: {
            kill: [Infinity, "You were slain by the serial killer!"]
        },
        immune: {
            kill: true
        },
        looksLike: "",
        team: "neutral",
        type: "killing",
        canTarget: true,
        canSleep: false
    }
},
townProtective = [],
townSupport = [],
townKilling = [],
townInvestigative = [],
mafia = [],
neutralBenign = [],
neutralEvil = [],
neutralKilling = [],

    
/*
    Internal Game-Data Keys
    
    day - The in-game day
    alive - The players who are alive; key: user tag, data: Player Object
    dead - The players who have died; key: user tag, data: Player Object
    roles - a list of all roles in the current game
    master - The Gamemaster; user tag
    channel - the channel the game is being run in
*/

// Game database
game = {
    queued: false,
    playing: false,
    day: 0,
    alive: {},
    dead: {},
    roles: "",
    master: "",
    channel: ""
}


// Randomizer code borrowed from:  https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/random
function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/*
  Role Distribution:

  7  (4 town 2 maf 1 neutral)  (jailor, protective, support, investigative) (neutral evil) (godfather, random maf)
  8  (5 town 2 maf 1 neutral)  (random town)
  9  (5 town 3 maf 1 neutral)  (random maf)
  10 (6 town 3 maf 1 neutral)  (town killing)
  11 (6 town 3 maf 2 neutral)  (neutral killing)
  12 (7 town 3 maf 2 neutral)  (town investiagtive)
  13 (8 town 3 maf 2 neutral)  (random town)
  14 (8 town 3 maf 3 neutral)  (neutral benign)
  15 (9 town 3 maf 3 neutral)  (random town)
  16 (9 town 4 maf 3 neutral)  (random maf)
  17 (10 town 4 maf 3 neutral) (random town)
  18 (11 town 4 maf 3 neutral) (random town)
  19 (11 town 5 maf 3 neutral) (random maf)
  20 (11 town 5 maf 4 neutral) (neutral benign or evil)
*/
function assignRoles(list) {
    let roleList = ["Godfather", "Jailor"],
        playerList = Object.keys(list)
    
    // Fill role arrays with each type and subtype (so role assignment can pull randomly from the lists)
    for (var i = 0, index; i < Object.keys(roles).length; i++) {
        index = roles[Object.keys(roles)[i]]
      
        if (index.team === "town") {
            if (index.type === "protection") townProtective.push(index.name)
            if (index.type === "support") townSupport.push(index.name)
            if (index.type === "killing") townKilling.push(index.name)
            if (index.type === "investigative") townInvestigative.push(index.name)
        }
        if (index.team === "mafia" && index.name !== "Godfather") mafia.push(index.name)
        if (index.team === "neutral") {
            if (index.type === "benign") neutralBenign.push(index.name)
            if (index.type === "evil") neutralEvil.push(index.name)
            if (index.type === "killing") neutralKilling.push(index.name)
        }
    }
    
    // Loop through the given array and add a random index to roleList
    function addRandomRole(arr) {
        var rand = getRandomInt(0, arr.length - 1)
        roleList.push(arr[rand])
        arr.splice(rand, 1)
    }
    
    // Add roles to list (per number of players)
    if (playerList.length >= 7) {
        addRandomRole(townProtective)
        addRandomRole(townSupport)
        addRandomRole(townInvestigative)
        addRandomRole(neutralEvil)
        addRandomRole(mafia)
    }
    if (playerList.length >= 8) {
        addRandomRole(townInvestigative)
        var j = getRandomInt(0, 3)
        if (j === 0) addRandomRole(townProtective)
        else if (j === 1) addRandomRole(townSupport)
        else if (j === 2) addRandomRole(townKilling)
        else if (j === 3) addRandomRole(townInvestigative)
    }
    if (playerList.length >= 9) addRandomRole(mafia)
    if (playerList.length >= 10) addRandomRole(townKilling)
    if (playerList.length >= 11) addRandomRole(neutralKilling)
    if (playerList.length >= 12) addRandomRole(townInvestigative)
    if (playerList.length >= 13) {
        var j = getRandomInt(0, 3)
        if (j === 0) addRandomRole(townProtective)
        else if (j === 1) addRandomRole(townSupport)
        else if (j === 2) addRandomRole(townKilling)
        else if (j === 3) addRandomRole(townInvestigative)
    }
    if (playerList.length >= 14) addRandomRole(neutralBenign)
    if (playerList.length >= 15) {
        var j = getRandomInt(0, 3)
        if (j === 0) addRandomRole(townProtective)
        else if (j === 1) addRandomRole(townSupport)
        else if (j === 2) addRandomRole(townKilling)
        else if (j === 3) addRandomRole(townInvestigative)
    }
    if (playerList.length >= 16) addRandomRole(mafia)
    if (playerList.length >= 17) {
        var j = getRandomInt(0, 3)
        if (j === 0) addRandomRole(townProtective)
        else if (j === 1) addRandomRole(townSupport)
        else if (j === 2) addRandomRole(townKilling)
        else if (j === 3) addRandomRole(townInvestigative)
    }
    if (playerList.length >= 18) {
        var j = getRandomInt(0, 3)
        if (j === 0) addRandomRole(townProtective)
        else if (j === 1) addRandomRole(townSupport)
        else if (j === 2) addRandomRole(townKilling)
        else if (j === 3) addRandomRole(townInvestigative)
    }
    if (playerList.length >= 19) addRandomRole(mafia)
    if (playerList.length === 20) {
        var j = getRandomInt(0, 1)
        if (j === 0) addRandomRole(neutralBenign)
        else addRandomRole(neutralEvil)
    }
  
    // Log roles
    game.roles = roleList
    console.log(game.roles)
  
    // Randomly assign roles to players
    for (var i = roleList.length - 1, rand; i > -1; i--) {
        rand = getRandomInt(0, i)
        list[playerList[i]].role = roleList[rand]
        roleList.splice(rand, 1)
    }
}


function runActions(roleList) {
    
}

function roleExists(role) {
    return (JSON.stringify(game.alive).indexOf(role) === -1) ? false : true
}

/*
  Player prototype
  
  name:     discord tag
  id:       discord id
  role:     role name
  priority: the priority the player has when actions are run (alphabetical, a-h)
  did:      the actions the player has performed that night (key: player, value: action)
  hasBeen:  if player has been targeted, what has happened to them (key: player, value: action)
  
  Any additional info pertaining to the player's role is retrieved from roles[Player.role].infoName
*/
function Player(user) {
    this.name = user.tag
    this.id = user.id
    this.role = null
    this.did = {}
    this.hasBeen = {}
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
    console.log("Ready for action!")
});

client.on("debug", debug => {
    logs.push(debug);
});

client.on("message", async msg => {
    // Update bot status
    if (game.playing) client.user.setActivity(gameTitle)
    else client.user.setActivity(`${prefix}help`)
  
    if (msg.author.bot) return
    if (msg.content.indexOf(prefix) !== 0) return
  
    // Split message into array of arguments
    let arg = msg.content.trim().toLowerCase().slice(prefix.length, msg.content.length).split(/ +/g)
    // console.log(arg)
    
    // Check the game.alive object for whether the one who messaged is listed or not
    var listed = (getPlayer(msg.author) === undefined) ? false : true
    
    if (msg.channel.type === "dm") {
        if (game.playing) {
            if (arg[0] === "action") {
                if (arg[1] === "list") {
                    return msg.channel.send(`This is a list of actions: [...]`).catch(error => msg.reply(`Failed to perform action: ${error}`))
                }
                
                // Sleep (do not perform an action)
                else if (arg[1] === "sleep") {
                    return msg.channel.send(`You have slept.`).catch(error => msg.reply(`Failed to perform action: ${error}`))
                }
                
                // Roles that only self-target
                else if (arg[1] === "alert") {

                }
              
                // If not a self-target role, give an error when no target is provided
                else if (arg[1] !== undefined && arg[2] === undefined) return msg.channel.send(`You must specify a target to ${arg[1]}.`).catch(error => msg.reply(`Failed to perform action: ${error}`))
              
                // Action keywords (roles may differ slightly in action, e.g. Jailor attacking is one-time and Godfather attacking is recurring)
                else if (arg[1] === "kill" || arg[1] === "execute" || arg[1] === "attack") {
                    // Jailor, Serial Killer, Werewolf, Godfather, Vigilante
                }
                else if (arg[1] === "hypnotize" || arg[1] === "rb" || arg[1] === "role-block" || arg[1] === "lock" || arg[1] === "block") {
                    // Jailor, Hypnotist, Comedian
                }
                else if (arg[1] === "uber") {
                    // Uberdriver
                }
                else if (arg[1] === "frame") {
                    // Framer
                }
                else if (arg[1] === "douse") {
                    // Arsonist
                }
                else if (arg[1] === "ignite" || arg[1] === "light") {
                    // Arsonist
                }
                else if (arg[1] === "slay") {
                    // Slayer
                }
                else if (arg[1] === "protect" || arg[1] === "guard" || arg[1] === "heal") {
                    // Bodyguard, Doctor
                }
                else if (arg[1] === "curse") {
                    // Necromancer
                }
                else if (arg[1] === "control" || arg[1] === "possess") {
                    // Witch
                }
                else if (arg[1] === "blackmail") {
                    // Blackmailer
                }
                else if (arg[1] === "clean") {
                    // Cleaner
                }
                else if (arg[1] === "discover-role" || arg[1] === "learn-role" || arg[1] === "look-at-role") {
                    // Consigliere
                }
                else if (arg[1] === "track") {
                    // Tracker
                }
                else if (arg[1] === "investigate") {
                    // Investigator
                }
                else if (arg[1] === "watch" || arg[1] === "lookout") {
                    // Lookout
                }
                else if (arg[1] === "resurrect") {
                    // Shaman
                }
                else if (arg[1] === "check") {
                    // Sheriff
                }
                else if (arg[1] === "remember") {
                    // Amnesiac
                }
                else if (arg[1] === "teleport") {
                    // Teleporter
                }
                else {
                    msg.channel.send(`You must specify an action to perform.`).catch(error => msg.reply(`Failed to perform action: ${error}`))
                }
              
                // Roles that do not require player-provided targets:  Terrorist, Mafioso
              
                // Check for these wins during the day (after a lynching):  Town, Mafia, Lunatic, Psychopath
              
                // Check if all players have done their actions; if so, run the nightly actions and end the night
                // When players die (nightly or lynching), bot reveals their role in chat
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

        // For DMing a user by ID
        function dmID(id, dm) {
            msg.guild.members.fetch(id).then(user => {user.send(dm)})
        }
        
        // Set the main channel (so the bot can message there of its own accord)
        if (game.channel === "") game.channel = msg.channel.id
      
        function msgChannel(msg) {
            client.channels.fetch(game.channel).then(user => {user.send(msg)})
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
            const temp = await msg.channel.send("Pinging...").catch(error => msg.reply(`Failed to perform action: ${error}`))
            temp.edit(`Pong! Latency is ${temp.createdTimestamp - msg.createdTimestamp}ms.`)
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
                if (!game.queued) return msg.reply("there is no game to join. Either a game has not been queued, or one has already started.")
                if (game.queued && !listed) {
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
                else if (game.queued && listed) msg.reply("you have already joined the game.")
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
                if (!game.queued && !game.playing) msg.reply("a game has not been started.")
                else if (game.queued) {
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
                else if (game.playing) {
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
                else if (game.queued || game.playing) msg.reply("a game has already been queued.");
                else if (!game.queued && !game.playing) {
                    game.queued = true
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
                else if (!game.queued) msg.reply("there is no game to start.")
                else if (game.queued) {
                    if (Object.keys(game.alive).length < 7) {
                        return msg.reply("the game you have attempted to start is too small (min 7 players).")
                    }
                    else if (Object.keys(game.alive).length > 20) {
                        return msg.reply("the game you have attempted to start is too big (max 20 players).")
                    }
                    else {
                        game.queued = false
                        game.playing = true

                        assignRoles(game.alive)

                        for (var i = 0; i < Object.keys(game.alive).length; i++) {
                            dmID(game.alive[Object.keys(game.alive)[i]].id, {
                                embed: {
                                    //color: 3447003,
                                    title: `> Night 1 has started.`,
                                    fields: [
                                        {
                                            name: `Your role is _${game.alive[Object.keys(game.alive)[i]].role}_.`,
                                            value: roles[game.alive[Object.keys(game.alive)[i]].role].txt
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
                        }).catch(error => msg.reply(`Failed to perform action: ${error}`))
                    }
                }
            }
            else if (arg[1] === "end") {
                if (!role) msg.reply("you are not a Gamemaster and cannot end a game.")
                else if (game.queued || !game.playing) msg.reply(`there is no game to end. If a game has been queued, type \`${prefix}game start\` and then \`${prefix}game end\`.`)
                else if (!game.queued && game.playing) {
                    game.playing = false

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
        
        // Gamemaster commands
        else if (arg[0] === "lynch") {
            // Only the Gamemaster can initiate; will only run if target to lynch is provided; will run lynch if majority votes on one side; will only tally votes from users who are listed (in game.alive); timeout will cancel lynch; will have the option to vote between 2 players to put on the lynching block
            
            const filter = (reaction, user) => {
                return reaction.emoji.name === '👍'
            }

            const collector = msg.createReactionCollector(filter, { time: 60000 })

            collector.on('collect', (reaction, user) => {
                console.log(`Collected ${reaction.emoji.name} from ${user.tag}`)
            })
        }
        else if (arg[0] === "night") {
            if (arg[1] === "start") {
                // Gamemaster will start the next night via this command
            }
        }

        // Utility commands
        else if (arg[0] === "restart") {
            if (role) {
                var restarting = false
              
                msg.react('👍').then(() => msg.react('👎'))

                const filter = (reaction, user) => {
                    return ['👍', '👎'].includes(reaction.emoji.name) && user.id === msg.author.id
                }
                
                msg.awaitReactions(filter, { max: 1, time: 60000, errors: ['time'] })
                .then(collected => {
                    const reaction = collected.first()

                    if (reaction.emoji.name === '👍' && !restarting) {
                        restarting = true
                        msg.channel.send("Restarting...").catch(error => msg.reply(`Failed to perform action: ${error}`)).then(() => {client.destroy()}).then(() => {client.login(TOKEN)}).then(() => {msg.channel.send("All done!")})
                    } else {
                        msg.reply('restart cancelled.')
                    }
                })
                .catch(collected => {
                    msg.reply('restart cancelled.')
                })
            }
            else msg.reply("you are not a Gamemaster and cannot restart me.")
        }
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
})

client.login(TOKEN)
