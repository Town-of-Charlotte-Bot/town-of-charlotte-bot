require('dotenv').config();
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
let game = freshGame();

function Player(user) {
    this.tag         = user.tag;
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

async function msgChannel(content) {
    try {
        const ch = await client.channels.fetch(game.channelId);
        if (typeof content === 'string') await ch.send(content);
        else await ch.send({ embeds: [content] });
    } catch (e) { console.error('msgChannel:', e.message); }
}

function getPlayingRole(guild) {
    return guild.roles.cache.find(r => r.name === PLAY_ROLE) || null;
}

function isGM(member) {
    return member?.roles.cache.some(r => r.name === 'Gamemaster') || false;
}

function findPlayer(nameFragment) {
    const lower = nameFragment.toLowerCase();
    return Object.values(game.alive).find(p => p.displayName.toLowerCase().startsWith(lower)) || null;
}

function buildNightPending() {
    game.nightPending = new Set(
        Object.values(game.alive)
            .filter(p => roles[p.role]?.canTarget)
            .map(p => p.tag)
    );
}

async function checkNightOver() {
    if (game.nightPending.size > 0 || !game.isNight) return;
    await doResolveNight();
}

async function doResolveNight() {
    game.isNight = false;
    const announcements = await resolveNight(game, dmUser);
    const fields = announcements.map(line => ({ name: '\u200b', value: line }));
    await msgChannel({ embeds: [embed(`\u2600\ufe0f  Day ${game.day} \u2014 Night Report`, fields, `${PREFIX}help for commands`)] });

    const logLines = Object.entries(game.nightActions)
        .map(([tag, a]) => `**${tag}** \u2192 ${a.action} \u2192 ${a.target || '(auto)'}`);
    const gm = Object.values({ ...game.alive, ...game.dead }).find(p => p.tag === game.master);
    if (gm) {
        await dmUser(gm.id, embed('\ud83d\udccb  Night Log (GM)',
            logLines.length ? logLines.map(l => ({ name: '\u200b', value: l })) : [{ name: '\u200b', value: 'No actions.' }]
        ));
    }

    // Check for Mafioso promotion (Godfather died during the night)
    if (!Object.values(game.alive).find(p => p.role === 'Godfather')) {
        const mafioso = Object.values(game.alive).find(p => p.role === 'Mafioso');
        if (mafioso) {
            mafioso.role = 'Godfather';
            await dmUser(mafioso.id, `\ud83d\udc51 The Godfather has fallen. You are now the **Godfather**. Use \`${PREFIX}action kill <target>\` tonight.`);
        }
    }

    const { winner, reason } = checkWinConditions(game);
    if (winner) { await endGame(reason); return; }

    // Reset day-phase lynch state
    game.lynch = null;
    game.lynchedToday = false;

    await msgChannel(`\u2600\ufe0f  **Day ${game.day}** has begun. Discuss freely, then use \`${PREFIX}lynch\` to open a nomination vote.`);
}

async function endGame(reason) {
    await msgChannel({ embeds: [embed('\ud83c\udfc6  Game Over', [{ name: reason, value: 'Thanks for playing!' }])] });
    const reveal = Object.values({ ...game.alive, ...game.dead })
        .map(p => `**${p.displayName}** \u2014 ${p.role}`).join('\n');
    await msgChannel({ embeds: [embed('\ud83d\udcdc  Full Role Reveal', [{ name: 'All players', value: reveal || 'None' }])] });

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
    game = freshGame();
}

client.once('ready', () => {
    console.log(`\u2705 ${client.user.tag} online \u2014 ${VERSION}`);
    client.user.setActivity(`${PREFIX}help`);
});

// ── Guild message handler ─────────────────────────────────────────────────────
client.on('messageCreate', async msg => {
    if (msg.author.bot) return;
    if (msg.channel.type === ChannelType.DM) return;

    // ── Blackmail enforcement: silently delete messages from blackmailed players ──
    if (game.playing && !game.isNight && game.blackmailed.includes(msg.author.tag)) {
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
    const tag     = msg.author.tag;
    const listed  = !!game.alive[tag];

    // ── help ──────────────────────────────────────────────────────────────
    if (command === 'help') {
        const general = `\`${PREFIX}help\` \u2014 This list\n\`${PREFIX}ping\` \u2014 Latency check\n\`${PREFIX}info\` \u2014 How to play\n\`${PREFIX}version\` \u2014 Bot version`;
        const gameCmd = `\`${PREFIX}game queue\` \u2014 Open a game lobby *(GM)*\n\`${PREFIX}game join\` \u2014 Join the lobby\n\`${PREFIX}game leave\` \u2014 Leave the lobby\n\`${PREFIX}game start\` \u2014 Start the game *(GM)*\n\`${PREFIX}game end\` \u2014 Force-end the game *(GM)*\n\`${PREFIX}game players\` \u2014 List players\n\`${PREFIX}game stats\` \u2014 Show alive/dead status`;
        const nightCmd = `\`${PREFIX}night start\` \u2014 Begin the night phase *(GM)*\n\`${PREFIX}night end\` \u2014 Force-resolve the night *(GM)*\n\`${PREFIX}lynch\` \u2014 Open a nomination + lynch vote *(day phase)*\n\`${PREFIX}vote <name/yes/no>\` \u2014 Cast a nomination or lynch vote`;
        const dmCmd   = `DM me: \`${PREFIX}action <action> <target>\` \u2014 Perform your night action\nDM me: \`${PREFIX}action sleep\` \u2014 Skip your action (if allowed)`;
        const adminCmd = gm ? `\`${PREFIX}admin restart\` \u2014 Restart bot\n\`${PREFIX}admin add-players <n>\` \u2014 Add test players` : null;
        const fields = [
            { name: 'General', value: general },
            { name: 'Game', value: gameCmd },
            { name: 'Night / Day', value: nightCmd },
            { name: 'Via DM', value: dmCmd },
        ];
        if (adminCmd) fields.push({ name: 'Admin', value: adminCmd });
        return msg.channel.send({ embeds: [embed(`> Help \u2014 ${GAME_TITLE}`, fields)] });
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
            game.alive[tag] = new Player(msg.author);
            const playRole = getPlayingRole(msg.guild);
            if (playRole) await msg.member.roles.add(playRole).catch(() => {});
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
            if (tag === game.master) return msg.reply('you are the Gamemaster and are already in the game.');
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
                game.dead[tag] = { ...p, causeOfDeath: 'abandoned the town' };
                delete game.alive[tag];
                const playRole = getPlayingRole(msg.guild);
                if (playRole) await msg.member.roles.remove(playRole).catch(() => {});
                await msg.channel.send(`_${msg.author} (**${p.role}**) has abandoned the town and is dead._`);
                const { winner, reason } = checkWinConditions(game);
                if (winner) await endGame(reason);
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
            assignRoles(game.alive);
            for (const p of Object.values(game.alive)) {
                const r = roles[p.role];
                const abilityList = Object.entries(r.abilities || {})
                    .map(([name, ab]) => `\`${name}\` \u2014 ${ab.uses === Infinity ? '\u221e uses' : `${ab.uses} use(s)`}`)
                    .join('\n') || 'No active abilities.';
                await dmUser(p.id, embed(`> Night 1 \u2014 Your Role: ${p.role}`, [
                    { name: 'Role Description', value: r.txt },
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
            return endGame('The Gamemaster has ended the game.');
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
            game.isNight = true; game.nightActions = {}; game.jailedThisNight = []; game.blackmailed = []; buildNightPending();
            return msg.channel.send({ embeds: [embed(`\ud83c\udf19  Night ${game.day}`, [{ name: 'Night has begun.', value: 'DM me your actions!' }])] });
        }
        if (args[0] === 'end') {
            if (!game.isNight) return msg.reply('it is not currently night.');
            game.nightPending.clear(); return doResolveNight();
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

            // Tally: reaction emoji → count (excluding the bot itself)
            let topTag = null, topCount = 0;
            for (const [emoji, playerTag] of Object.entries(game.lynch.emojiMap)) {
                const reaction = nomMsg.reactions.cache.get(emoji);
                const count = reaction ? reaction.count - 1 : 0; // subtract bot's own reaction
                if (count > topCount) { topCount = count; topTag = playerTag; }
            }
            // Also merge in text votes from .vote <name>
            // Build per-nominee text-vote counts, then compare against reaction leader
            const textTally = {};
            for (const nominatedTag of Object.values(game.lynch.textVotes)) {
                textTally[nominatedTag] = (textTally[nominatedTag] || 0) + 1;
            }
            for (const [nominatedTag, textCount] of Object.entries(textTally)) {
                if (textCount > topCount) { topCount = textCount; topTag = nominatedTag; }
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
            let yesVotes = (yesReaction ? yesReaction.count - 1 : 0);
            let noVotes  = (noReaction  ? noReaction.count  - 1 : 0);

            // Merge in text votes cast via .vote yes / .vote no
            for (const v of Object.values(game.lynch.textVotes)) {
                if (v === 'yes') yesVotes++;
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

                // ── Lunatic (Jester) special win: if they get lynched, they win immediately ──
                if (onBlock.role === 'Lunatic') {
                    await dmUser(onBlock.id, `🃏 You were **lynched** by the town! You WIN — the Lunatic's goal was achieved!`);
                    await msg.channel.send({ embeds: [embed('🃏  The Lunatic Wins!', [
                        { name: `${onBlock.displayName} was lynched — and that was exactly their plan!`, value: `Their role was **Lunatic**.\n✅ ${yesVotes} yes / ❌ ${noVotes} no (needed ${needed})\n\n*The Lunatic (Jester) wins by tricking the town into lynching them.*` },
                    ])] });
                    // Lunatic winning does not end the game for others, but they personally win
                    // Check if any faction *also* wins now
                    const { winner, reason } = checkWinConditions(game);
                    if (winner) return endGame(reason);
                    return msg.channel.send(`🃏 The Lunatic has won! The game continues for remaining factions. Use \`${PREFIX}night start\` when ready.`);
                }

                await dmUser(onBlock.id, `☠️ You were **lynched** by the town. Your role was **${onBlock.role}**.`);
                await msg.channel.send({ embeds: [embed('☠️  Lynched!', [
                    { name: `${onBlock.displayName} has been lynched!`, value: `Their role was **${onBlock.role}**.\n✅ ${yesVotes} yes / ❌ ${noVotes} no (needed ${needed})` },
                ])] });

                // ── Mafioso promotion: if Godfather was lynched, Mafioso becomes new GF ──
                if (onBlock.role === 'Godfather') {
                    const mafioso = Object.values(game.alive).find(p => p.role === 'Mafioso');
                    if (mafioso) {
                        mafioso.role = 'Godfather';
                        await dmUser(mafioso.id, `👑 The Godfather has been lynched. You are now the **Godfather**. Your kill command is \`${PREFIX}action kill <target>\`.`);
                        await msg.channel.send(`_The Godfather was among those lynched. Leadership shifts within the shadows…_`);
                    }
                }

                const { winner, reason } = checkWinConditions(game);
                if (winner) return endGame(reason);
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

    // ── vote ─────────────────────────────────────────────────────────────
    if (command === 'vote') {
        if (!game.playing || game.isNight) return msg.reply('voting can only happen during the day phase.');
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
    const tag     = msg.author.tag;
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
        const action = args[0];

        // Sleep
        if (action === 'sleep') {
            if (!role.canSleep) return msg.channel.send(`**${player.role}** cannot skip their action.`);
            game.nightActions[tag] = { action: 'sleep', target: null, role: player.role };
            game.nightPending.delete(tag);
            await msg.channel.send('You have gone to sleep. Sweet dreams. 😴');
            await checkNightOver();
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
        const targetName = args.slice(1).join(' ');
        if (!targetName) return msg.channel.send(`Provide a target name: \`${PREFIX}action ${action} <player name>\``);

        let targetPlayer;
        if (targetName.toLowerCase() === player.displayName.toLowerCase()) {
            // Targeting self
            if (!role.canTargetSelf) return msg.channel.send("You cannot target yourself.");
            targetPlayer = player;
        } else {
            // Amnesiac can target dead players
            if (action === 'remember') {
                const lower = targetName.toLowerCase();
                targetPlayer = Object.values(game.dead).find(p => p.displayName.toLowerCase().startsWith(lower));
                if (!targetPlayer) return msg.channel.send(`No dead player found matching "${targetName}".`);
            } else {
                targetPlayer = findPlayer(targetName);
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
        await checkNightOver();
        return;
    }

    return msg.channel.send(`Unknown command. In-game commands: \`${PREFIX}action <ability> <target>\`, \`${PREFIX}game roles\`, \`${PREFIX}game role <name>\`.`);
});

// ── Login ─────────────────────────────────────────────────────────────────────
client.login(TOKEN);
