const { roles, roster, buildRoster } = require('./roles');

// ─── Helpers ──────────────────────────────────────────────────────────────────
function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pullRandom(arr, fallback = 'Doctor') {
    if (!arr.length) return fallback;
    const i = randInt(0, arr.length - 1);
    const picked = arr[i];
    arr.splice(i, 1);
    return picked;
}

// ─── Role Assignment ──────────────────────────────────────────────────────────
/*
  Role slot table (guaranteed + scaled by player count):
  7  players → Jailor, Godfather, Mafioso + town protective + town support + town investigative + neutral evil
  8  → + random town
  9  → + random mafia
  10 → + town killing
  11 → + neutral killing
  12 → + town investigative
  13 → + random town
  14 → + neutral benign
  15 → + random town
  16 → + random mafia
  17 → + random town
  18 → + random town
  19 → + random mafia
  20 → + neutral benign or neutral evil
*/
function assignRoles(alivePlayers) {
    buildRoster();

    const roleList = ['Godfather', 'Mafioso', 'Jailor'];
    const n = Object.keys(alivePlayers).length;

    function addTown() {
        const pool = [
            ...roster.townProtective,
            ...roster.townSupport,
            ...roster.townKilling,
            ...roster.townInvestigative,
        ];
        roleList.push(pullRandom(pool));
    }

    if (n >= 7) {
        roleList.push(pullRandom(roster.townProtective));
        roleList.push(pullRandom(roster.townSupport));
        roleList.push(pullRandom(roster.townInvestigative));
        roleList.push(pullRandom(roster.neutralEvil));
    }
    if (n >= 8)  addTown();
    if (n >= 9)  roleList.push(pullRandom(roster.mafiaRandom));
    if (n >= 10) roleList.push(pullRandom(roster.townKilling));
    if (n >= 11) roleList.push(pullRandom(roster.neutralKilling));
    if (n >= 12) roleList.push(pullRandom(roster.townInvestigative));
    if (n >= 13) addTown();
    if (n >= 14) roleList.push(pullRandom(roster.neutralBenign));
    if (n >= 15) addTown();
    if (n >= 16) roleList.push(pullRandom(roster.mafiaRandom));
    if (n >= 17) addTown();
    if (n >= 18) addTown();
    if (n >= 19) roleList.push(pullRandom(roster.mafiaRandom));
    if (n >= 20) {
        roleList.push(randInt(0, 1) === 0
            ? pullRandom(roster.neutralBenign)
            : pullRandom(roster.neutralEvil));
    }

    // Randomly distribute roles to players
    const tags = Object.keys(alivePlayers);
    const shuffled = [...roleList];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = randInt(0, i);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    tags.forEach((tag, idx) => {
        alivePlayers[tag].role = shuffled[idx];
    });
}

