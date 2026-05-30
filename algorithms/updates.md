# Town of Charlotte Bot — Refactor & Completion Plan

## Current State Assessment

### Two Files, One Bot
The repo has both `bot.js` (older, discord.js v11 style) and `index.js` (newer, v13-ish style, more complete). **`index.js` is the one to build on** — it has role assignment logic, tutorial flow, and better architecture. `bot.js` appears to be the legacy prototype.

### Critical Breaking Issues (Discord API)
| Issue | Location | Fix |
|---|---|---|
| `new Discord.Client()` — no intents | `index.js:28` | Requires `GatewayIntentBits` in v14 |
| `client.user.setGame()` | `bot.js:206` | Deprecated; use `setActivity()` |
| `message.channel.fetchMessages()` | `bot.js:620` | Renamed to `messages.fetch()` |
| `msg.guild.roles.fetch(playRole)` is async but not awaited | `index.js:893` | Need `await` |
| `msg.member.roles.cache.some()` needs `GuildMembers` intent | `index.js:892` | Add intent |
| `embed: {...}` object form | everywhere | Must use `EmbedBuilder` in v14 |
| `client.fetchUser()` | `bot.js:278` | Use `client.users.fetch()` |
| `msg.awaitReactions()` | `index.js:1507` | Needs `MessageReactions` intent |
| `playRole` hardcoded as an ID string | `index.js:34` | Needs lookup by name for portability |

### discord.js Version
Currently pinned to `11.4.0` (in `package.json`). Target is **v14** (current stable as of 2025).

---

## Architecture for `index.js` Rewrite

### File Structure (single-file bot, no need to split yet)
```
index.js
  ├── Imports & Config
  ├── Role Database (roles object) — cleaned up
  ├── Game State (game object) — cleaned up  
  ├── Helper Functions
  │   ├── assignRoles()
  │   ├── resolveNight()      ← NEW (the core missing piece)
  │   ├── checkWinConditions() ← NEW
  │   ├── killPlayer()        ← NEW
  │   └── utility fns
  ├── client.on('ready')
  ├── client.on('messageCreate')   ← DM handler (night actions)
  └── client.on('messageCreate')   ← Guild handler (game flow)
```

---

## Role Database Cleanup

### Changes Per User's Spec
- `priority` → change from string (`"p1"`) to **int** (1–6, higher = acts first)
- `abilities` → change from array `[uses, msg]` to object `{ uses: N, msg: "..." }`
- `immunity.night` → rename to `immunity.mafia`
- `wins: "solo"` on Godfather → should be `"mafia"`

### Priority Scale (matches game logic)
```
6 = Jailor (locks first, so role-block lands before kills)
5 = (unused/reserved)
4 = Investigative roles (Sheriff, Investigator, Lookout, Consigliere)
3 = Protective roles (Doctor, Bodyguard) + Role-blockers (Comedian, Hypnotist)
2 = Killing roles (Godfather/Mafioso, SK, Vigilante, Arsonist, Werewolf)
1 = Neutral/misc actions (Blackmailer, Cleaner, Witch, Playwright)
0 = Lowest priority
```

> [!NOTE]
> The Jailor acts at priority 6 so his jail (role-block) resolves before anyone's kill. The Investigator being "p1" in the original is counter-intuitive — investigative roles should probably be priority 4 since they don't block or kill anyone; this should be discussed with the user.

---

## The `resolveNight()` Function — Core Algorithm

This is the biggest missing piece. It runs after all players have submitted their actions.

### Resolution Order (highest priority first)
1. **Jailor jails** — target is role-blocked + protected from night kills
2. **Role-blocks land** (Comedian, Hypnotist) — mark targets as role-blocked
3. **Investigative actions run** (Sheriff, Investigator, Lookout, Consigliere) — results stored, sent to player
4. **Protective actions** (Doctor heals, Bodyguard guards)
5. **Kill actions** (GF/Mafioso, SK, Vigilante, Terrorist, Werewolf, Arsonist ignite)
6. **Misc actions** (Cleaner cleans, Blackmailer blackmails, Witch controls)

### Kill Resolution Logic
```
For each kill action:
  1. If killer was role-blocked → kill cancelled
  2. If target is jailed → kill blocked (Jailor's jail absorbs it)
  3. If target has mafia immunity AND killer is Godfather/Mafioso → blocked
  4. If target has a Doctor heal on them → blocked, doctor sends heal msg
  5. If target has a Bodyguard on them → Bodyguard and attacker both die
  6. Otherwise → target dies
```

### Special Cases
- **Godfather + Mafioso**: GF picks target, Mafioso executes. If GF is role-blocked but Mafioso is not (and is alive), kill still goes through via Mafioso. If both blocked, no mafia kill.
- **Serial Killer**: Must kill every night (canSleep: false). If role-blocked, SK kills the role-blocker instead.
- **Vigilante**: If kill target turns out to be Town, Vigilante dies by guilt the next night.
- **Doctor self-heal**: Uses `canTargetSelf` — allowed once. 
- **Jailor execute**: The Jailor's one-use kill on their jailed target; target still dies even with Doctor heal (jail overrides).

---

## `checkWinConditions()` — Game End Detection

