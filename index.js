const path = require('path');
require('dotenv').config();
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const {
    Client, GatewayIntentBits, EmbedBuilder,
    ChannelType, PermissionFlagsBits,
} = require('discord.js');
const { roles }                              = require('./roles');
const { assignRoles, resolveNight, checkWinConditions } = require('./engine');

const TOKEN      = process.env.BOT_TOKEN;
const PREFIX     = '.';
const GAME_TITLE = 'Town of Charlotte';
const VERSION    = 'v0.2.0 (Mica Alpha)';
const PLAY_ROLE  = 'Playing Game';
const MAFIA_CH   = 'mafia-chat';
const MIN_PLAYERS = 7;
const MAX_PLAYERS = 20;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMessageReactions,
    ],
});

// ── Game state ────────────────────────────────────────────────────────────────
function freshGame() {
    return {
        queued: false, playing: false, isNight: false, tutorial: false,
        day: 0,
        alive: {}, dead: {},
        nightActions: {},
        nightPending: new Set(),
        nightlyDead: [],
        blackmailed: [],
        jailedThisNight: [],
        mafiosoKill: null,
        doused: new Set(),
        mafiaChannelId: null,
        master: '',
        guildId: '',
        channelId: '',
        deathHistory: [],
        // Lynch phase state
        lynch: null,
        lynchedToday: false,  // prevents multiple lynches per day
        // lynch = {
        //   phase: 'nominating' | 'voting',
        //   nominationMsg: Message,        -- the reaction poll message
        //   nominees: [tag, ...],          -- ordered list (one per emoji slot)
        //   emojiMap: { emoji: tag },      -- which emoji maps to which player tag
        //   onBlock: tag | null,           -- player tag currently on the lynching block
        //   voteMsg: Message,              -- the ✅/❌ poll message
        //   textVotes: { tag: 'yes'|'no' } -- text votes cast via .vote
        // }
    };
}
let games = {};

let config = {
    publicNightResults: false
};

function Player(user) {
    this.tag         = user.id;
    this.displayName = user.username;
    this.id          = user.id;
    this.role        = null;
    this.guiltyDeath = false;
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function embed(title, fields = [], footer = `Prefix: ${PREFIX}`) {
    const e = new EmbedBuilder().setTitle(title).setColor(0x2b2d31);
    if (fields.length) e.addFields(fields.map(f => ({ name: f.name || '\u200b', value: String(f.value) })));
    if (footer) e.setFooter({ text: footer });
    return e;
}

async function dmUser(userId, content) {
    try {
        const user = await client.users.fetch(userId);
        if (typeof content === 'string') await user.send(content);
        else await user.send({ embeds: [content] });
    } catch { /* DMs closed */ }
}

async function sendHelp(userId, args, gm) {
    const sub = args[0]?.toLowerCase();

    if (sub === 'roles') {
        const sub2 = args[1]?.toLowerCase();
        if (!sub2) {
            await dmUser(userId, embed('> Help — Roles', [
                { name: 'How to use', value: `Use \`${PREFIX}help roles list\` to see all roles, or \`${PREFIX}help roles <role>\` to see details on a specific role.` }
            ]));
            return;
        }

        if (sub2 === 'list') {
            const grouped = {};
            for (const [name, r] of Object.entries(roles)) {
                const cat = r.team === 'town' ? `Town (${r.type || '?'})` : r.team === 'mafia' ? 'Mafia' : `Neutral (${r.type || '?'})`;
                grouped[cat] = grouped[cat] || [];
                grouped[cat].push(name);
            }
            const fields = Object.entries(grouped).map(([cat, names]) => ({ name: cat, value: names.join(', ') }));
            await dmUser(userId, embed('> All Roles', fields, `${PREFIX}help roles <name> for details`));
            return;
        }

        // Must be a role name
        const roleName = args.slice(1).join(' ');
        const key = Object.keys(roles).find(k => k.toLowerCase() === roleName.toLowerCase());
        if (!key) {
            await dmUser(userId, `Role "${roleName}" not found. Try \`${PREFIX}help roles list\` for the full list.`);
            return;
        }

        const r = roles[key];
        const abilityLines = Object.entries(r.abilities || {})
            .map(([n, ab]) => `\`${n}\` — ${ab.uses === Infinity ? '∞ uses' : `${ab.uses} use(s)`}${ab.msg ? ` *(target notified)*` : ''}`)
            .join('\n') || 'No active abilities.';

        await dmUser(userId, embed(`> Role Info: ${key}`, [
            { name: 'Description', value: r.txt },
            { name: 'Team', value: `${r.team}${r.type ? ` (${r.type})` : ''}` },
            { name: 'Abilities', value: abilityLines },
            { name: 'Immunities', value: Object.entries(r.immunity).filter(([, v]) => v).map(([k]) => k).join(', ') || 'None' },
            { name: 'Can skip action?', value: r.canSleep ? 'Yes' : 'No' },
        ]));
        return;
    }

    // Default general help menu
    const general = `\`${PREFIX}help\` \u2014 This list\n\`${PREFIX}ping\` \u2014 Latency check\n\`${PREFIX}info\` \u2014 How to play\n\`${PREFIX}settings\` \u2014 View/change settings\n\`${PREFIX}version\` \u2014 Bot version`;
    const gameCmd = `\`${PREFIX}game queue\` \u2014 Open a game lobby *(GM)*\n\`${PREFIX}game join\` \u2014 Join the lobby\n\`${PREFIX}game leave\` \u2014 Leave the lobby\n\`${PREFIX}game start\` \u2014 Start the game *(GM)*\n\`${PREFIX}game end\` \u2014 Force-end the game *(GM)*\n\`${PREFIX}game players\` \u2014 List players\n\`${PREFIX}game stats\` \u2014 Show alive/dead status`;
    const nightCmd = `\`${PREFIX}night start\` \u2014 Begin the night phase *(GM)*\n\`${PREFIX}night end\` \u2014 Force-resolve the night *(GM)*\n\`${PREFIX}lynch\` \u2014 Open a nomination + lynch vote *(day phase)*\n\`${PREFIX}vote <name/yes/no>\` \u2014 Cast a nomination or lynch vote`;
    const dmCmd   = `DM me: \`${PREFIX}action <action> <target>\` \u2014 Perform your night action\nDM me: \`${PREFIX}action sleep\` \u2014 Skip your action (if allowed)\nDM me: \`${PREFIX}help roles list\` \u2014 See all game roles\nDM me: \`${PREFIX}help roles <role>\` \u2014 Get role details`;
    const adminCmd = gm ? `\`${PREFIX}admin restart\` \u2014 Restart bot\n\`${PREFIX}admin add-players <n>\` \u2014 Add test players` : null;

    const fields = [
        { name: 'General', value: general },
        { name: 'Game', value: gameCmd },
        { name: 'Night / Day', value: nightCmd },
        { name: 'Via DM / Help', value: dmCmd },
    ];
    if (adminCmd) fields.push({ name: 'Admin', value: adminCmd });

    await dmUser(userId, embed(`> Help \u2014 ${GAME_TITLE}`, fields));
}


async function msgChannel(game, content) {
    try {
        const ch = await client.channels.fetch(game.channelId);
        if (typeof content === 'string') await ch.send(content);
        else await ch.send({ embeds: [content] });
    } catch (e) { console.error('msgChannel:', e.message); }
}

async function handlePlayerDeathEffects(game, deadPlayer) {
    // 1. Mafioso promotion if Godfather died
    if (deadPlayer.role === 'Godfather') {
        const mafioso = Object.values(game.alive).find(p => p.role === 'Mafioso');
        if (mafioso) {
            mafioso.role = 'Godfather';
            await dmUser(mafioso.id, `👑 The Godfather has died. You are now the **Godfather**. Your kill command is \`${PREFIX}action kill <target>\`.`);
            await msgChannel(game, `_The Godfather has died. Leadership shifts within the shadows…_`);
        }
    }

    // 2. Psychopath targets died (and target was not lynched)
    for (const p of Object.values(game.alive)) {
        if (p.role === 'Psychopath' && p.targetTag === deadPlayer.id) {
            if (!p.targetLynched) {
                p.role = 'Lunatic';
                await dmUser(p.id, `🃏 Your target **${p.targetName}** has died. You have become a **Lunatic**! Trick the town into lynching you to win.`);
            }
        }
    }
}


function getPlayingRole(guild) {
    return guild.roles.cache.find(r => r.name === PLAY_ROLE) || null;
}

function isGM(member) {
    return member?.roles.cache.some(r => r.name === 'Gamemaster') || false;
}

function findPlayer(game, nameFragment) {
    const lower = nameFragment.toLowerCase();
    return Object.values(game.alive).find(p => p.displayName.toLowerCase().startsWith(lower)) || null;
}

function buildNightPending(game) {
    game.nightPending = new Set(
        Object.values(game.alive)
            .filter(p => roles[p.role]?.canTarget)
            .map(p => p.id)
    );
}

async function checkNightOver(game) {
    if (game.nightPending.size > 0 || !game.isNight) return;
    await doResolveNight(game);
}

async function callClaude(prompt) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        throw new Error("No ANTHROPIC_API_KEY env variable found.");
    }
    const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json"
        },
        body: JSON.stringify({
            model: "claude-3-5-haiku-20241022",
            max_tokens: 1200,
            messages: [{ role: "user", content: prompt }]
        })
    });
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
    }
    const data = await response.json();
    return data.content[0].text;
}

