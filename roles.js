// Priority constants — lower number = acts earlier in the night queue
const P = {
    INVESTIGATIVE: 1,
    JAILOR:        2,
    ROLE_BLOCK:    3,
    PROTECTIVE:    4,
    KILLING:       5,
    MISC:          6,
};

/*
  Ability schema:  { uses: N|Infinity, msg: "string" }
    uses  — total uses remaining for this ability (across the whole game)
    msg   — DM sent to the *target* when the action lands (omit if no notification)

  Immunity schema: { mafia, bite, detect, roleBlock }
    mafia    — immune to mafia/GF kill
    bite     — immune to vampire bite
    detect   — appears innocent / role hidden from investigators
    roleBlock — immune to being role-blocked
*/

const roles = {

    // ── Town (Necessary) ───────────────────────────────────────────────────
    Jailor: {
        txt: 'Lock up 1 person each night. They cannot act and are safe from attacks. You may execute your jailed target once per game.',
        priority: P.JAILOR,
        abilities: {
            jail:    { uses: Infinity, msg: 'You have been jailed! You cannot perform your action tonight.' },
            execute: { uses: 1,        msg: 'You were executed by the Jailor!' },
        },
        immunity:     { mafia: false, bite: false, detect: false, roleBlock: false },
        wins:         'town',
        canTargetSelf: false,
        canSleep:     true,
        canTarget:    true,
        actsPerNight: 2,
        looksLike:    'Jailor, Godfather, Serial Killer',
        team:         'town',
        type:         'necessary',
    },

    // ── Town Protective ────────────────────────────────────────────────────
    Doctor: {
        txt: 'Heal 1 person each night, preventing them from dying. You may heal yourself once.',
        priority: P.PROTECTIVE,
        abilities: {
            heal: { uses: Infinity, msg: 'You were healed by the Doctor!' },
        },
        immunity:     { mafia: false, bite: false, detect: false, roleBlock: false },
        wins:         'town',
        canTargetSelf: true,
        canSleep:     true,
        canTarget:    true,
        actsPerNight: 1,
        looksLike:    'Doctor, Disguiser, Serial Killer',
        team:         'town',
        type:         'protective',
    },
    Bodyguard: {
        txt: 'Guard someone from attack — you and the attacker both die. Target yourself once for night immunity (vest).',
        priority: P.PROTECTIVE,
        abilities: {
            guard: { uses: Infinity, msg: 'A Bodyguard protected you from an attack!' },
            vest:  { uses: 1 },
        },
        immunity:     { mafia: false, bite: false, detect: false, roleBlock: false },
        wins:         'town',
        canTargetSelf: true,
        canSleep:     true,
        canTarget:    true,
        actsPerNight: 1,
        looksLike:    'Bodyguard, Godfather, Arsonist',
        team:         'town',
        type:         'protective',
    },

    // ── Town Support ───────────────────────────────────────────────────────
    Comedian: {
        txt: 'Distract 1 person each night, preventing their night action.',
        priority: P.ROLE_BLOCK,
        abilities: {
            block: { uses: Infinity, msg: 'You were role-blocked and could not act tonight!' },
        },
        immunity:     { mafia: false, bite: false, detect: false, roleBlock: false },
        wins:         'town',
        canTargetSelf: false,
        canSleep:     true,
        canTarget:    true,
        actsPerNight: 1,
        looksLike:    'Escort, Transporter, Hypnotist',
        team:         'town',
        type:         'support',
    },

    // ── Town Killing ───────────────────────────────────────────────────────
    Vigilante: {
        txt: 'Shoot someone at night (3 bullets total). Killing a Town member causes you to die of guilt the following night.',
        priority: P.KILLING,
        abilities: {
            shoot: { uses: 3, msg: 'You were shot by the Vigilante!' },
        },
        immunity:     { mafia: false, bite: false, detect: false, roleBlock: false },
        wins:         'town',
        canTargetSelf: false,
        canSleep:     true,
        canTarget:    true,
        actsPerNight: 1,
        looksLike:    'Vigilante, Veteran, Mafioso',
        team:         'town',
        type:         'killing',
    },

    // ── Town Investigative ─────────────────────────────────────────────────
    Investigator: {
        txt: 'Investigate 1 person each night. You receive a list of 3 possible roles they could be.',
        priority: P.INVESTIGATIVE,
        abilities: {
            investigate: { uses: Infinity },
        },
        immunity:     { mafia: false, bite: false, detect: false, roleBlock: false },
        wins:         'town',
        canTargetSelf: false,
        canSleep:     true,
        canTarget:    true,
        actsPerNight: 1,
        looksLike:    'Investigator, Consigliere, Mayor',
        team:         'town',
        type:         'investigative',
    },
    Sheriff: {
        txt: "Check 1 person each night. Mafia = Suspicious. Neutral Killers reveal their role. Town = Not Suspicious.",
        priority: P.INVESTIGATIVE,
        abilities: {
            check: { uses: Infinity },
        },
        immunity:     { mafia: false, bite: false, detect: false, roleBlock: false },
        wins:         'town',
        canTargetSelf: false,
        canSleep:     true,
        canTarget:    true,
        actsPerNight: 1,
        looksLike:    'Sheriff, Werewolf, Psychopath',
        team:         'town',
        type:         'investigative',
    },
    Lookout: {
        txt: 'Watch 1 person each night to see who visits them.',
        priority: P.INVESTIGATIVE,
        abilities: {
            watch: { uses: Infinity },
        },
        immunity:     { mafia: false, bite: false, detect: false, roleBlock: false },
        wins:         'town',
        canTargetSelf: false,
        canSleep:     true,
        canTarget:    true,
        actsPerNight: 1,
        looksLike:    'Lookout, Forger, Witch',
        team:         'town',
        type:         'investigative',
    },

    // ── Mafia ──────────────────────────────────────────────────────────────
    Godfather: {
        txt: 'Order the Mafia to kill a target each night. If no Mafioso is alive, you perform the kill. Immune to detection — you appear innocent.',
        priority: P.KILLING,
        abilities: {
            kill: { uses: Infinity, msg: 'You were attacked by the Mafia!' },
        },
        immunity:     { mafia: true, bite: true, detect: true, roleBlock: false },
        wins:         'mafia',
        canTargetSelf: false,
        canSleep:     false,
        canTarget:    true,
        actsPerNight: 1,
        looksLike:    'Godfather, Doctor, Bodyguard',
        team:         'mafia',
    },
    Mafioso: {
        txt: "Carry out the Godfather's orders. The bot executes your kill automatically. If the Godfather dies, you become the new Godfather.",
        priority: P.KILLING,
        abilities: {},
        immunity:     { mafia: false, bite: false, detect: false, roleBlock: false },
        wins:         'mafia',
        canTargetSelf: false,
        canSleep:     false,
        canTarget:    false,
        actsPerNight: 0,
        looksLike:    'Mafioso, Godfather, Vigilante',
        team:         'mafia',
    },
    Hypnotist: {
        txt: 'Hypnotize 1 person each night, preventing their night action.',
        priority: P.ROLE_BLOCK,
        abilities: {
            hypnotize: { uses: Infinity, msg: 'You were hypnotized and could not perform your action tonight!' },
        },
        immunity:     { mafia: false, bite: false, detect: false, roleBlock: false },
        wins:         'mafia',
        canTargetSelf: false,
        canSleep:     true,
        canTarget:    true,
        actsPerNight: 1,
        looksLike:    'Escort, Transporter, Hypnotist',
        team:         'mafia',
    },
    Cleaner: {
        txt: 'Choose a player each night. If they die, their role and last will are hidden from the town. (3 uses)',
        priority: P.MISC,
        abilities: {
            clean: { uses: 3 },
        },
        immunity:     { mafia: false, bite: false, detect: false, roleBlock: false },
        wins:         'mafia',
        canTargetSelf: false,
        canSleep:     true,
        canTarget:    true,
        actsPerNight: 1,
        looksLike:    'Janitor, Disguiser, Serial Killer',
        team:         'mafia',
    },
    Consigliere: {
        txt: 'Discover the exact role of 1 player each night. (3 uses)',
        priority: P.INVESTIGATIVE,
        abilities: {
            consult: { uses: 3 },
        },
        immunity:     { mafia: false, bite: false, detect: false, roleBlock: false },
        wins:         'mafia',
        canTargetSelf: false,
        canSleep:     true,
        canTarget:    true,
        actsPerNight: 1,
        looksLike:    'Consigliere, Investigator, Mayor',
        team:         'mafia',
    },
    Blackmailer: {
        txt: 'Blackmail 1 person each night — they cannot speak during the next day phase.',
        priority: P.MISC,
        abilities: {
            blackmail: { uses: Infinity, msg: 'You have been blackmailed! You may not speak during tomorrow\'s day phase.' },
        },
        immunity:     { mafia: false, bite: false, detect: false, roleBlock: false },
        wins:         'mafia',
        canTargetSelf: false,
        canSleep:     true,
        canTarget:    true,
        actsPerNight: 1,
        looksLike:    'Blackmailer, Jailor, Hypnotist',
        team:         'mafia',
    },

    // ── Neutral Benign ─────────────────────────────────────────────────────
    Survivor: {
        txt: 'Survive the entire game. You have 3 bulletproof vests — use one by targeting yourself.',
        priority: P.MISC,
        abilities: {
            vest: { uses: 3 },
        },
        immunity:     { mafia: false, bite: false, detect: false, roleBlock: false },
        wins:         'neutral',
        canTargetSelf: true,
        canSleep:     true,
        canTarget:    true,
        actsPerNight: 1,
        looksLike:    'Amnesiac, Survivor, Vampire Hunter',
        team:         'neutral',
        type:         'benign',
    },
    Amnesiac: {
        txt: "On night 3 or later, 'remember' the role of a dead player and become them. (1 use)",
        priority: P.MISC,
        abilities: {
            remember: { uses: 1 },
        },
        immunity:     { mafia: false, bite: false, detect: false, roleBlock: false },
        wins:         'neutral',
        canTargetSelf: false,
        canSleep:     true,
        canTarget:    true,
        actsPerNight: 1,
        looksLike:    'Amnesiac, Survivor, Vampire Hunter',
        team:         'neutral',
        type:         'benign',
    },

    // ── Neutral Evil ───────────────────────────────────────────────────────
    Witch: {
        txt: 'Control a player each night — choose who they visit. You win with whichever faction wins.',
        priority: P.MISC,
        abilities: {
            control: { uses: Infinity, msg: 'You feel your actions being controlled by an unknown force...' },
        },
        immunity:     { mafia: true, bite: false, detect: false, roleBlock: false },
        wins:         'neutral',
        canTargetSelf: false,
        canSleep:     true,
        canTarget:    true,
        actsPerNight: 1,
        looksLike:    'Lookout, Forger, Witch',
        team:         'neutral',
        type:         'evil',
    },
    Lunatic: {
        txt: 'Trick the town into lynching you. You win if you are successfully lynched.',
        priority: null,
        abilities: {},
        immunity:     { mafia: false, bite: false, detect: false, roleBlock: false },
        wins:         'neutral',
        canTargetSelf: false,
        canSleep:     true,
        canTarget:    false,
        actsPerNight: 0,
        looksLike:    'Framer, Jester, Vampire',
        team:         'neutral',
        type:         'evil',
    },
    Psychopath: {
        txt: 'Trick the town into lynching your target. You win with whichever team wins if they are lynched.',
        priority: null,
        abilities: {},
        immunity:     { mafia: true, bite: false, detect: false, roleBlock: false },
        wins:         'neutral',
        canTargetSelf: false,
        canSleep:     true,
        canTarget:    false,
        actsPerNight: 0,
        looksLike:    'Sheriff, Werewolf, Psychopath',
        team:         'neutral',
        type:         'evil',
    },

    // ── Neutral Killing ────────────────────────────────────────────────────
    'Serial Killer': {
        txt: 'Kill someone every night — you cannot skip. If role-blocked, you kill your role-blocker instead.',
        priority: P.KILLING,
        abilities: {
            kill: { uses: Infinity, msg: 'You were slain by the Serial Killer!' },
        },
        immunity:     { mafia: true, bite: true, detect: false, roleBlock: false },
        wins:         'neutral',
        canTargetSelf: false,
        canSleep:     false,
        canTarget:    true,
        actsPerNight: 1,
        looksLike:    'Serial Killer, Shroud, Hex Master',
        team:         'neutral',
        type:         'killing',
    },
    Arsonist: {
        txt: "Douse targets in gasoline, then ignite all doused targets. Ignition bypasses immunity and can't be healed.",
        priority: P.KILLING,
        abilities: {
            douse:  { uses: Infinity, msg: 'You smell gasoline... you have been doused!' },
            ignite: { uses: Infinity, msg: 'You were engulfed in flames!' },
        },
        immunity:     { mafia: true, bite: true, detect: false, roleBlock: false },
        wins:         'neutral',
        canTargetSelf: false,
        canSleep:     true,
        canTarget:    true,
        actsPerNight: 1,
        looksLike:    'Bodyguard, Godfather, Arsonist',
        team:         'neutral',
        type:         'killing',
    },
    Werewolf: {
        txt: "On full moon nights (every other night starting night 2), rampage at your target's location, killing them and everyone who visited them.",
        priority: P.KILLING,
        abilities: {
            rampage: { uses: Infinity, msg: 'A werewolf ripped you to shreds!' },
        },
        immunity:     { mafia: true, bite: true, detect: false, roleBlock: false },
        wins:         'neutral',
        canTargetSelf: false,
        canSleep:     true,
        canTarget:    true,
        actsPerNight: 1,
        looksLike:    'Sheriff, Werewolf, Arsonist',
        team:         'neutral',
        type:         'killing',
    },
    Terrorist: {
        txt: 'Randomly kills a player each night, bypassing all night immunity.',
        priority: P.KILLING,
        abilities: {
            explode: { uses: Infinity, msg: 'You were blown up by a Terrorist!' },
        },
        immunity:     { mafia: true, bite: true, detect: false, roleBlock: false },
        wins:         'neutral',
        canTargetSelf: false,
        canSleep:     true,
        canTarget:    false,
        actsPerNight: 0,
        looksLike:    'Vigilante, Veteran, Terrorist',
        team:         'neutral',
        type:         'killing',
    },
};

// Role distribution arrays (populated at runtime by assignRoles)
const roster = {
    townProtective:   [],
    townSupport:      [],
    townKilling:      [],
    townInvestigative: [],
    mafiaRandom:      [],
    neutralBenign:    [],
    neutralEvil:      [],
    neutralKilling:   [],
};

function buildRoster() {
    // Reset
    for (const k of Object.keys(roster)) roster[k] = [];
    for (const [name, r] of Object.entries(roles)) {
        if (r.team === 'town') {
            if (r.type === 'protective')   roster.townProtective.push(name);
            if (r.type === 'support')      roster.townSupport.push(name);
            if (r.type === 'killing')      roster.townKilling.push(name);
            if (r.type === 'investigative') roster.townInvestigative.push(name);
        }
        if (r.team === 'mafia' && name !== 'Godfather' && name !== 'Mafioso') {
            roster.mafiaRandom.push(name);
        }
        if (r.team === 'neutral') {
            if (r.type === 'benign')  roster.neutralBenign.push(name);
            if (r.type === 'evil')    roster.neutralEvil.push(name);
            if (r.type === 'killing') roster.neutralKilling.push(name);
        }
    }
}

module.exports = { roles, roster, buildRoster };
