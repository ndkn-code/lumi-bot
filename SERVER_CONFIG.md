# Lumist.ai Discord Server Configuration

> **This file is the source of truth for the Discord server structure.**
> When making changes, update this file AND the bot code accordingly.
> **Last synced:** January 2026 | **Bot version:** 4.3

---

## Server Info

| Property | Value |
|----------|-------|
| Server Name | Lumist.ai |
| Server ID | `1456886174600794291` |
| Bot Name | Lumi |
| Bot Version | 4.3 |

---

## Role Hierarchy

Roles are listed from highest to lowest. The bot role must be above all roles it needs to assign.

### Staff Roles

| Position | Role Name | Color | Permissions | Bot Assigns? |
|----------|-----------|-------|-------------|--------------|
| 1 | 👑 Founder | `#E74C3C` | Administrator | ❌ |
| 2 | ⚙️ Admin | `#9B59B6` | Manage Server, Manage Roles | ❌ |
| 3 | 🛡️ Moderator | `#3498DB` | Moderate Members, Manage Messages | ❌ |
| 4 | 🤖 Lumi (Bot) | `#5865F2` | Administrator | ❌ (self) |

### Subscription/Tier Roles

| Position | Role Name | Color | Permissions | Bot Assigns? |
|----------|-----------|-------|-------------|--------------|
| 5 | 💎 Premium | `#F1C40F` | View Premium Channels | ✅ (via verification) |
| 6 | ✅ Verified | `#2ECC71` | None extra | ✅ (via verification) |
| 7 | 🎓 Alumni | `#1ABC9C` | View Alumni Channels | ✅ (via verification) |
| 8 | 🌱 Member | `#95A5A6` | View General Channels | ✅ (onboarding) |

### Nationality Roles (No Color - Tags Only)

Assigned via Discord's native onboarding. Expanded list of ~40 countries.

| Role Name | Emoji | | Role Name | Emoji |
|-----------|-------|-|-----------|-------|
| 🇺🇸 United States | 🇺🇸 | | 🇻🇳 Vietnam | 🇻🇳 |
| 🇬🇧 United Kingdom | 🇬🇧 | | 🇨🇦 Canada | 🇨🇦 |
| 🇦🇺 Australia | 🇦🇺 | | 🇮🇳 India | 🇮🇳 |
| 🇨🇳 China | 🇨🇳 | | 🇯🇵 Japan | 🇯🇵 |
| 🇰🇷 South Korea | 🇰🇷 | | 🇸🇬 Singapore | 🇸🇬 |
| 🇹🇭 Thailand | 🇹🇭 | | 🇲🇾 Malaysia | 🇲🇾 |
| 🇵🇭 Philippines | 🇵🇭 | | 🇮🇩 Indonesia | 🇮🇩 |
| 🇹🇼 Taiwan | 🇹🇼 | | 🇭🇰 Hong Kong | 🇭🇰 |
| 🇩🇪 Germany | 🇩🇪 | | 🇫🇷 France | 🇫🇷 |
| 🇳🇱 Netherlands | 🇳🇱 | | 🇮🇹 Italy | 🇮🇹 |
| 🇪🇸 Spain | 🇪🇸 | | 🇵🇹 Portugal | 🇵🇹 |
| 🇧🇷 Brazil | 🇧🇷 | | 🇲🇽 Mexico | 🇲🇽 |
| 🇦🇷 Argentina | 🇦🇷 | | 🇨🇴 Colombia | 🇨🇴 |
| 🇳🇬 Nigeria | 🇳🇬 | | 🇿🇦 South Africa | 🇿🇦 |
| 🇪🇬 Egypt | 🇪🇬 | | 🇦🇪 UAE | 🇦🇪 |
| 🇸🇦 Saudi Arabia | 🇸🇦 | | 🇵🇰 Pakistan | 🇵🇰 |
| 🇧🇩 Bangladesh | 🇧🇩 | | 🇳🇵 Nepal | 🇳🇵 |
| 🇱🇰 Sri Lanka | 🇱🇰 | | 🇳🇿 New Zealand | 🇳🇿 |
| 🇮🇪 Ireland | 🇮🇪 | | 🇵🇱 Poland | 🇵🇱 |
| 🇷🇺 Russia | 🇷🇺 | | 🇹🇷 Turkey | 🇹🇷 |
| 🌏 Other International | 🌏 | | | |

### Grade Level Roles (No Color - Tags Only)

Assigned via Discord's native onboarding.

| Role Name | Value in Code | Emoji |
|-----------|---------------|-------|
| 🎒 Freshman | `freshman` | 📗 (in menu) |
| 🎒 Sophomore | `sophomore` | 📘 (in menu) |
| 🎒 Junior | `junior` | 📙 (in menu) |
| 🎒 Senior | `senior` | 📕 (in menu) |
| 🎒 Gap Year | `gap_year` | 📓 (in menu) |

---

## Channel Structure

### Required Channels (Bot References These)

