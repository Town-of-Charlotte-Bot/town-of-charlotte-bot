/*
  Requirements:
  
  - Admins must have the role "Gamemaster"
  - Bot must have the role "Gamemaster"
  - Server must have the role "Playing Game" (currently an ID assignment)
  
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
const commands = {
    help: {
        info: "Displays the help screen, with the list of all commands",
        working: true
    },
    ping: {
        info: "Ping the bot, and receive a latency check",
        working: true
    },
    info: {
        info: `Gives info about the _${gameTitle}_ game and how to play`,
        working: true
    },
    tip: {
        info: "Get a random gameplay tip",
        working: true
    },
    game: {
        join: {
            info: "Join the currently initiated game",
            working: true
        },
        stats: {
            info: "Show vital-statistics about the current game",
            working: false
        },
        players: {
            info: "Lists all players in the current game",
            working: true
        },
        dead: {
            info: "Lists the players who are dead in the current game",
            working: false
        },
        alive: {
            info: "Lists the players who are alive in the current game",
            working: false
        }
    },
    gamemaster: {
        game: {
            queue: {
                info: "Queue a new game for players to join",
                working: true
            },
            start: {
                "info": "Start a new game with the players that have joined",
                "working": true
            },
            end: {
                info: "End the current game",
                working: true
            },
        },
        players: {
            town: {
                info: "DMs the user a list of all good players in the current game",
                working: false
            },
            mafia: {
                info: "DMs the user a list of all evil players in the current game",
                working: false
            },
            neutral: {
                info: "DMs the user a list of all neutral players in the current game",
                working: false
            },
            list: {
                info: "DMs the user a list of all players in the current game and their respective roles",
                working: false
            }
        }
    }
}
var logs = []


/*
    Some help from the following:
    https://gist.github.com/eslachance/3349734a98d30011bb202f47342601d3
    https://anidiotsguide_old.gitbooks.io/discord-js-bot-guide/content/information/understanding-asyncawait.html
*/

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
    nightlyDead - The players who died in the previous night; key: user tag, data: role
    alive - The players who are alive; key: user tag, data: Player Object
    dead - The players who have died; key: user tag, data: Player Object
    master - The Gamemaster; user tag
    actions - The actions taken during the previous/current night; key: user tag, data: Object
    numActed - The number of players that have performed an action that night (no data stored, only .length property used)
*/

