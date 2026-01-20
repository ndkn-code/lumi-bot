# Lumist Discord Bot - Development Guide

> **Version:** 4.6
> **Last synced:** January 2026

## Project Overview

This is the Lumi Bot for the Lumist.ai Discord server. It handles:
- **Native Discord Onboarding** - Country/grade selection via Discord's built-in onboarding UI
- Auto-moderation (spam, links, raids, banned words)
- Slash commands for moderators
- Ticket system for support
- **Forum-based Verification system** - Lumist.ai account linking + Alumni verification via forum posts
- **College Application Forums** - US and Vietnam-specific college discussion forums
- **Brain Teaser channel** - Daily SAT-style questions from Lumist.ai
- Analytics pipeline to Supabase
- AI chatbot via n8n integration
- **Escalation system** for human takeover from AI

## File Structure

```
lumi-bot/
├── bot.js              # Main bot code (all features)
├── setup-onboarding.js # One-time script to configure Discord native onboarding
├── update.sh           # Server update script (pull, install, restart)
├── package.json        # Dependencies (discord.js v14)
├── .gitignore          # Git ignore file
├── README.md           # Basic documentation
├── CLAUDE.md           # This file - development guide
└── SERVER_CONFIG.md    # Discord server configuration reference
```

---

## Key Configuration Constants

These are defined at the top of `bot.js`. **Always update these when making changes.**

### Role Names
```javascript
const ROLES = {
  // Core roles
  MEMBER: '🌱 Member',
  VERIFIED: '✅ Verified',
  PREMIUM: '💎 Premium',
  ALUMNI: '🎓 Alumni',
  
  // Staff roles
  MODERATOR: '🛡️ Moderator',
  ADMIN: '⚙️ Admin',
  FOUNDER: '👑 Founder',
  
  // Nationality roles
  VIETNAM: '🇻🇳 Vietnam',
  USA: '🇺🇸 United States',
  UK: '🇬🇧 United Kingdom',
  SINGAPORE: '🇸🇬 Singapore',
  KOREA: '🇰🇷 South Korea',
  JAPAN: '🇯🇵 Japan',
  CHINA: '🇨🇳 China',
  INDIA: '🇮🇳 India',
  OTHER: '🌏 Other International',
  
  // Grade roles
  FRESHMAN: '🎒 Freshman',
  SOPHOMORE: '🎒 Sophomore',
  JUNIOR: '🎒 Junior',
  SENIOR: '🎒 Senior',
  GAP_YEAR: '🎒 Gap Year',
};
```

### Channel Names
```javascript
const CHANNELS = {
  INTRODUCTIONS: 'introductions',
  WELCOME: 'welcome',
  RULES: 'rules',
  MOD_LOGS: 'mod-logs',
  SUPPORT_TICKETS: 'support-tickets',
  ASK_LUMI: 'ask-lumi',
  VERIFY: 'verify',
  BRAIN_TEASER: 'brain-teaser',
  COLLEGE_APPS_US: 'us-college-apps',
  COLLEGE_APPS_VN: 'vietnam-college-apps',
};
```

### Auto-Mod Configuration
```javascript
const AUTOMOD_CONFIG = {
  spam: { enabled: true, maxMessages: 5, timeWindow: 5000, muteMinutes: 10 },
  mentions: { enabled: true, maxMentions: 5 },
  duplicates: { enabled: true, maxDuplicates: 3, timeWindow: 60000 },
  links: {
    enabled: true,
    allowedDomains: [
      'lumist.ai', 'www.lumist.ai', 'app.lumist.ai',
      'collegeboard.org', 'www.collegeboard.org',
      'khanacademy.org', 'www.khanacademy.org',
      'youtube.com', 'www.youtube.com', 'youtu.be',
      'discord.com', 'discord.gg',
      'imgur.com', 'i.imgur.com',
      'gyazo.com', 'tenor.com', 'giphy.com',
    ],
  },
  bannedWords: { enabled: true, words: [], patterns: [] },
  raid: { enabled: true, joinThreshold: 10, timeWindow: 60000, lockdownMinutes: 5 },
  warnings: {
    expireDays: 30,
    escalation: { 1: 'warn', 2: 'mute_1h', 3: 'mute_24h', 4: 'ban_7d', 5: 'ban_permanent' },
  },
};
```