| Channel Name | Constant | Purpose | Bot Uses |
|--------------|----------|---------|----------|
| `introductions` | `CHANNELS.INTRODUCTIONS` | Welcome posts | ✅ Posts welcome message |
| `welcome` | `CHANNELS.WELCOME` | Fallback onboarding | ✅ Sends button if DM fails |
| `rules` | `CHANNELS.RULES` | Server rules | ❌ Referenced only |
| `mod-logs` | `CHANNELS.MOD_LOGS` | Mod actions + escalations | ✅ Logs all mod actions |
| `support-tickets` | `CHANNELS.SUPPORT_TICKETS` | Ticket creation | ✅ Ticket panel |
| `ask-lumi` | `CHANNELS.ASK_LUMI` | AI chatbot channel | ✅ Responds to all messages |

### Recommended Additional Channels

| Category | Channel | Purpose |
|----------|---------|---------|
| 📌 Welcome & Info | #rules | Server rules |
| 📌 Welcome & Info | #announcements | Official announcements |
| 📌 Welcome & Info | #verify-account | Link Discord to Lumist.ai |
| 💬 General | #general-chat | Main chat |
| 💬 General | #off-topic | Non-SAT discussion |
| 📖 SAT Study | #sat-math | Math questions |
| 📖 SAT Study | #sat-reading | Reading questions |
| 📖 SAT Study | #sat-writing | Writing questions |
| 🎓 College | #college-apps | Application discussion |
| 🎓 College | #alumni-lounge | Alumni only |
| 💎 Premium | #premium-lounge | Premium only |
| 🔒 Staff | #staff-chat | Staff discussion |

---

## Onboarding Flow

Uses **Discord's Native Server Onboarding** (configured via Server Settings > Onboarding).

```
1. User joins server
   └─> Discord shows native onboarding UI

2. Prompt 1: "Where are you from?" (required)
   └─> User selects country from ~40 options
   └─> Discord assigns nationality role

3. Prompt 2: "What grade are you in?" (required)
   └─> User selects grade level
   └─> Discord assigns grade role + 🌱 Member role

4. Prompt 3: "What are you interested in?" (optional)
   └─> User selects interests (SAT Math, Reading, College Apps)
   └─> Discord opts user into relevant channels

5. Onboarding completes
   └─> Bot detects Member role assignment
   └─> Bot posts welcome in #introductions
   └─> User gains full server access
```

### Setup Script

Run `setup-onboarding.js` to configure Discord's native onboarding:

```bash
BOT_TOKEN=your_token node setup-onboarding.js
```

This creates country roles and configures the onboarding prompts.

### Onboarding Prompts

**Prompt 1: Country Selection** - See Nationality Roles table above (~40 countries)

**Prompt 2: Grade Selection:**
| Label | Role Assigned | Emoji |
|-------|---------------|-------|
| Freshman (Grade 9) | 🎒 Freshman + 🌱 Member | 📗 |
| Sophomore (Grade 10) | 🎒 Sophomore + 🌱 Member | 📘 |
| Junior (Grade 11) | 🎒 Junior + 🌱 Member | 📙 |
| Senior (Grade 12) | 🎒 Senior + 🌱 Member | 📕 |
| Gap Year / College | 🎒 Gap Year + 🌱 Member | 📓 |

**Prompt 3: Interests (Optional):**
| Label | Channels Opted Into |
|-------|---------------------|
| SAT Math | #sat-math |
| SAT Reading & Writing | #sat-reading |
| College Applications | #college-apps |

---

## Auto-Moderation Rules

| Rule | Trigger | Action |
|------|---------|--------|
| **Spam** | 5+ messages in 5 seconds | 10 min mute + warning |
| **Link Filter** | Non-whitelisted URL | Delete + warning |
| **Mention Spam** | 5+ mentions in one message | Delete + warning |
| **Duplicate** | Same message 3x in 60 seconds | Warning |
| **Raid** | 10+ joins in 1 minute | Lockdown mode (5 min) |

### Whitelisted Domains

```
lumist.ai, www.lumist.ai, app.lumist.ai
collegeboard.org, www.collegeboard.org
khanacademy.org, www.khanacademy.org
youtube.com, www.youtube.com, youtu.be
discord.com, discord.gg
imgur.com, i.imgur.com
gyazo.com, tenor.com, giphy.com
```

### Warning Escalation

| Warning # | Action |
|-----------|--------|
| 1 | Warning (DM) |
| 2 | 1 hour mute |
| 3 | 24 hour mute |
| 4 | 7 day ban |
| 5 | Permanent ban |

Warnings expire after **30 days**.

---

## Bot Commands

### Slash Commands (Moderators)

| Command | Description | Permission |
|---------|-------------|------------|
| `/warn @user [reason]` | Issue warning | Moderate Members |
| `/mute @user [duration] [reason]` | Timeout user (minutes, max 40320) | Moderate Members |
| `/unmute @user` | Remove timeout | Moderate Members |
| `/kick @user [reason]` | Kick user | Kick Members |
| `/ban @user [reason] [days]` | Ban user (delete 0-7 days messages) | Ban Members |
| `/warnings @user` | View user's warnings | Moderate Members |
| `/clearwarnings @user` | Clear all warnings | Administrator |
| `/purge [amount] [user]` | Delete messages (1-100) | Manage Messages |
| `/stats` | View server statistics | Manage Guild |