async function doResolveNight(game) {
    game.isNight = false;

    // Cache actions/day before resolveNight resets/mutates them
    const nightActionsCopy = { ...game.nightActions };
    const mafiosoKillCopy = game.mafiosoKill;
    const dayBeforeResolve = game.day;

    await resolveNight(game, dmUser);

    let narrativeText = '';
    let summaryText = '';
    let rolesText = '';
    let useClaude = false;

    if (process.env.ANTHROPIC_API_KEY) {
        try {
            const deadPlayersInfo = game.nightlyDead.map(tag => {
                const p = game.dead[tag];
                return `- ${p.displayName} (Role: ${p.role}, Cause of Death: ${p.causeOfDeath})`;
            }).join('\n') || 'None';

            const alivePlayersInfo = Object.values(game.alive).map(p => `- ${p.displayName} (Role: ${p.role})`).join('\n');

            const actionsInfo = Object.entries(nightActionsCopy).map(([id, a]) => {
                const actor = game.alive[id] || game.dead[id];
                const target = game.alive[a.target] || game.dead[a.target];
                const actorName = actor ? actor.displayName : id;
                const targetName = target ? target.displayName : (a.target || 'None');
                return `- ${actorName} (${a.role}) performed action "${a.action}" on target ${targetName}`;
            }).join('\n');

            const deathHistoryInfo = (game.deathHistory || []).map(h => `- Night ${h.night}: ${h.playerName} (${h.role}) killed by/died of "${h.cause}"`).join('\n') || 'No previous deaths.';

            const prompt = `You are the gamemaster and narrator for the social deduction game "Town of Charlotte".
Last night (Night ${dayBeforeResolve}) just resolved. You must generate:
1. An immersive, creative story narrative of the night's events and morning discoveries.
2. A direct summary of the key actions that occurred.
3. A reveal of the roles of any players who died last night.

Here is the data for the night:
- Night: ${dayBeforeResolve}
- Dead players from last night:
${deadPlayersInfo}

- Alive players:
${alivePlayersInfo}

- Raw actions submitted:
${actionsInfo}
${mafiosoKillCopy ? `Note: Mafia targeted ${game.alive[mafiosoKillCopy]?.displayName || game.dead[mafiosoKillCopy]?.displayName || mafiosoKillCopy} for a kill.` : ''}

- Previous kills history (for continuity and style references):
${deathHistoryInfo}

Please output your response exactly in this format with these three tags:

[NARRATIVE]
<Write 1-3 paragraphs of immersive, engaging, and dramatic story prose about the night's events.
Rule: Shift the narrative focus to a POV that is most pertinent to this night's actions. This could be an alive player "visiting in the morning" who did nothing that night, or the town collectively finding a body. Keep these POVs fresh, new, and different.
Rule: Reference details/style of previous kills if relevant (e.g. claw marks for werewolf, stab wounds for serial killer, etc.).>

[SUMMARY]
<Provide a direct, concise summary of the key actions (e.g. who protected who, who attacked who, who died).
Follow this style:
Mark -> protected Sara.
Tom -> attacked Sara.
Mark and Tom killed each other.>

[ROLES]
<List the roles of the players who died last night.
Follow this style:
Mark was the Bodyguard.
Tom was the Mafioso.>`;

            const responseText = await callClaude(prompt);

            const narrativeMatch = responseText.match(/\[NARRATIVE\]([\s\S]*?)(?=\[SUMMARY\]|$)/i);
            const summaryMatch   = responseText.match(/\[SUMMARY\]([\s\S]*?)(?=\[ROLES\]|$)/i);
            const rolesMatch     = responseText.match(/\[ROLES\]([\s\S]*?)$/i);

            if (narrativeMatch) narrativeText = narrativeMatch[1].trim();
            if (summaryMatch) summaryText = summaryMatch[1].trim();
            if (rolesMatch) rolesText = rolesMatch[1].trim();

            if (narrativeText && (summaryText || rolesText)) {
                useClaude = true;
            }
        } catch (e) {
            console.error('Failed to generate story narrative with Claude:', e.message);
        }
    }

    if (!useClaude) {
        narrativeText = `🌅 The night has ended, and the morning sun rises over Charlotte. The town gathers to see who survived the cold darkness...`;

        const summaryLines = [];
        for (const [id, a] of Object.entries(nightActionsCopy)) {
            const actor = game.alive[id] || game.dead[id];
            const target = game.alive[a.target] || game.dead[a.target];
            if (actor && target) {
                if (a.action === 'guard') {
                    summaryLines.push(`${actor.displayName} -> protected ${target.displayName}.`);
                } else if (['kill', 'shoot', 'execute', 'rampage', 'explode'].includes(a.action)) {
                    summaryLines.push(`${actor.displayName} -> attacked ${target.displayName}.`);
                } else if (a.action === 'heal') {
                    summaryLines.push(`${actor.displayName} -> healed ${target.displayName}.`);
                } else if (a.action === 'block' || a.action === 'hypnotize') {
                    summaryLines.push(`${actor.displayName} -> role-blocked ${target.displayName}.`);
                }
            }
        }
        if (mafiosoKillCopy) {
            const target = game.alive[mafiosoKillCopy] || game.dead[mafiosoKillCopy];
            if (target) {
                summaryLines.push(`Mafia -> attacked ${target.displayName}.`);
            }
        }

        for (const deadTag of game.nightlyDead) {
            const deadPlayer = game.dead[deadTag];
            if (deadPlayer) {
                summaryLines.push(`${deadPlayer.displayName} died of "${deadPlayer.causeOfDeath}".`);
            }
        }

        summaryText = summaryLines.join('\n');

        const rolesLines = [];
        for (const deadTag of game.nightlyDead) {
            const deadPlayer = game.dead[deadTag];
            if (deadPlayer) {
                rolesLines.push(`${deadPlayer.displayName} was the ${deadPlayer.role}.`);
            }
        }
        rolesText = rolesLines.join('\n');
    }

    const fields = [];
    if (useClaude) {
        fields.push({ name: '📖  Story Narrative', value: narrativeText });
    }
    fields.push({ name: '📊  Direct Summary', value: summaryText || 'No actions resolved.' });
    if (rolesText) {
        fields.push({ name: '🎴  Roles Revealed', value: rolesText });
    }

    if (game.nightlyDead.length > 0) {
        fields.push({
            name: '📝  Last Will & Testament',
            value: `To the deceased (${game.nightlyDead.map(tag => game.dead[tag]?.displayName).join(', ')}): This is your last chance to share your last will and testament (who you think killed you, any information you gathered that you hadn't shared, etc.) before you are officially "dead". You may post it in the chat or share it in person on your own terms.`
        });
    }

    if (config.publicNightResults) {
        await msgChannel(game, { embeds: [embed(`☀️ Day ${game.day} — Night Report`, fields, `${PREFIX}help for commands`)] });
    } else {
        if (game.master) {
            await dmUser(game.master, embed(`☀️ Day ${game.day} — Night Report`, fields, `Read these results aloud to the channel!`));
        }
        await msgChannel(game, `☀️ **Day ${game.day}** has begun. The Gamemaster has been DMed the night report.`);
    }

    const logLines = Object.entries(nightActionsCopy)
        .map(([id, a]) => {
            const actor = game.alive[id] || game.dead[id];
            const target = game.alive[a.target] || game.dead[a.target];
            const actorName = actor ? actor.displayName : id;
            const targetName = target ? target.displayName : (a.target || '(auto)');
            return `**${actorName}** → ${a.action} → ${targetName}`;
        });
    if (game.master) {
        await dmUser(game.master, embed('📋  Night Log (GM)',
            logLines.length ? logLines.map(l => ({ name: '\u200b', value: l })) : [{ name: '\u200b', value: 'No actions.' }]
        ));
    }

    // Handle death side effects for all players who died tonight
    for (const deadTag of game.nightlyDead) {
        const deadPlayer = game.dead[deadTag];
        if (deadPlayer) {
            await handlePlayerDeathEffects(game, deadPlayer);
        }
    }

    const { winner, reason } = checkWinConditions(game);
    if (winner) { await endGame(game, reason); return; }

    // Reset day-phase lynch state
    game.lynch = null;
    game.lynchedToday = false;

    if (config.publicNightResults) {
        await msgChannel(game, `☀️ **Day ${game.day}** has begun. Discuss freely, then use \`${PREFIX}lynch\` to open a nomination vote.`);
    } else {
        await msgChannel(game, `GM, please read the results. When ready, discuss freely and use \`${PREFIX}lynch\` to open a nomination vote.`);
    }
}