// ─── Night Resolution ─────────────────────────────────────────────────────────
/*
  Called after all players have submitted their night actions.
  Returns an array of result strings to announce publicly at day-break.
*/
async function resolveNight(game, dmUser) {
    const results  = [];   // public announcements
    const toKill   = {};   // tag → cause-of-death string
    const cleaned  = new Set();  // tags whose death is cleaned (role hidden)
    const doused   = game.doused || new Set();

    // Helper: look up a player by display name (case-insensitive)
    function findByName(name) {
        const lower = name.toLowerCase();
        return Object.values(game.alive).find(
            p => p.name.toLowerCase().startsWith(lower)
                || p.displayName?.toLowerCase().startsWith(lower)
        );
    }

    // Sort actions by priority (ascending — lower number first)
    const sorted = Object.entries(game.nightActions).sort(([, a], [, b]) => {
        const pa = roles[a.role]?.priority ?? 99;
        const pb = roles[b.role]?.priority ?? 99;
        return pa - pb;
    });

    // Track who was role-blocked this night
    const roleBlocked = new Set();
    // Track who was healed
    const healed = new Set();
    // Track who was jailed
    const jailed = new Set(game.jailedThisNight || []);
    // Track bodyguard assignments  tag→guardedTag
    const guarding = {};

    // ── Pass 1: Role-blocks & Jail (priority 2-3) ──────────────────────────
    for (const [actorTag, act] of sorted) {
        const actor = game.alive[actorTag];
        if (!actor) continue;
        const role = roles[actor.role];

        // Jailor jail (already recorded in game.jailedThisNight by GM command or auto)
        // Mark jailed targets as role-blocked
        if (act.action === 'jail') {
            const target = game.alive[act.target];
            if (target) {
                roleBlocked.add(act.target);
                jailed.add(act.target);
            }
        }

        // Role-blockers
        if (act.action === 'block' || act.action === 'hypnotize') {
            const target = game.alive[act.target];
            if (!target) continue;
            if (role.immunity?.roleBlock) continue; // target immune
            if (roles[target.role]?.immunity?.roleBlock) continue;
            roleBlocked.add(act.target);
            const msg = roles[actor.role].abilities[act.action]?.msg;
            if (msg) await dmUser(target.id, msg);
        }
    }

    // ── Pass 2: Protective actions (priority 4) ────────────────────────────
    for (const [actorTag, act] of sorted) {
        const actor = game.alive[actorTag];
        if (!actor) continue;
        if (roleBlocked.has(actorTag)) continue;

        // Doctor heal
        if (act.action === 'heal') {
            const target = game.alive[act.target];
            if (!target) continue;
            healed.add(act.target);
            const msg = roles[actor.role].abilities.heal?.msg;
            if (msg) await dmUser(target.id, msg);
        }

        // Bodyguard guard
        if (act.action === 'guard') {
            const target = game.alive[act.target];
            if (target) guarding[actorTag] = act.target;
        }

        // Survivor / Bodyguard vest (self-immunity)
        if (act.action === 'vest' && act.target === actorTag) {
            healed.add(actorTag);
        }
    }

    // ── Pass 3: Investigative actions (priority 1) ─────────────────────────
    for (const [actorTag, act] of sorted) {
        const actor = game.alive[actorTag];
        if (!actor) continue;
        if (roleBlocked.has(actorTag)) continue;

        const target = game.alive[act.target];

        if (act.action === 'investigate') {
            if (!target) continue;
            const tRole = roles[target.role];
            const apparent = tRole.immunity?.detect ? 'Town Member' : (tRole.looksLike || target.role);
            await dmUser(actor.id, `🔍 Your investigation of **${target.displayName}** suggests they could be: **${apparent}**`);
        }

        if (act.action === 'check') {
            if (!target) continue;
            const tRole = roles[target.role];
            let result;
            if (tRole.immunity?.detect) {
                result = '✅ **Not Suspicious.**';
            } else if (tRole.team === 'mafia') {
                result = '🚨 **Suspicious!** This player is likely a member of the Mafia.';
            } else if (tRole.type === 'killing' && tRole.team === 'neutral') {
                result = `⚠️ Your target is a **${target.role}**!`;
            } else {
                result = '✅ **Not Suspicious.**';
            }
            await dmUser(actor.id, `🔎 Your check on **${target.displayName}**: ${result}`);
        }

        if (act.action === 'watch') {
            if (!target) continue;
            // Find who visited the watched target this night
            const visitors = Object.entries(game.nightActions)
                .filter(([tag, a]) => a.target === act.target && tag !== actorTag)
                .map(([tag]) => game.alive[tag]?.displayName || tag);
            const msg = visitors.length
                ? `👁️ You watched **${target.displayName}**. The following players visited them: **${visitors.join(', ')}**`
                : `👁️ You watched **${target.displayName}**. Nobody visited them tonight.`;
            await dmUser(actor.id, msg);
        }

        if (act.action === 'consult') {
            if (!target) continue;
            await dmUser(actor.id, `📋 Your consultation reveals: **${target.displayName}** is a **${target.role}**.`);
        }
    }

    // ── Pass 4: Kill actions (priority 5) ─────────────────────────────────
    // Collect all pending kills before resolving, to handle simultaneous deaths
    const pendingKills = []; // { killerTag, targetTag, cause, bypassHeal, bypassImmunity }

    // Mafia kill (GF orders → Mafioso executes)
    if (game.mafiosoKill) {
        // Find the executor: Mafioso if alive & not role-blocked, else GF
        const mafioso = Object.values(game.alive).find(p => p.role === 'Mafioso');
        const gf      = Object.values(game.alive).find(p => p.role === 'Godfather');

        let executor = null;
        if (mafioso && !roleBlocked.has(mafioso.tag)) executor = mafioso;
        else if (gf && !roleBlocked.has(gf.tag)) executor = gf;

        if (executor) {
            pendingKills.push({
                killerTag: executor.tag,
                targetTag: game.mafiosoKill,
                cause: 'shot by the Mafia',
                bypassHeal: false,
                bypassImmunity: false,
                immunityType: 'mafia',
            });
        }
    }

    // Individual kill actions (SK, Vigilante, Arsonist ignite, Werewolf)
    for (const [actorTag, act] of sorted) {
        const actor = game.alive[actorTag];
        if (!actor) continue;
        if (roleBlocked.has(actorTag)) {
            // Serial Killer kills their role-blocker instead
            if (actor.role === 'Serial Killer') {
                // Find who role-blocked the SK
                const blocker = Object.entries(game.nightActions).find(
                    ([tag, a]) => (a.action === 'block' || a.action === 'hypnotize') && a.target === actorTag
                );
                if (blocker) {
                    pendingKills.push({
                        killerTag: actorTag,
                        targetTag: blocker[0],
                        cause: 'slain by the Serial Killer',
                        bypassHeal: false,
                        bypassImmunity: false,
                        immunityType: 'mafia',
                    });
                }
            }
            continue;
        }

        if (act.action === 'shoot') {
            pendingKills.push({
                killerTag: actorTag,
                targetTag: act.target,
                cause: 'shot by the Vigilante',
                bypassHeal: false,
                bypassImmunity: false,
                immunityType: 'mafia',
                vigilante: true,
            });
        }

        if (act.action === 'execute' && actor.role === 'Jailor') {
            pendingKills.push({
                killerTag: 'jailor_execute',
                targetTag: act.target,
                cause: 'executed by the Jailor',
                bypassHeal: true,
                bypassImmunity: true,
            });
        }

        if (act.action === 'kill' && actor.role === 'Serial Killer') {
            pendingKills.push({
                killerTag: actorTag,
                targetTag: act.target,
                cause: 'slain by the Serial Killer',
                bypassHeal: false,
                bypassImmunity: false,
                immunityType: 'mafia',
            });
        }

        if (act.action === 'rampage' && actor.role === 'Werewolf') {
            const isFullMoon = game.day % 2 === 0;
            if (isFullMoon) {
                pendingKills.push({
                    killerTag: actorTag,
                    targetTag: act.target,
                    cause: 'mauled by the Werewolf',
                    bypassHeal: false,
                    bypassImmunity: true,
                    immunityType: null,
                });
                // Also kill everyone who visited the target
                for (const [tag, a] of Object.entries(game.nightActions)) {
                    if (a.target === act.target && tag !== actorTag) {
                        pendingKills.push({
                            killerTag: actorTag,
                            targetTag: tag,
                            cause: 'mauled by the Werewolf',
                            bypassHeal: false,
                            bypassImmunity: true,
                        });
                    }
                }
            }
        }

        if (act.action === 'ignite' && actor.role === 'Arsonist') {
            for (const dousedTag of doused) {
                if (game.alive[dousedTag]) {
                    pendingKills.push({
                        killerTag: actorTag,
                        targetTag: dousedTag,
                        cause: 'burned alive by the Arsonist',
                        bypassHeal: true,
                        bypassImmunity: true,
                    });
                }
            }
            doused.clear();
            game.doused = doused;
        }

        // Terrorist: random target
        if (actor.role === 'Terrorist' && !roleBlocked.has(actorTag)) {
            const aliveKeys = Object.keys(game.alive).filter(t => t !== actorTag);
            if (aliveKeys.length) {
                const randTarget = aliveKeys[randInt(0, aliveKeys.length - 1)];
                pendingKills.push({
                    killerTag: actorTag,
                    targetTag: randTarget,
                    cause: 'blown up by the Terrorist',
                    bypassHeal: true,
                    bypassImmunity: true,
                });
            }
        }
    }

    // Vigilante guilt kills (pending from previous night)
    for (const [tag, p] of Object.entries(game.alive)) {
        if (p.guiltyDeath) {
            pendingKills.push({
                killerTag: tag,
                targetTag: tag,
                cause: 'died of guilt',
                bypassHeal: true,
                bypassImmunity: true,
            });
        }
    }

    // ── Check for targeting stalemates (e.g. SK and GF/Mafia targeting each other) ──
    const stalemateTags = new Set();
    const allAliveTags = Object.keys(game.alive);
    for (const tagA of allAliveTags) {
        for (const tagB of allAliveTags) {
            if (tagA === tagB) continue;

            const actA = game.nightActions[tagA];
            const isKillA = actA && ['kill', 'shoot', 'execute', 'rampage', 'explode'].includes(actA.action);
            const targetsB = actA && (actA.target === tagB || (roles[game.alive[tagA]?.role]?.team === 'mafia' && game.mafiosoKill === tagB));

            const actB = game.nightActions[tagB];
            const isKillB = actB && ['kill', 'shoot', 'execute', 'rampage', 'explode'].includes(actB.action);
            const targetsA = actB && (actB.target === tagA || (roles[game.alive[tagB]?.role]?.team === 'mafia' && game.mafiosoKill === tagA));

            if (isKillA && targetsB && isKillB && targetsA) {
                stalemateTags.add(tagA);
                stalemateTags.add(tagB);
            }
        }
    }

    const filteredPendingKills = [];
    for (const kill of pendingKills) {
        let isStalemate = false;

        // Direct match
        if (stalemateTags.has(kill.killerTag) && stalemateTags.has(kill.targetTag)) {
            isStalemate = true;
        }
        // Mafia match (GF/Mafioso vs target)
        const killerRole = game.alive[kill.killerTag]?.role;
        if (roles[killerRole]?.team === 'mafia') {
            const stalematedWithMafia = Object.keys(game.alive).some(t =>
                roles[game.alive[t]?.role]?.team === 'mafia' &&
                stalemateTags.has(t) &&
                stalemateTags.has(kill.targetTag)
            );
            if (stalematedWithMafia) {
                isStalemate = true;
            }
        }

        if (!isStalemate) {
            filteredPendingKills.push(kill);
        }
    }

    // ── Resolve each pending kill ──────────────────────────────────────────
    for (const kill of filteredPendingKills) {
        const target = game.alive[kill.targetTag];
        if (!target) continue;

        const targetRole = roles[target.role];

        // Jailed — safe from all kills (except Jailor's own execute)
        if (jailed.has(kill.targetTag) && kill.killerTag !== 'jailor_execute') continue;

        // Night immunity check
        if (!kill.bypassImmunity && kill.immunityType && targetRole?.immunity?.[kill.immunityType]) continue;

        // Bodyguard intercept
        const guardianTag = Object.entries(guarding).find(([, t]) => t === kill.targetTag)?.[0];
        if (guardianTag && game.alive[guardianTag]) {
            results.push(`💀 **${target.displayName}** was attacked last night but was saved by their Bodyguard!`);
            // Bodyguard and attacker both die
            toKill[guardianTag] = 'died protecting their charge';
            toKill[kill.killerTag] = 'killed by a Bodyguard';
            await dmUser(target.id, '🛡️ A Bodyguard saved your life — at the cost of their own!');
            continue;
        }

        // Doctor heal check
        if (!kill.bypassHeal && healed.has(kill.targetTag)) {
            results.push(`💀 **${target.displayName}** was attacked last night but was healed by the Doctor!`);
            await dmUser(target.id, '❤️ You were attacked, but the Doctor healed you just in time!');
            continue;
        }

        // Kill confirmed
        toKill[kill.targetTag] = kill.cause;

        // Vigilante guilt tracking
        if (kill.vigilante && targetRole?.team === 'town') {
            const vigi = game.alive[kill.killerTag];
            if (vigi) vigi.guiltyDeath = true;
        }
    }

    // ── Misc actions (priority 6) ──────────────────────────────────────────
    for (const [actorTag, act] of sorted) {
        const actor = game.alive[actorTag];
        if (!actor || roleBlocked.has(actorTag)) continue;

        if (act.action === 'douse' && actor.role === 'Arsonist') {
            const target = game.alive[act.target];
            if (target) {
                doused.add(act.target);
                game.doused = doused;
                const msg = roles['Arsonist'].abilities.douse?.msg;
                if (msg) await dmUser(target.id, msg);
            }
        }

        if (act.action === 'blackmail') {
            const target = game.alive[act.target];
            if (target) {
                game.blackmailed = game.blackmailed || [];
                game.blackmailed.push(act.target);
                const msg = roles[actor.role].abilities.blackmail?.msg;
                if (msg) await dmUser(target.id, msg);
            }
        }

        if (act.action === 'clean') {
            // If target is dying tonight, mark them as cleaned
            if (toKill[act.target]) cleaned.add(act.target);
        }

        if (act.action === 'remember' && actor.role === 'Amnesiac') {
            // Target must be dead and in game.dead
            const deadPlayer = game.dead[act.target];
            if (deadPlayer && game.day >= 3) {
                actor.role = deadPlayer.role;
                await dmUser(actor.id, `💭 You have remembered who you were! Your new role is **${actor.role}**.\n${roles[actor.role].txt}`);
            }
        }
    }

    // ── Apply deaths ───────────────────────────────────────────────────────
    game.nightlyDead = [];
    game.deathHistory = game.deathHistory || [];
    for (const [tag, cause] of Object.entries(toKill)) {
        const dead = game.alive[tag];
        if (!dead) continue;
        game.dead[tag] = { ...dead, causeOfDeath: cause };
        delete game.alive[tag];
        game.nightlyDead.push(tag);

        game.deathHistory.push({
            night: game.day,
            playerName: dead.displayName,
            role: dead.role,
            cause: cause
        });

        if (cleaned.has(tag)) {
            results.push(`💀 **${dead.displayName}** was found dead last night. *(Their role is unknown.)*`);
        } else {
            results.push(`💀 **${dead.displayName}** (${dead.role}) was found dead last night. They were ${cause}.`);
        }
    }

    if (game.nightlyDead.length === 0) {
        results.push('🌅 Nobody died last night. The town breathes a sigh of relief.');
    }

    // Reset night state
    game.nightActions    = {};
    game.jailedThisNight = [];
    game.mafiosoKill     = null;
    game.isNight         = false;
    game.day++;

    return results;
}