---

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `BOT_TOKEN` | Discord bot token | ✅ Yes |
| `GUILD_ID` | Discord server ID | Optional (default: 1456886174600794291) |
| `PORT` | HTTP server port | Optional (default: 3000) |
| `SUPABASE_URL` | Supabase project URL | For analytics |
| `SUPABASE_SERVICE_KEY` | Supabase service key | For analytics |
| `N8N_WEBHOOK_URL` | n8n webhook for chatbot | For AI chat |
| `N8N_ESCALATION_URL` | n8n webhook base for escalation | For escalation |
| `MOD_LOG_CHANNEL_ID` | Channel ID for mod logs | Optional (finds by name) |
| `CHATBOT_CHANNEL_ID` | Dedicated chatbot channel | Optional |
| `LUMIST_VERIFY_URL` | URL for Lumist.ai account verification | Optional (default: https://lumist.ai/discord-verify) |

---

## How to Make Changes

When asked to modify the bot or server, follow this pattern:

### 1. Bot Code Changes (bot.js)

For any bot behavior changes:
1. Modify `bot.js` directly
2. Update the relevant constant (ROLES, CHANNELS, AUTOMOD_CONFIG)
3. Update `SERVER_CONFIG.md` to document the change
4. Commit and push to trigger Render auto-deploy

### 2. Server Configuration Changes

The bot does NOT automatically create channels/roles. For server changes:
1. Update `SERVER_CONFIG.md` with the new structure
2. Provide manual steps for the user to execute in Discord
3. Update bot code if the bot needs to reference the new element

---

## Common Change Patterns

### Adding a New Nationality Option

1. Add role constant to `ROLES`:
   ```javascript
   THAILAND: '🇹🇭 Thailand',
   ```
2. Add to `NATIONALITY_MAP`:
   ```javascript
   [ROLES.THAILAND]: 'thailand',
   ```
3. Add option in `createNationalitySelect()`:
   ```javascript
   { label: 'Thailand', value: 'thailand', emoji: '🇹🇭' },
   ```
4. Add role mapping in `getNationalityRole()`:
   ```javascript
   'thailand': ROLES.THAILAND,
   ```
5. Update `SERVER_CONFIG.md`
6. **Manual step:** User must create `🇹🇭 Thailand` role in Discord

### Adding a New Grade Option

1. Add role constant to `ROLES`
2. Add to `GRADE_MAP`
3. Add option in `createGradeSelect()`
4. Add role mapping in `getGradeRole()`
5. Update `SERVER_CONFIG.md`
6. **Manual step:** User must create role in Discord

### Adding a New Slash Command

1. Add command definition to the `commands` array
2. Add handler in `client.on(Events.InteractionCreate, ...)` under `isChatInputCommand()`
3. Commands auto-register on bot startup
4. Update `SERVER_CONFIG.md`

### Adding a New Channel Feature

1. Add channel name to `CHANNELS` constant
2. Add feature logic in appropriate event handler
3. Update `SERVER_CONFIG.md`
4. **Manual step:** User must create the channel in Discord

### Modifying Auto-Mod Rules

1. Update `AUTOMOD_CONFIG` object
2. Modify relevant check functions if needed
3. Update `SERVER_CONFIG.md`

### Modifying Onboarding Flow

**Onboarding now uses Discord's native Server Onboarding feature.**

The bot's old DM-based onboarding was removed in v4.3. Onboarding is configured via `setup-onboarding.js`.

Current flow:
1. User joins → Discord shows native onboarding UI
2. Country selection (9 options + "Other")
3. Grade selection (assigns grade role + 🌱 Member role)
4. Interests selection (optional - gives access to SAT/college channels)
5. User receives Member role → bot posts welcome in #introductions

To modify onboarding:
1. Edit `setup-onboarding.js` to change options
2. Run: `BOT_TOKEN=xxx node setup-onboarding.js`
3. Verify in Server Settings → Onboarding

**Note:** Discord limits onboarding to ~10 options per prompt.

---

## Verification System (Forum Channel)

The #verify channel is a **Forum Channel** with two pinned posts for verification. Regular users can view but cannot create new posts - only moderators and above can.

### Forum Structure
- Channel type: Forum
- Tags: `✅ Lumist.ai`, `🎓 Alumni`
- Pinned posts: 2 (one for each verification type)

### Lumist.ai Verification
- Users click button in the pinned post → receive verification link (ephemeral)
- Link configurable via `LUMIST_VERIFY_URL` environment variable
- Successful verification grants ✅ Verified role
- Premium users automatically get 💎 Premium role

### Alumni Verification
- Users click button in the pinned post → creates a private ticket channel
- User submits proof of college enrollment (student ID, acceptance letter, .edu email)
- Moderator reviews and grants 🎓 Alumni role
- Ticket closes after verification

### Permissions
- `@everyone`: Can view channel, cannot create posts or reply
- `Moderator+`: Can view, create posts, and manage threads
- `Bot`: Full access

### Setup
Run `/setupverify` to:
1. Delete existing #verify channel (if any)
2. Create new Forum channel
3. Create and pin both verification posts
4. Set proper permissions

### Button IDs
- `verify_lumist` - Opens Lumist.ai verification flow
- `verify_alumni` - Creates alumni verification ticket

---

## Brain Teaser Channel

The `#brain-teaser` channel under SAT STUDY posts daily SAT-style questions from Lumist.ai.

- **Type:** Text channel (read-only for users)
- **Bot posts:** Daily brain teaser questions
- **Logic:** To be implemented via n8n or external trigger

---

## College Application Forums

Two forum channels for college discussions. Each university gets ONE dedicated post.

### Channels
- `#us-college-apps` - US college applications (public)
- `#vietnam-college-apps` - Vietnam college applications (Vietnam role only)

### How It Works
1. **One post per university** - Moderators create posts using `/addcollege`
2. **Users can discuss** - Everyone can reply in threads, but cannot create new posts
3. **Tag filtering** - Users filter by Region, Type, or Status tags
4. **Wiki post** - First message contains deadlines, stats, and requirements link

### Commands

**`/setupcollegeforums`** (Admin)
Creates the brain-teaser channel and both college forum channels with proper permissions and tags.

**`/addcollege`** (Moderator)
Adds a new university post to a college forum.

```
/addcollege forum:US College Apps name:Stanford University deadline:Jan 2, 2026 avg_sat:1500-1570
```

**`/populatevncolleges`** (Admin)
Bulk-creates posts for Vietnam universities that accept SAT scores.

```
/populatevncolleges clear:True
```

Options:
- `clear` (optional): Set to `True` to delete all existing posts before creating new ones

This command creates posts for 25+ universities in Hanoi and Ho Chi Minh City, including:
- **Hanoi:** NEU, HUST, FTU, BFAV, AOF, TMU, DAV, HANU, NUCE, VNU schools, HMU, MMA
- **HCMC:** UEH, HCMUT, UMP, UEL, TDTU, BUH, HIU, OU-HCMC, HCMUARC
- **Multi-campus:** FTU, PTIT, RMIT (both cities)

Each post is automatically tagged with:
- City tags (🏙️ Hà Nội, 🌆 TP.HCM, or both)
- Type tags (💼 Business, 🔬 Tech, 🩺 Medical, 🎨 Arts, 🏛️ Top University)

### Tags

**US Forum:**
- Region: Northeast, West Coast, South, Midwest, International
- Type: Ivy League, Liberal Arts, State School, HBCU, Tech/STEM
- Status: Early Action, Early Decision, Regular Decision, Waitlist

**Vietnam Forum:**
- City: Hà Nội, TP.HCM, Đà Nẵng, Other Cities
- Type: Top University, Tech/Engineering, Business/Economics, Medical, Arts/Humanities
- Status: Application Open, Accepted, Waiting

---

## Escalation System

The bot includes an escalation system for human takeover from the AI chatbot.

### HTTP Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check |
| `/escalation/create` | POST | Create escalation embed in mod-logs |
| `/escalation/message` | POST | Forward user message to thread |
| `/escalation/update` | POST | Update escalation status |

### Escalation Flow

```
AI detects need for human → POST /escalation/create
       ↓
Embed appears in #mod-logs with Claim button
       ↓
Moderator clicks Claim → Thread created
       ↓
Agent replies in thread → forwarded to user via n8n
       ↓
Agent clicks Resolve or Return to AI
```

### Button Actions

- `claim_escalation_{id}` - Claim ticket, create thread
- `resolve_escalation_{id}` - Mark resolved
- `return_to_ai_{id}` - Hand back to AI
- `view_history_{id}` - View conversation history
- `open_thread_{id}` - Jump to thread

---

## Response Format for Changes

When making changes, always provide:

1. **Code changes** - The actual modifications to bot.js
2. **SERVER_CONFIG.md updates** - Document the change
3. **Manual steps** - Discord actions the user needs to take
4. **Testing steps** - How to verify the change works

### Example Response Format

```
## Changes Made

### bot.js
- Added Thailand nationality option
- Updated ROLES, NATIONALITY_MAP, createNationalitySelect(), getNationalityRole()

### SERVER_CONFIG.md
- Added Thailand to Nationality Roles table

## Manual Steps Required

1. Go to Discord Server Settings → Roles
2. Create new role: `🇹🇭 Thailand`
3. Position it below other nationality roles
4. No special permissions needed

## Testing

1. Have a test user join the server
2. Complete onboarding, select Thailand
3. Verify they receive the `🇹🇭 Thailand` role
```

---

## Deployment

- **Hosting**: GCP (Google Cloud Platform)
- **Database**: Supabase (`social_analytics` schema)
- **AI/Escalation**: n8n workflows
- **Process Manager**: PM2
- **SSH Alias**: `lumist-gcp`

### Server Operations

The bot runs on GCP and is managed using PM2.

```bash
# SSH into the server
ssh lumist-gcp

# PM2 commands (run on the server)
pm2 status lumi-bot      # Check bot status
pm2 logs lumi-bot        # View logs
pm2 restart lumi-bot     # Restart the bot
pm2 stop lumi-bot        # Stop the bot
pm2 start bot.js --name lumi-bot  # Start the bot
```

### Deploying Updates

SSH into the server and run the update script:

```bash
ssh lumist-gcp
cd ~/lumi-bot && git pull origin main && npm install && pm2 restart lumi-bot
```

Or use the update script:

```bash
ssh lumist-gcp 'bash ~/lumi-bot/update.sh'
```

### Health Check

```
GET http://<server-ip>:3000/health

Response:
{
  "status": "ok",
  "bot": "Lumi#1234",
  "uptime": 3600,
  "analyticsEnabled": true,
  "chatbotEnabled": true,
  "escalationEnabled": true,
  "timestamp": "2026-01-19T12:00:00Z"
}
```

---

## Testing Checklist

Before committing changes:
- [ ] Bot starts without errors locally (if testing)
- [ ] Slash commands register correctly
- [ ] Onboarding flow works end-to-end
- [ ] Auto-mod doesn't trigger on staff
- [ ] Analytics events fire correctly
- [ ] Escalation system creates embeds/threads
- [ ] SERVER_CONFIG.md is updated