async function endGame(game, reason) {
    const { winner } = checkWinConditions(game);
    const allPlayers = Object.values({ ...game.alive, ...game.dead });
    const winners = [];

    for (const p of allPlayers) {
        const r = roles[p.role];
        if (!r) continue;

        if (winner === 'town' && r.team === 'town') {
            winners.push(p);
        } else if (winner === 'mafia' && r.team === 'mafia') {
            winners.push(p);
        } else if (winner === 'neutral') {
            if (r.type === 'killing') {
                if (game.alive[p.id]) winners.push(p);
            }
        }

        if (p.role === 'Survivor' && game.alive[p.id]) {
            winners.push(p);
        }
        if (p.role === 'Witch' && (winner === 'town' || winner === 'mafia' || winner === 'neutral')) {
            winners.push(p);
        }
        if (p.role === 'Lunatic' && p.causeOfDeath === 'lynched by the town') {
            winners.push(p);
        }
        if (p.role === 'Psychopath' && p.targetLynched) {
            winners.push(p);
        }
    }

    const winnerNames = winners.map(p => `**${p.displayName}** (${p.role})`).join('\n') || 'Nobody';

    await msgChannel(game, { embeds: [embed('\ud83c\udfc6  Game Over', [
        { name: reason, value: 'Thanks for playing!' },
        { name: '🏆 Winners', value: winnerNames }
    ])] });

    const reveal = Object.values({ ...game.alive, ...game.dead })
        .map(p => `**${p.displayName}** \u2014 ${p.role}`).join('\n');
    await msgChannel(game, { embeds: [embed('\ud83d\udcdc  Full Role Reveal', [{ name: 'All players', value: reveal || 'None' }])] });

    try {
        const guild = await client.guilds.fetch(game.guildId);
        const playRole = getPlayingRole(guild);
        for (const p of Object.values({ ...game.alive, ...game.dead })) {
            try { const m = await guild.members.fetch(p.id); if (playRole) await m.roles.remove(playRole); } catch { }
        }
        if (game.mafiaChannelId) {
            try { const mCh = await guild.channels.fetch(game.mafiaChannelId); await mCh.delete(); } catch { }
        }
    } catch { }
    
    games[game.guildId] = freshGame();
}

client.once('ready', () => {
    console.log(`\u2705 ${client.user.tag} online \u2014 ${VERSION}`);
    client.user.setActivity(`${PREFIX}help`);
});