### Slash Commands (Everyone)

| Command | Description |
|---------|-------------|
| `/ticket` | Create a support ticket |
| `/ask [question]` | Ask Lumi AI a question |

### Admin Commands

| Command | Description | Permission |
|---------|-------------|------------|
| `/setuptickets` | Create ticket panel in channel | Administrator |
| `/close` | Close current ticket channel | Manage Channels |

---

## Ticket System

### Ticket Categories

| Category | Value | Description |
|----------|-------|-------------|
| 💬 General Support | `general` | General questions |
| 🐛 Bug Report | `bug` | Lumist.ai bugs |
| 🎓 Alumni Verification | `alumni` | Score/university verify |

### Ticket Flow

```
User clicks "🎫 Create Ticket" (or /ticket)
       ↓
Select category dropdown
       ↓
Private channel created: ticket-XXXX-username
       ↓
Staff notified, user describes issue
       ↓
Staff clicks "🔒 Close Ticket" or /close
       ↓
Channel deleted
```

---

## Escalation System

The escalation system allows human takeover from the AI chatbot.

### Escalation Flow

```
AI detects need for human assistance
       ↓
n8n calls POST /escalation/create
       ↓
Embed appears in #mod-logs with:
  - Priority indicator (🔴 Urgent, 🟠 High, 🟡 Medium, 🟢 Low)
  - User info, platform, trigger reason
  - "🙋 Claim Ticket" and "👁️ View History" buttons
       ↓
Moderator clicks "🙋 Claim Ticket"
       ↓
Thread created on the embed message
       ↓
Agent replies in thread → forwarded to user
User replies → appears in thread
       ↓
Agent clicks "✅ Resolve" or "🤖 Return to AI"
```

### Escalation Priorities

| Priority | Color | Emoji | Pings Mods? |
|----------|-------|-------|-------------|
| Urgent | Red | 🔴 | ✅ Yes |
| High | Orange | 🟠 | ✅ Yes |
| Medium | Yellow | 🟡 | ❌ No |
| Low | Green | 🟢 | ❌ No |

### HTTP Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check |
| `/escalation/create` | POST | Create escalation embed |
| `/escalation/message` | POST | Forward user message to thread |
| `/escalation/update` | POST | Update escalation status |

---

## AI Chatbot

Users can interact with Lumi AI in these ways:

| Method | How It Works |
|--------|--------------|
| **DM the bot** | Send any message directly to Lumi |
| **Mention the bot** | `@Lumi what is Lumist?` in any channel |
| **#ask-lumi channel** | All messages in this channel go to AI |
| **/ask command** | `/ask question:How do I study?` |

### Chatbot Configuration

- **Cooldown:** 2 seconds between messages per user
- **Webhook:** Configured via `N8N_WEBHOOK_URL`
- **Typing indicator:** Shown while processing

---

## Analytics Events Tracked

| Event | When | Data Captured |
|-------|------|---------------|
| `join` | User joins server | user_id, username |
| `leave` | User leaves server | user_id, username, roles |
| `onboarding_complete` | Finishes onboarding | user_id, nationality, grade |
| `verified` | Gets Verified role | user_id |
| `premium_added` | Gets Premium role | user_id |
| `premium_removed` | Loses Premium role | user_id |

### Analytics Tables (Supabase)

- `discord_server_stats` - Snapshots every 5 min
- `discord_member_events` - Real-time events
- `discord_channel_activity` - Message counts
- `discord_nationality_stats` - Nationality distribution
- `discord_grade_stats` - Grade distribution
- `discord_funnel_stats` - Conversion funnel

---

## Change Log

| Date | Change | By |
|------|--------|-----|
| 2026-01-19 | v4.3: Migrated to Discord native onboarding | Claude |
| 2026-01-19 | Expanded nationality options to ~40 countries | Claude |
| 2026-01-19 | Added interests prompt (SAT Math, Reading, College Apps) | Claude |
| 2026-01-19 | Removed bot DM-based onboarding | Claude |
| 2026-01-19 | Updated to v4.2, added escalation system | Claude |
| 2026-01-19 | Simplified onboarding to 2 steps (removed score) | User |
| 2026-01-19 | Added UK, Singapore, India nationalities | User |
| 2026-01-19 | Changed Admin role emoji to ⚙️ | User |

---

## How to Update This File

When making server changes:

1. **Add new role**: Add to Role tables above, update bot.js ROLES constant
2. **Add new channel**: Add to Channel tables, update bot.js CHANNELS constant if bot needs it
3. **Change onboarding**: Update Onboarding Flow section, modify bot.js select menus
4. **Change auto-mod**: Update Auto-Moderation Rules, modify bot.js AUTOMOD_CONFIG
5. **Add new command**: Update Bot Commands tables, add to bot.js commands array

**Always sync this file with actual bot.js code!**