// Game database
var game = {
    day: 0,
    nightlyDead: [],
    alive: {},
    dead: {},
    master: "",
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

var roleExists = function(role) {
    var string = JSON.stringify(game.alive);
    return (string.indexOf(role) === -1) ? false : true;
};

/*
  Player prototype (user: msg.author; name: author.tag; role: player role)
*/
var Player = function(user) {
    this.name = user.tag;
    this.role = "test";
    /*this.infoText = roles[this.role].txt;
    this.getAbilities = roles[this.role].abilities;
    this.canTargetSelf = roles[this.role].canTargetSelf;
    this.canSleep = roles[this.role].canSleep;
    this.actsPerNight = roles[this.role].actsPerNight;
    this.hasImmunity = function(type) {
        return roles[this.role].immunity[type];
    };*/
};

var setup = {
    gameQueued: false,
    playing: false,
    addPlayer: function(author) {
        return game.alive[author.tag] = new Player(author);
    },
    getPlayer: function(author) {
        return game.alive[author.tag]
    },
    removePlayer: function(author) {
        delete game.alive[author.tag]
    }
};


client.on("ready", () => {
    client.user.setActivity(gameTitle);
    console.log("Ready for action!");
});

client.on("debug", debug => {
    logs.push(debug);
});


client.on("message", async msg => {
    if (msg.author.bot) return;
    
    // DMs
    if (msg.channel.type === "dm") msg.author.send("Yay, it works!")
    
    // Everything from here on out is a server command and needs the prefix
    if (msg.content.indexOf(prefix) !== 0) return;
    
    // Example of sending a DM to user by ID
    msg.guild.members.fetch("211220824265326594").then(user => {user.send("heloo",)})
    
    // Split message into array of arguments
    let arg = msg.content.trim().toLowerCase().slice(prefix.length, msg.content.length).split(/ +/g);
    // console.log(arg)
    
    // Check the game.alive object for whether the one who messaged is listed or not
    var listed = (setup.getPlayer(msg.author) === undefined) ? false : true;
    
    // Check for Discord roles
    let role = msg.member.roles.cache.some(r=>["Gamemaster"].includes(r.name));
    let playingRole = msg.guild.roles.fetch(playRole);
    // console.log(msg.guild.roles.find("name", "Playing Game"))
  
    // General commands
    if (arg[0] === "help") {
        msg.channel.send({
            embed: {
                //color: 3447003,
                title: "> Help",
                fields: [
                    {
                        name: `I'm _The Assistant_, here to help run your _${gameTitle}_ games`,
                        value: "Here's a list of my commands:"
                    },
                    {
                        name: "General",
                        value: `\`help\` - ${commands.help.info}
                                \`ping\` - ${commands.ping.info}
                                \`info\` - ${commands.info.info}
                                \`tip\` - ${commands.tip.info}`
                            
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
        }).catch(error => message.reply(`Failed to perform action: ${error}`));
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

                setup.addPlayer(msg.author)
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
            } else if (setup.gameQueued && listed) msg.reply("you have already joined the game.")
        }
        else if (arg[1] === "leave") {
            if (role && msg.author.tag === game.master) return msg.reply(`you are the Gamemaster and cannot leave the game. If you wish to end the current game, type \`${prefix}game end\`.`)
            else if (listed) {
                setup.removePlayer(msg.author)
                msg.member.roles.remove(playRole).catch(error => msg.reply(`Failed to perform action: ${error}`));

                return msg.channel.send(`_${msg.author} has left the game._`).catch(error => msg.reply(`Failed to perform action: ${error}`));
            }
            if (!listed) return msg.reply("there is no game to leave. Either a game has not been started, or you are not joined.");
        }
        else if (arg[1] === "players") {
            if (!setup.gameQueued && !setup.playing) msg.reply("a game has not been started.")
            else if (setup.gameQueued || setup.playing) {
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

                setup.addPlayer(msg.author)
                msg.member.roles.add(playRole).catch(error => msg.reply(`Failed to perform action: ${error}`))

                msg.author.send({
                    embed: {
                        //color: 3447003,
                        title: "> You are the Gamemaster.",
                        fields: [
                            {
                                name: "You are the narrator. After each night the action log will be DMed to you. During the game you can access additional commands and view secret stats about the players.",
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
                                name: `A new _${gameTitle}_ game has just been queued.`,
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

                // Loop through each player in game.alive and send them their roles
                /*msg.author.send({
                    embed: {
                        //color: 3447003,
                        title: `> Night 1 has started.`,
                        fields: [
                            {
                                name: `Your role is _${setup.getPlayer(msg.author).role}_.`,
                                value: "Nothing here yet..."
                                // value: setup.getPlayer(msg.author).infoText
                            }
                        ],
                        footer: {
                            text: `Need help? In the server chat type ${prefix}help`
                        }
                    }
                }).catch(error => msg.reply(`Failed to perform action: ${error}`));*/
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
            if (!role) msg.reply("you are not a Gamemaster and cannot end a game.");
            else if (setup.gameQueued || !setup.playing) msg.reply(`there is no game to end. If a game has been queued, type \`${prefix}game start\` and then \`${prefix}game end\`.`);
            else if (!setup.gameQueued && setup.playing) {
                setup.playing = false
                game = {
                    day: 0,
                    nightlyDead: [],
                    alive: {},
                    dead: {},
                    players: {},
                    master: ""
                };

                msg.member.roles.remove(playRole).catch(error => msg.reply(`Failed to perform action: ${error}`));

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
});

/*{
  client.on("message", async message => {

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
          *//*
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
  });
}*/

client.login(TOKEN)