// ─── Win Condition Check ──────────────────────────────────────────────────────
/*
  Returns { winner: 'town'|'mafia'|'neutral'|null, reason: string }
  winner is null if the game continues.
*/
function checkWinConditions(game) {
    const alivePlayers = Object.values(game.alive);
    if (!alivePlayers.length) return { winner: 'draw', reason: 'Everyone is dead. It\'s a draw!' };

    const aliveMafia    = alivePlayers.filter(p => roles[p.role]?.team === 'mafia');
    const aliveTown     = alivePlayers.filter(p => roles[p.role]?.team === 'town');
    const aliveNKill    = alivePlayers.filter(p => roles[p.role]?.type === 'killing' && roles[p.role]?.team === 'neutral');

    // Mafia wins if they match or outnumber non-mafia threats
    const threats = aliveTown.length + aliveNKill.length;
    if (aliveMafia.length >= threats && threats > 0) {
        return { winner: 'mafia', reason: 'The **Mafia** has seized control of the town! Evil has won.' };
    }
    if (aliveMafia.length >= alivePlayers.length / 2) {
        return { winner: 'mafia', reason: 'The **Mafia** has taken over! Evil has won.' };
    }

    // Town wins if all mafia AND all neutral killers are dead
    if (aliveMafia.length === 0 && aliveNKill.length === 0) {
        return { winner: 'town', reason: 'The **Town** has eliminated all threats! Good has prevailed.' };
    }

    // Solo neutral killer wins if they are the last one (or only with non-threatening neutrals)
    if (aliveNKill.length === 1 && aliveMafia.length === 0 && aliveTown.length === 0) {
        const nk = aliveNKill[0];
        return { winner: 'neutral', reason: `**${nk.displayName}** (${nk.role}) has outlasted everyone. They win!` };
    }

    return { winner: null, reason: null };
}

module.exports = { assignRoles, resolveNight, checkWinConditions };