// ── Guild message handler ─────────────────────────────────────────────────────
client.on('messageCreate', async msg => {
    if (msg.author.bot) return;
    if (msg.channel.type === ChannelType.DM) return;

    const guildId = msg.guild.id;
    if (!games[guildId]) {
        games[guildId] = freshGame();
    }
    const game = games[guildId];

    // ── Blackmail enforcement: silently delete messages from blackmailed players ──
    if (game.playing && !game.isNight && game.blackmailed.includes(msg.author.id)) {
        // Only suppress non-command messages during the day phase
        if (!msg.content.startsWith(PREFIX)) {
            try { await msg.delete(); } catch {}
            try { await msg.author.send('🤐 You have been blackmailed and cannot speak during today\'s day phase.'); } catch {}
            return;
        }
    }

    if (!msg.content.startsWith(PREFIX)) return;

    const args    = msg.content.slice(PREFIX.length).trim().split(/\s+/g);
    const command = args.shift().toLowerCase();
    const gm      = isGM(msg.member);
    const tag     = msg.author.id;
    const listed  = !!game.alive[tag];

    // ── help ──────────────────────────────────────────────────────────────
    if (command === 'help') {
        await sendHelp(msg.author.id, args, gm);
        return;
    }

    // ── ping ──────────────────────────────────────────────────────────────
    if (command === 'ping') {
        const tmp = await msg.channel.send('Pinging\u2026');
        return tmp.edit(`Pong! \`${tmp.createdTimestamp - msg.createdTimestamp}ms\``);
    }

    // ── info ──────────────────────────────────────────────────────────────
    if (command === 'info') {
        return msg.channel.send({ embeds: [embed(`> ${GAME_TITLE} \u2014 How to Play`, [
            { name: 'Factions', value: '**Town** \u2014 Identify and eliminate all Mafia and Neutral Killers.\n**Mafia** \u2014 Secretly eliminate the Town and gain control.\n**Neutral** \u2014 Each has unique solo win conditions.' },
            { name: 'Night Phase', value: 'DM me your action. Roles act in priority order. Results are announced at sunrise.' },
            { name: 'Day Phase', value: 'Discuss publicly. Any player may start a lynch with `.lynch`.' },
        ])] });
    }

    // ── version ───────────────────────────────────────────────────────────
    if (command === 'version') {
        return msg.channel.send({ embeds: [embed(`> Version`, [{ name: `Running ${VERSION}`, value: 'See GitHub for changelog.' }])] });
    }

    // ── game ──────────────────────────────────────────────────────────────
    if (command === 'game') {
        const sub = args[0];

        if (sub === 'queue' || sub === 'create') {
            if (!gm) return msg.reply('you must be a Gamemaster to queue a game.');
            if (game.queued || game.playing) return msg.reply('a game is already in progress.');
            game.queued    = true;
            game.master    = tag;
            game.guildId   = msg.guild.id;
            game.channelId = msg.channel.id;
            await dmUser(msg.author.id, embed('> You are the Gamemaster', [
                { name: `You have queued a ${GAME_TITLE} game.`, value: `Players can join with \`${PREFIX}game join\`. Start with \`${PREFIX}game start\` when ready.` },
            ]));
            return msg.channel.send({ embeds: [embed('> Game Queued', [
                { name: `A new ${GAME_TITLE} game has been queued.`, value: `Join with \`${PREFIX}game join\`. Waiting for players\u2026` },
            ])] });
        }

        if (sub === 'join') {
            if (!game.queued) return msg.reply('no game is currently open to join.');
            if (game.tutorial) return msg.reply('this is a tutorial game; no other players may join.');
            if (listed) return msg.reply('you have already joined.');
            if (tag === game.master) return msg.reply('you are the Gamemaster and cannot join the game as a player.');
            if (Object.keys(game.alive).length >= MAX_PLAYERS) return msg.reply(`the game is full (${MAX_PLAYERS} players max).`);
            game.alive[tag] = new Player(msg.author);
            const playRole = getPlayingRole(msg.guild);
            if (playRole) await msg.member.roles.add(playRole).catch(() => {});
            await dmUser(msg.author.id, embed('> You Joined!', [
                { name: `Welcome to ${GAME_TITLE}!`, value: `You will receive your role when the game starts. Stand by\u2026` },
            ]));
            return msg.channel.send(`_${msg.author} has joined the game. (${Object.keys(game.alive).length} players)_`);
        }

        if (sub === 'leave') {
            if (tag === game.master) return msg.reply(`you are the Gamemaster. Use \`${PREFIX}game end\` to end the game.`);
            if (!listed) return msg.reply('you are not in the current game.');
            if (game.playing) {
                const p = game.alive[tag];
                game.dead[tag] = { ...p, causeOfDeath: 'suicide' };
                delete game.alive[tag];
                
                if (game.isNight) {
                    game.nightPending.delete(tag);
                }

                const playRole = getPlayingRole(msg.guild);
                if (playRole) await msg.member.roles.remove(playRole).catch(() => {});
                await msg.channel.send(`_${msg.author} (**${p.role}**) has committed suicide and is dead._`);
                
                await handlePlayerDeathEffects(game, p);

                if (game.isNight) {
                    await checkNightOver(game);
                }

                const { winner, reason } = checkWinConditions(game);
                if (winner) await endGame(game, reason);
                return;
            }
            delete game.alive[tag];
            const playRole = getPlayingRole(msg.guild);
            if (playRole) await msg.member.roles.remove(playRole).catch(() => {});
            return msg.channel.send(`_${msg.author} has left the game. (${Object.keys(game.alive).length} players)_`);
        }

        if (sub === 'players') {
            if (!game.queued && !game.playing) return msg.reply('no game is active.');
            const aliveList = Object.values(game.alive).map(p => p.displayName).join('\n') || 'None';
            const deadList  = Object.values(game.dead).map(p => `~~${p.displayName}~~ (${p.role})`).join('\n') || 'None';
            const fields = [{ name: `Alive (${Object.keys(game.alive).length})`, value: aliveList }];
            if (game.playing) fields.push({ name: `Dead (${Object.keys(game.dead).length})`, value: deadList });
            return msg.channel.send({ embeds: [embed('> Players', fields)] });
        }

        if (sub === 'stats') {
            if (!game.playing) return msg.reply('no game is currently active.');
            const aliveEntries = Object.values(game.alive);
            const deadEntries  = Object.values(game.dead);
            const aliveLines = aliveEntries.length ? aliveEntries.map((p, i) => `\`${i + 1}.\` 🟢 **${p.displayName}**`).join('\n') : '_Nobody is alive._';
            const deadLines = deadEntries.length ? deadEntries.map(p => `💀 ~~${p.displayName}~~ — ${p.role} *(${p.causeOfDeath || 'unknown'})*`).join('\n') : '_No deaths yet._';
            return msg.channel.send({ embeds: [embed(`☀️  Day ${game.day} — Game Stats`, [
                { name: `🟢 Alive — ${aliveEntries.length}`, value: aliveLines },
                { name: `💀 Dead — ${deadEntries.length}`, value: deadLines },
            ])] });
        }

        if (sub === 'start') {
            if (!gm) return msg.reply('you must be a Gamemaster to start the game.');
            if (!game.queued) return msg.reply('no game has been queued yet.');
            const n = Object.keys(game.alive).length;
            if (n < MIN_PLAYERS) return msg.reply(`need at least ${MIN_PLAYERS} players (currently ${n}).`);
            if (n > MAX_PLAYERS) return msg.reply(`too many players (max ${MAX_PLAYERS}).`);

            game.queued  = false;
            game.playing = true;
            game.day     = 1;
            game.isNight = true;
            game.nightActions = {};
            game.jailedThisNight = [];
            game.blackmailed = [];
            assignRoles(game.alive);
            buildNightPending(game);

            // Assign target to Psychopaths
            const allPlayers = Object.values(game.alive);
            const psychopaths = allPlayers.filter(p => p.role === 'Psychopath');
            if (psychopaths.length) {
                const townPlayers = allPlayers.filter(p => roles[p.role]?.team === 'town' && p.role !== 'Jailor');
                const backupTown = allPlayers.filter(p => roles[p.role]?.team === 'town');
                const genericTargets = allPlayers.filter(p => p.role !== 'Psychopath');
                
                for (const psycho of psychopaths) {
                    let targetPool = townPlayers;
                    if (!targetPool.length) targetPool = backupTown;
                    if (!targetPool.length) targetPool = genericTargets;
                    
                    if (targetPool.length) {
                        const target = targetPool[Math.floor(Math.random() * targetPool.length)];
                        psycho.targetTag = target.tag;
                        psycho.targetName = target.displayName;
                    }
                }
            }

            for (const p of Object.values(game.alive)) {
                const r = roles[p.role];
                const abilityList = Object.entries(r.abilities || {})
                    .map(([name, ab]) => `\`${name}\` \u2014 ${ab.uses === Infinity ? '\u221e uses' : `${ab.uses} use(s)`}`)
                    .join('\n') || 'No active abilities.';
                let roleMsg = r.txt;
                if (p.role === 'Psychopath' && p.targetName) {
                    roleMsg += `\n\n🎯 **Your Target:** **${p.targetName}**`;
                }
                await dmUser(p.id, embed(`> Night 1 \u2014 Your Role: ${p.role}`, [
                    { name: 'Role Description', value: roleMsg },
                    { name: 'Abilities', value: abilityList },
                ], `DM me: ${PREFIX}action <ability> <target>`));
            }
            const mafiaPlayers = Object.values(game.alive).filter(p => roles[p.role]?.team === 'mafia');
            if (mafiaPlayers.length) {
                const mafiaNames = mafiaPlayers.map(p => `**${p.displayName}** (${p.role})`).join('\n');
                try {
                    const gmMember  = await msg.guild.members.fetch(msg.author.id);
                    const permissionOverwrites = [
                        { id: msg.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                        { id: gmMember.id,  allow: [PermissionFlagsBits.ViewChannel] },
                    ];
                    for (const mp of mafiaPlayers) permissionOverwrites.push({ id: mp.id, allow: [PermissionFlagsBits.ViewChannel] });
                    const mCh = await msg.guild.channels.create({
                        name: MAFIA_CH, type: ChannelType.GuildText, permissionOverwrites,
                        topic: `Private Mafia channel.`,
                    });
                    game.mafiaChannelId = mCh.id;
                    await mCh.send(embed('> Mafia HQ', [{ name: 'Your team:', value: mafiaNames }]));
                } catch (e) { console.error('Mafia channel creation failed:', e.message); }
            }
            return msg.channel.send({ embeds: [embed(`> ${GAME_TITLE} Has Begun!`, [
                { name: 'Night 1 has started.', value: 'Roles have been sent via DM.' },
            ])] });
        }

        if (sub === 'end') {
            if (!gm) return msg.reply('you must be a Gamemaster to end the game.');
            if (!game.playing && !game.queued) return msg.reply('no game is currently active.');
            
            if (game.queued) {
                const playRole = getPlayingRole(msg.guild);
                if (playRole) {
                    for (const p of Object.values(game.alive)) {
                        try { const m = await msg.guild.members.fetch(p.id); await m.roles.remove(playRole); } catch {}
                    }
                }
                games[guildId] = freshGame();
                return msg.channel.send('🛑 The Gamemaster has cancelled the game lobby.');
            }
            
            return endGame(game, 'The Gamemaster has ended the game.');
        }
        return msg.reply(`Unknown game sub-command. Try \`${PREFIX}help\`.`);
    }

    // ── night ─────────────────────────────────────────────────────────────
    if (command === 'night') {
        if (!gm) return msg.reply('you must be a Gamemaster to control night phases.');
        if (!game.playing) return msg.reply('no game is currently active.');
        if (args[0] === 'start') {
            if (game.isNight) return msg.reply('it is already night.');
            if (game.lynch) return msg.reply('a lynch vote is still in progress. Resolve it first with `.lynch tally` or wait.');
            game.isNight = true; game.nightActions = {}; game.jailedThisNight = []; game.blackmailed = []; buildNightPending(game);
            return msg.channel.send({ embeds: [embed(`\ud83c\udf19  Night ${game.day}`, [{ name: 'Night has begun.', value: 'DM me your actions!' }])] });
        }
        if (args[0] === 'end') {
            if (!game.isNight) return msg.reply('it is not currently night.');
            game.nightPending.clear(); return doResolveNight(game);
        }
        return msg.reply(`Use \`${PREFIX}night start\` or \`${PREFIX}night end\`.`);
    }

    // ── lynch ─────────────────────────────────────────────────────────────
    if (command === 'lynch') {
        if (!game.playing || game.isNight) return msg.reply('lynching can only happen during the day phase.');
        if (game.day <= 1 && args[0] !== 'close' && args[0] !== 'tally') return msg.reply('lynching is not allowed on the first day. Discuss and use `.night start` when ready.');

        const sub = args[0]?.toLowerCase();

        // ── .lynch close  (GM only) — tally nominations & move to lynching block ──
        if (sub === 'close') {
            if (!gm) return msg.reply('only the Gamemaster can close nominations.');
            if (!game.lynch || game.lynch.phase !== 'nominating')
                return msg.reply('no nomination phase is currently open.');

            // Fetch fresh reaction counts from the nomination message
            const nomMsg = await game.lynch.nominationMsg.fetch().catch(() => null);
            if (!nomMsg) { game.lynch = null; return msg.reply('could not fetch the nomination message. Lynch cancelled.'); }

            // Tally: reaction emoji → count (excluding the bot itself & non-alive users)
            const allNominationVotes = {}; // voterTag -> nominatedTag

            for (const [emoji, playerTag] of Object.entries(game.lynch.emojiMap)) {
                const reaction = nomMsg.reactions.cache.get(emoji);
                if (reaction) {
                    const users = await reaction.users.fetch();
                    for (const [userId] of users) {
                        if (userId === client.user.id) continue;
                        if (game.alive[userId]) {
                            allNominationVotes[userId] = playerTag;
                        }
                    }
                }
            }

            // Merge in text votes (overwriting/taking precedence)
            for (const [voterTag, nominatedTag] of Object.entries(game.lynch.textVotes)) {
                if (game.alive[voterTag]) {
                    allNominationVotes[voterTag] = nominatedTag;
                }
            }

            // Tally counts from allNominationVotes
            const finalTally = {};
            for (const nominatedTag of Object.values(allNominationVotes)) {
                finalTally[nominatedTag] = (finalTally[nominatedTag] || 0) + 1;
            }

            let topTag = null, topCount = 0;
            for (const [playerTag, count] of Object.entries(finalTally)) {
                if (count > topCount) {
                    topCount = count;
                    topTag = playerTag;
                }
            }

            if (!topTag || topCount === 0) {
                game.lynch = null;
                return msg.channel.send('❌ Nobody received any nominations. The lynch has been cancelled.');
            }

            const onBlock = game.alive[topTag];
            if (!onBlock) { game.lynch = null; return msg.reply('the nominated player is no longer alive. Lynch cancelled.'); }

            game.lynch.phase = 'voting';
            game.lynch.onBlock = topTag;
            game.lynch.textVotes = {}; // reset for the vote phase

            const aliveCount = Object.keys(game.alive).length;
            const needed = Math.ceil((aliveCount * 2) / 3);

            const voteMsg = await msg.channel.send({ embeds: [embed(
                '☠️  Lynching Block — Final Vote',
                [
                    {
                        name: `⚠️ ${onBlock.displayName} is on the lynching block!`,
                        value:
                            `React ✅ to **lynch** them, or ❌ to **spare** them.\n` +
                            `Lynching requires **⅔ of the town** (≥${needed} of ${aliveCount} votes) to pass.\n` +
                            `You may also use \`${PREFIX}vote yes\` or \`${PREFIX}vote no\` instead of reacting.`,
                    },
                    {
                        name: 'How it works',
                        value:
                            'When the GM runs `.lynch tally`, the reactions are counted. ' +
                            'If ✅ votes do **not** reach ⅔ of town, the player is spared — ' +
                            'even if yes outnumbers no.',
                    },
                ],
                `GM: ${PREFIX}lynch tally to resolve`
            )] });
            await voteMsg.react('✅').catch(() => {});
            await voteMsg.react('❌').catch(() => {});

            game.lynch.voteMsg = voteMsg;
            return;
        }

        // ── .lynch tally  (GM only) — count ✅/❌ and execute or spare ──
        if (sub === 'tally') {
            if (!gm) return msg.reply('only the Gamemaster can tally the lynch vote.');
            if (!game.lynch || game.lynch.phase !== 'voting')
                return msg.reply('no lynch vote is currently in progress. Run `.lynch close` first.');

            const vMsg = await game.lynch.voteMsg.fetch().catch(() => null);
            if (!vMsg) { game.lynch = null; return msg.reply('could not fetch the vote message. Lynch cancelled.'); }

            const yesReaction = vMsg.reactions.cache.get('✅');
            const noReaction  = vMsg.reactions.cache.get('❌');

            const finalLynchVotes = {}; // voterTag -> 'yes' | 'no'

            if (yesReaction) {
                const users = await yesReaction.users.fetch();
                for (const [userId] of users) {
                    if (userId === client.user.id) continue;
                    if (game.alive[userId]) {
                        finalLynchVotes[userId] = 'yes';
                    }
                }
            }
            if (noReaction) {
                const users = await noReaction.users.fetch();
                for (const [userId] of users) {
                    if (userId === client.user.id) continue;
                    if (game.alive[userId]) {
                        finalLynchVotes[userId] = 'no';
                    }
                }
            }

            // Merge in text votes cast via .vote yes / .vote no
            for (const [voterTag, voteVal] of Object.entries(game.lynch.textVotes)) {
                if (game.alive[voterTag]) {
                    finalLynchVotes[voterTag] = voteVal;
                }
            }

            let yesVotes = 0;
            let noVotes  = 0;
            for (const voteVal of Object.values(finalLynchVotes)) {
                if (voteVal === 'yes') yesVotes++;
                else noVotes++;
            }

            const aliveCount = Object.keys(game.alive).length;
            const needed = Math.ceil((aliveCount * 2) / 3);
            const onBlock = game.alive[game.lynch.onBlock];

            game.lynch = null; // clear state before any async work

            if (!onBlock) return msg.channel.send('❌ The player on the lynching block is no longer alive. Lynch resolved automatically.');

            if (yesVotes >= needed) {
                // Lynch successful
                game.lynchedToday = true;
                game.dead[onBlock.tag] = { ...onBlock, causeOfDeath: 'lynched by the town' };
                delete game.alive[onBlock.tag];
                const playRole = getPlayingRole(msg.guild);
                try { const m = await msg.guild.members.fetch(onBlock.id); if (playRole) await m.roles.remove(playRole); } catch {}

                // Check if this target lynched was a Psychopath target
                for (const p of Object.values(game.alive)) {
                    if (p.role === 'Psychopath' && p.targetTag === onBlock.tag) {
                        p.targetLynched = true;
                    }
                }

                // ── Lunatic (Jester) special win: if they get lynched, they win immediately ──
                if (onBlock.role === 'Lunatic') {
                    await dmUser(onBlock.id, `🃏 You were **lynched** by the town! You WIN — the Lunatic's goal was achieved!`);
                    await msg.channel.send({ embeds: [embed('🃏  The Lunatic Wins!', [
                        { name: `${onBlock.displayName} was lynched — and that was exactly their plan!`, value: `Their role was **Lunatic**.\n✅ ${yesVotes} yes / ❌ ${noVotes} no (needed ${needed})\n\n*The Lunatic (Jester) wins by tricking the town into lynching them.*` },
                    ])] });
                    
                    await handlePlayerDeathEffects(game, onBlock);

                    const { winner, reason } = checkWinConditions(game);
                    if (winner) return endGame(game, reason);
                    return msg.channel.send(`🃏 The Lunatic has won! The game continues for remaining factions. Use \`${PREFIX}night start\` when ready.`);
                }

                await dmUser(onBlock.id, `☠️ You were **lynched** by the town. Your role was **${onBlock.role}**.`);
                await msg.channel.send({ embeds: [embed('☠️  Lynched!', [
                    { name: `${onBlock.displayName} has been lynched!`, value: `Their role was **${onBlock.role}**.\n✅ ${yesVotes} yes / ❌ ${noVotes} no (needed ${needed})` },
                ])] });

                await handlePlayerDeathEffects(game, onBlock);

                const { winner, reason } = checkWinConditions(game);
                if (winner) return endGame(game, reason);
                return msg.channel.send(`The town has spoken. Use \`${PREFIX}night start\` when ready for the next night.`);
            } else {
                // Not enough votes — spared
                await msg.channel.send({ embeds: [embed('❌  Spared!', [
                    { name: `${onBlock.displayName} did not receive enough votes to be lynched.`, value: `✅ ${yesVotes} yes / ❌ ${noVotes} no (needed ${needed} — fell short!)` },
                ])] });
                return msg.channel.send(`Discussion continues. Use \`${PREFIX}lynch\` to open another nomination, or \`${PREFIX}night start\` to move to night.`);
            }
        }

        // ── .lynch  (no args, anyone) — open nomination phase ──
        if (sub !== 'close' && sub !== 'tally') {
            if (!listed) return msg.reply('you must be alive and in the game to start a lynch vote.');
            if (game.lynchedToday) return msg.reply('a player has already been lynched today. Use `.night start` to proceed to the next night.');
            if (game.lynch) return msg.reply('a lynch vote is already in progress!');

            const aliveList = Object.values(game.alive);
            if (aliveList.length < 2) return msg.reply('not enough players alive to hold a lynch.');

            const NUMBER_EMOJIS = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣'];
            const nominees = aliveList.slice(0, NUMBER_EMOJIS.length);
            const emojiMap = {};
            nominees.forEach((p, i) => { emojiMap[NUMBER_EMOJIS[i]] = p.tag; });

            const nomineeLines = nominees
                .map((p, i) => `${NUMBER_EMOJIS[i]} **${p.displayName}**`)
                .join('\n');

            const nominationMsg = await msg.channel.send({ embeds: [embed(
                '🗳️  Lynch — Nomination Phase',
                [
                    {
                        name: 'Who should face the lynching block?',
                        value: nomineeLines,
                    },
                    {
                        name: 'How to nominate',
                        value:
                            `React with the number next to the player you want to put up for lynching.\n` +
                            `You can also use \`${PREFIX}vote <name>\` as a text alternative.\n\n` +
                            `Once discussion is done, the GM runs \`${PREFIX}lynch close\` to see who ` +
                            `got the most nominations — that player goes on the **lynching block**.\n` +
                            `Then a separate ✅/❌ vote determines if they are actually lynched ` +
                            `(**⅔ of town required to lynch**).`,
                    },
                ],
                `GM: ${PREFIX}lynch close to end nominations`
            )] });

            for (const emoji of Object.keys(emojiMap)) {
                await nominationMsg.react(emoji).catch(() => {});
            }

            game.lynch = {
                phase: 'nominating',
                nominationMsg,
                nominees: nominees.map(p => p.tag),
                emojiMap,
                onBlock: null,
                voteMsg: null,
                textVotes: {},
            };
            return;
        }
    }

    // ── vote ─────────────────────────────────────────────────────────────
    if (command === 'vote') {
        if (!game.playing || game.isNight) return msg.reply('voting can only happen during the day phase.');
        if (!listed) return msg.reply('you must be alive and in the game to vote.');
        if (!game.lynch) return msg.reply(`No lynch vote is in progress. Anyone can start one with \`${PREFIX}lynch\`.`);

        const voteArg = args.join(' ').toLowerCase();

        // ── Nomination phase: .vote <player name> ──
        if (game.lynch.phase === 'nominating') {
            if (!voteArg) return msg.reply(`Specify a player to nominate: \`${PREFIX}vote <name>\`.`);
            // Find nominated player in the emoji map
            const match = game.lynch.nominees
                .map(t => game.alive[t])
                .filter(Boolean)
                .find(p => p.displayName.toLowerCase().startsWith(voteArg));
            if (!match) return msg.reply(`No nominated player found matching "${args.join(' ')}". Check the nomination list above.`);

            game.lynch.textVotes[tag] = match.tag;
            return msg.reply(`🗳️ Your nomination: **${match.displayName}**. The GM will tally when nominations close.`);
        }

        // ── Lynching block phase: .vote yes / .vote no ──
        if (game.lynch.phase === 'voting') {
            if (voteArg !== 'yes' && voteArg !== 'no')
                return msg.reply(`During the lynch vote, use \`${PREFIX}vote yes\` or \`${PREFIX}vote no\`.`);

            const onBlock = game.alive[game.lynch.onBlock];
            if (!onBlock) { game.lynch = null; return msg.reply('the player on the lynching block is no longer alive.'); }

            const prev = game.lynch.textVotes[tag];
            game.lynch.textVotes[tag] = voteArg;
            const changed = prev && prev !== voteArg ? ` *(changed from ${prev})*` : '';
            return msg.reply(`🗳️ Your vote: **${voteArg}** on **${onBlock.displayName}**${changed}. The GM will tally with \`${PREFIX}lynch tally\`.`);
        }

        return msg.reply('Something went wrong with the lynch state. Ask the GM to reset.');
    }

    // ── settings ──────────────────────────────────────────────────────────
    if (command === 'settings') {
        if (game.playing || game.queued) {
            return msg.reply('settings can only be modified when no game is active or queued.');
        }

        const sub = args[0]?.toLowerCase();
        if (!sub) {
            const status = config.publicNightResults ? 'Enabled (posted publicly)' : 'Disabled (DMed to GM)';
            return msg.channel.send({ embeds: [embed(
                '> Game Settings',
                [
                    {
                        name: 'public-results',
                        value: `Status: **${status}**\n` +
                               `Description: Controls whether night resolution results are posted to the public channel or DMed secretly to the GM.\n` +
                               `To change, run \`${PREFIX}settings public-results <on/off>\``
                    }
                ],
                `Prefix: ${PREFIX}`
            )] });
        }

        if (sub === 'public-results') {
            const val = args[1]?.toLowerCase();
            if (val === 'on' || val === 'true' || val === 'enable') {
                config.publicNightResults = true;
                return msg.reply('✅ Night report results will now be posted publicly to the chat channel.');
            } else if (val === 'off' || val === 'false' || val === 'disable') {
                config.publicNightResults = false;
                return msg.reply('✅ Night report results will now be DMed secretly to the Gamemaster.');
            } else {
                return msg.reply(`Invalid value. Use \`${PREFIX}settings public-results on\` or \`${PREFIX}settings public-results off\`.`);
            }
        }

        return msg.reply(`Unknown settings option. Try \`${PREFIX}settings\` to view available options.`);
    }

    // ── roles (public info) ───────────────────────────────────────────────
    if (command === 'roles') {
        const nameArg = args.join(' ');
        if (nameArg) {
            const key = Object.keys(roles).find(k => k.toLowerCase() === nameArg.toLowerCase());
            if (!key) return msg.reply(`Role "${nameArg}" not found.`);
            const r = roles[key];
            return msg.channel.send({ embeds: [embed(`> Role: ${key}`, [
                { name: 'Description', value: r.txt },
                { name: 'Team', value: r.team },
                { name: 'Appears to Investigator as', value: r.looksLike || 'Unknown' },
            ])] });
        }
        const grouped = {};
        for (const [name, r] of Object.entries(roles)) {
            const cat = r.team === 'town' ? `Town (${r.type || '?'})` : r.team === 'mafia' ? 'Mafia' : `Neutral (${r.type || '?'})`;
            grouped[cat] = grouped[cat] || [];
            grouped[cat].push(name);
        }
        const fields = Object.entries(grouped).map(([cat, names]) => ({ name: cat, value: names.join(', ') }));
        return msg.channel.send({ embeds: [embed('> All Roles', fields, `${PREFIX}roles <name> for details`)] });
    }

    // ── admin ─────────────────────────────────────────────────────────────
    if (command === 'admin') {
        if (!gm) return msg.reply('admin commands are Gamemaster-only.');

        if (args[0] === 'restart') {
            await msg.channel.send('Restarting\u2026');
            client.destroy();
            client.login(TOKEN);
            return;
        }

        if (args[0] === 'add-players') {
            if (!game.queued) return msg.reply('no game is queued.');
            const count = parseInt(args[1]);
            if (!count || count < 1) return msg.reply('provide a valid number.');
            let added = 0;
            for (let i = 0; i < count; i++) {
                if (Object.keys(game.alive).length >= MAX_PLAYERS) break;
                const fakeTag = `TestPlayer_${Object.keys(game.alive).length}#0000`;
                game.alive[fakeTag] = {
                    tag: fakeTag, displayName: `TestPlayer_${i}`,
                    id: msg.author.id, role: null, guiltyDeath: false,
                };
                added++;
            }
            return msg.channel.send(`Added ${added} test player(s). Total: ${Object.keys(game.alive).length}`);
        }

        if (args[0] === 'roles') {
            // DM GM the secret role list
            if (!game.playing) return msg.reply('no game is active.');
            const list = Object.values(game.alive)
                .map(p => `**${p.displayName}** \u2014 ${p.role}`)
                .join('\n');
            await dmUser(msg.author.id, embed('> Secret Role List (GM)', [{ name: 'Players', value: list || 'None' }]));
            return msg.reply('Sent you the role list via DM.');
        }

        return msg.reply(`Unknown admin sub-command.`);
    }
});

// ── DM handler (night actions) ────────────────────────────────────────────────
client.on('messageCreate', async msg => {
    if (msg.author.bot) return;
    if (msg.channel.type !== ChannelType.DM) return;
    if (!msg.content.startsWith(PREFIX)) return;

    const args    = msg.content.slice(PREFIX.length).trim().split(/\s+/g);
    const command = args.shift().toLowerCase();
    const tag     = msg.author.id;

    // Find the active game containing the player
    let game = null;
    for (const g of Object.values(games)) {
        if (g.alive[tag] || g.dead[tag] || g.master === tag) {
            game = g;
            break;
        }
    }

    // ── help (DM) ──────────────────────────────────────────────────────────
    if (command === 'help') {
        const isGameMaster = game ? (game.master === tag) : false;
        await sendHelp(msg.author.id, args, isGameMaster);
        return;
    }

    if (!game) {
        return msg.channel.send('You are not in any active game.');
    }

    const player  = game.alive[tag];

    // ── game roles / role info ─────────────────────────────────────────────
    if (command === 'game') {
        if (args[0] === 'roles') {
            const grouped = {};
            for (const [name, r] of Object.entries(roles)) {
                const cat = r.team === 'town' ? `Town (${r.type})` : r.team === 'mafia' ? 'Mafia' : `Neutral (${r.type})`;
                grouped[cat] = grouped[cat] || [];
                grouped[cat].push(name);
            }
            const fields = Object.entries(grouped).map(([cat, names]) => ({ name: cat, value: names.join(', ') }));
            return msg.channel.send({ embeds: [embed('> All Roles', fields, `${PREFIX}game role <name> for details`)] });
        }
        if (args[0] === 'role') {
            const key = Object.keys(roles).find(k => k.toLowerCase() === args.slice(1).join(' ').toLowerCase());
            if (!key) return msg.reply(`Role not found. Try \`${PREFIX}game roles\` for the full list.`);
            const r = roles[key];
            const abilityLines = Object.entries(r.abilities || {})
                .map(([n, ab]) => `\`${n}\` — ${ab.uses === Infinity ? '∞ uses' : `${ab.uses} use(s)`}${ab.msg ? ` *(target notified)*` : ''}`)
                .join('\n') || 'No active abilities.';
            return msg.channel.send({ embeds: [embed(`> Role Info: ${key}`, [
                { name: 'Description', value: r.txt },
                { name: 'Team', value: `${r.team}${r.type ? ` (${r.type})` : ''}` },
                { name: 'Abilities', value: abilityLines },
                { name: 'Immunities', value: Object.entries(r.immunity).filter(([, v]) => v).map(([k]) => k).join(', ') || 'None' },
                { name: 'Can skip action?', value: r.canSleep ? 'Yes' : 'No' },
            ])] });
        }
        return msg.channel.send(`Try \`${PREFIX}game roles\` or \`${PREFIX}game role <name>\`.`);
    }

    // ── action ─────────────────────────────────────────────────────────────
    if (command === 'action') {
        if (!game.playing)  return msg.channel.send('There is no active game right now.');
        if (!game.isNight)  return msg.channel.send('It is not currently night. Wait for the GM to start the night phase.');
        if (!player)        return msg.channel.send('You are not in the current game, or you are dead.');
        if (!game.nightPending.has(tag)) return msg.channel.send('You have already submitted your action for tonight.');

        const role  = roles[player.role];
        let action = args[0];
        let targetName = '';

        // Extract action and targetName correctly to support spaces in targets
        const firstSpaceIdx = msg.content.indexOf(' ');
        if (firstSpaceIdx !== -1) {
            const afterCmd = msg.content.slice(firstSpaceIdx).trim();
            const spaceAfterAbility = afterCmd.indexOf(' ');
            if (spaceAfterAbility !== -1) {
                action = afterCmd.slice(0, spaceAfterAbility).trim();
                targetName = afterCmd.slice(spaceAfterAbility).trim();
            } else {
                action = afterCmd;
            }
        }

        // Sleep
        if (action === 'sleep') {
            if (!role.canSleep) return msg.channel.send(`**${player.role}** cannot skip their action.`);
            game.nightActions[tag] = { action: 'sleep', target: null, role: player.role };
            game.nightPending.delete(tag);
            await msg.channel.send('You have gone to sleep. Sweet dreams. 😴');
            await checkNightOver(game);
            return;
        }

        // Validate ability name
        if (!role.abilities[action] && action !== 'execute') {
            const valid = Object.keys(role.abilities).join(', ') || 'none';
            return msg.channel.send(`Unknown action \`${action}\`. Your available actions: **${valid}**${role.canSleep ? ', sleep' : ''}.`);
        }

        const ability = role.abilities[action];

        // Check uses remaining
        if (ability && ability.uses !== Infinity && ability.uses < 1) {
            return msg.channel.send(`You have no uses of \`${action}\` remaining.`);
        }

        // Self-targeting
        if (!targetName) return msg.channel.send(`Provide a target name: \`${PREFIX}action ${action} <player name>\``);

        let targetPlayer;
        if (targetName.toLowerCase() === player.displayName.toLowerCase()) {
            // Targeting self
            if (!role.canTargetSelf) return msg.channel.send("You cannot target yourself.");
            targetPlayer = player;
        } else {
            // Amnesiac can target dead players
            if (action === 'remember') {
                if (game.day < 3) return msg.channel.send("You can only remember a role on night 3 or later.");
                const lower = targetName.toLowerCase();
                targetPlayer = Object.values(game.dead).find(p => p.displayName.toLowerCase().startsWith(lower));
                if (!targetPlayer) return msg.channel.send(`No dead player found matching "${targetName}".`);
            } else {
                targetPlayer = findPlayer(game, targetName);
                if (!targetPlayer) return msg.channel.send(`No alive player found matching "${targetName}". Check spelling or use a partial name.`);
            }
        }

        // Special: Godfather sets mafiosoKill
        if (player.role === 'Godfather' && action === 'kill') {
            game.mafiosoKill = targetPlayer.tag;
            // Notify the Mafioso (if alive)
            const mafioso = Object.values(game.alive).find(p => p.role === 'Mafioso');
            if (mafioso) await dmUser(mafioso.id, `🔪 The Godfather has ordered the kill on **${targetPlayer.displayName}** tonight.`);
        }

        // Special: Jailor jail registers the jailed target
        if (player.role === 'Jailor' && action === 'jail') {
            game.jailedThisNight.push(targetPlayer.tag);
        }

        // Record the action
        game.nightActions[tag] = { action, target: targetPlayer.tag, role: player.role };

        // Decrement uses if finite
        if (ability && ability.uses !== Infinity) ability.uses--;

        // Confirmation to actor
        const selfTarget = targetPlayer.tag === tag;
        await msg.channel.send(`✅ Action recorded: **${action}** → **${selfTarget ? 'yourself' : targetPlayer.displayName}**.`);

        // Jailor: multi-action — check if they have execute available too
        if (player.role === 'Jailor' && action === 'jail') {
            const executeUses = role.abilities.execute?.uses || 0;
            if (executeUses > 0) {
                await msg.channel.send(`You may also use \`${PREFIX}action execute ${targetPlayer.displayName}\` to execute your prisoner, or \`${PREFIX}action sleep\` to skip your execute.`);
                // Don't remove from pending yet — wait for execute or sleep
                return;
            }
        }

        // Remove from pending and check if night is over
        game.nightPending.delete(tag);
        await checkNightOver(game);
        return;
    }

    return msg.channel.send(`Unknown command. In-game commands: \`${PREFIX}action <ability> <target>\`, \`${PREFIX}game roles\`, \`${PREFIX}game role <name>\`.`);
});

// ── Login ─────────────────────────────────────────────────────────────────────
client.login(TOKEN);