Check after every night resolution AND after every day lynch:

### Win Conditions
| Faction | Condition |
|---|---|
| **Town** | All Mafia dead AND all Neutral Killers dead |
| **Mafia** | Mafia members ≥ Town members (numbers-wise) |
| **Serial Killer** | Last one standing (or only hostile threat) |
| **Arsonist** | Last one standing |
| **Jester** (future) | Gets lynched |
| **Werewolf** | Last one standing |

> [!IMPORTANT]
> Neutral evil roles (Witch, Necromancer, Vampire) win alongside the faction that wins, unless they outlive everyone.

---

## Night Action Flow (Player DM Side)

When a game is active and a player DMs `action <type> <target>`:

1. Validate: player is alive, game is playing, it's night
2. Validate: action type matches player's role abilities
3. Validate: uses remaining > 0
4. Validate: target exists in `game.alive` (or `game.dead` for Amnesiac)
5. Validate: self-targeting rules
6. Store action in `game.nightActions[playerTag] = { action, target }`
7. Decrement uses
8. Send confirmation DM to player
9. Check if ALL living, non-sleeping players have acted → if yes, auto-run `resolveNight()`

### `actsPerNight` Handling
- Roles with `actsPerNight > 1` (currently only Jailor with lock + execute) get prompted after first action: *"You have another action available this night. Use `action execute <target>` or type `action sleep` to skip."*

---

## Commands to Implement / Fix

### DM Commands
| Command | Status | Notes |
|---|---|---|
| `action <type> <target>` | Stub only | Full implementation needed |
| `action sleep` | Partial | Needs proper state tracking |
| `game roles` | Stub | Should list all roles with descriptions |
| `game role <name>` | Not started | Role detail lookup |

### Guild Commands  
| Command | Status | Notes |
|---|---|---|
| `game queue` | Working | Minor cleanup |
| `game join` | Working | Minor cleanup |
| `game leave` | Working | Add "reveal role + mark dead" on mid-game leave |
| `game start` | Working | Role assignment works |
| `game end` | Working | Needs proper win announcement |
| `game players` | Working | Minor cleanup |
| `game stats` | Stub | Implement |
| `night start` | Stub | Needs `resolveNight()` hooked in |
| `lynch <player>` | Stub | Implement voting + kill |
| `vote` | Stub | Implement reaction-based voting |
| `help` | Working | Update with new commands |
| `info` | Working | Minor text updates |
| `ping` | Working | Works |
| `admin restart` | Working | Fine |
| `admin create-players` | Working | Fine (testing tool) |

---

## Data Model Cleanup

### `game` Object (proposed)
```js
game = {
    queued: false,       // lobby is open
    playing: false,      // game is active
    isNight: false,      // currently night phase (vs day)
    tutorial: false,     
    day: 0,              // current day number
    alive: {},           // tag → Player
    dead: {},            // tag → Player  
    nightActions: {},    // tag → { action, target } for current night
    nightlyDead: [],     // tags who died last night (for day announcement)
    master: "",          // tag of Gamemaster
    channel: "",         // main channel ID
    mafiosoKillTarget: null  // GF sets this, Mafioso executes
}
```

### `Player` Object (proposed)
```js
Player {
    name: string,        // Discord tag (user#1234)
    id: string,          // Discord user ID
    role: string,        // role name key into roles{}
    did: {},             // actions taken this night
    hasBeen: {},         // what happened to them this night
    alive: true,         // whether alive
    dousedBy: null,      // for Arsonist mechanic
    isJailed: false,     // Jailor jailed this night
    isRoleBlocked: false,// role-blocked this night
    isProtected: false,  // Doctor healed this night
    guiltyKill: false,   // Vigilante guilt kill pending next night
}
```

---

## Package.json Updates

```json
{
  "name": "town-of-charlotte-bot",
  "version": "0.2.0",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "node --watch index.js"
  },
  "dependencies": {
    "discord.js": "^14.0.0",
    "dotenv": "^16.0.0"
  }
}
```

> [!NOTE]
> Removing the `express` keep-alive (was for Heroku/Glitch hosting). If the user is on Railway or similar, we can add it back. The `request` package is unused and removed. Adding `dotenv` for `BOT_TOKEN` loading from `.env`.

---

## Open Questions for User

1. **Priority ordering**: The original has Investigator at p1 (lowest) — should investigative roles act before or after kills? In the real ToS game, investigators get results regardless of kill order.
2. **Mafioso mechanic**: Should the Godfather issue the kill order via a DM command, and then the bot automatically has the Mafioso execute it? Or does Mafioso type their own kill command?
3. **`playRole` Discord role**: Currently hardcoded as an ID (`458590289477763073`). Should this be looked up by name (`"Playing Game"`) for portability?
4. **Night timer**: Should nights have a time limit, or only end when the GM uses `night start`? Or auto-end when everyone has acted?
5. **`express` keep-alive**: Are you still hosting on Glitch/Replit? If so, we should keep the keep-alive server.
6. **Slash commands vs prefix**: Discord now heavily pushes slash commands (and has deprecated some message-based approaches in privileged servers). Do you want to keep the `.` prefix style, switch to `/` slash commands, or support both?
