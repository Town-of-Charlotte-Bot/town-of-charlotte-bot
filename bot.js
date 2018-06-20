/*
    Some code taken from the following:
    https://gist.github.com/eslachance/3349734a98d30011bb202f47342601d3
*/

// What we need up-front
const Discord = require("discord.js");
const client = new Discord.Client();
const package = require("./package.json");
const commands = require("./info/commands.json");
const prefix = "//";

// I thought about reading/writing to/from a JSON file, but this is easier
var players = [
    // This first state is an example. It is deleted at runtime.
    {
        name: "KonurPapa#8843",
        state: "alive",
        type: "good",
        role: "Jailor"
    }
];
console.log(players[0]);

// See, I told you it was deleted
players = [];

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
    
    const args = message.content.slice(prefix.length).trim().split(/ +/g);
    const command = args.shift().toLowerCase();
    
    switch (command) {
        case "ping":
            const temp = await message.channel.send("Pinging...");
            temp.edit(`Pong! ${temp.createdTimestamp - message.createdTimestamp}ms.`);
            break;
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
                            name: "For Gamemasters",
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
            }).catch(error => message.reply(`Failed to perform action: ${error}`));
            break;
        case "game-players":
            let player = message.guild.roles.find("name", "Playing Game");
            console.log(`Got ${player.size} members with that role:\n${JSON.stringify(player)}`);
            
            const guildNames = client.guilds.map(g => g.name).join("\n");
            console.log(guildNames);
            
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
        case "purge":
            if (!message.member.roles.some(r=>["Gamemaster"].includes(r.name))) return message.reply("You are not authorized to perform this action.");
            if (message.member.roles.some(r=>["Gamemaster"].includes(r.name))) {
                const deleteCount = parseInt(args[0], 10);

                if (!deleteCount) return message.reply("Please provide the number of messages to purge.");
                else if (deleteCount < 1 || deleteCount > 100) return message.reply("The number you provided is either too small or too large.");

                const fetched = await message.channel.fetchMessages({limit: deleteCount});
                message.channel.bulkDelete(fetched).catch(error => message.reply(`Failed to perform action: ${error}`));
                message.channel.send(`Cleared ${fetched} messages.`);
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
