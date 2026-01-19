# Lumist.ai Discord Server Configuration

> **This file is the source of truth for the Discord server structure.**  
> When making changes, update this file AND the bot code accordingly.  
> **Last synced:** January 2026 | **Bot version:** 4.2

---

## Server Info

| Property | Value |
|----------|-------|
| Server Name | Lumist.ai |
| Server ID | `1456886174600794291` |
| Bot Name | Lumi |
| Bot Version | 4.2 |

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

Bot assigns during onboarding based on user selection.

| Role Name | Value in Code | Emoji |
|-----------|---------------|-------|
| 🇻🇳 Vietnam | `vietnam` | 🇻🇳 |
| 🇺🇸 United States | `usa` | 🇺🇸 |
| 🇬🇧 United Kingdom | `uk` | 🇬🇧 |
| 🇸🇬 Singapore | `singapore` | 🇸🇬 |
| 🇰🇷 South Korea | `korea` | 🇰🇷 |
| 🇯🇵 Japan | `japan` | 🇯🇵 |
| 🇨🇳 China | `china` | 🇨🇳 |
| 🇮🇳 India | `india` | 🇮🇳 |
| 🌏 Other International | `other` | 🌏 |

### Grade Level Roles (No Color - Tags Only)

Bot assigns during onboarding based on user selection.

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

The onboarding is a **2-step process** (nationality + grade):

```
1. User joins server
   └─> Bot sends Welcome DM (or fallback to #welcome)
   
2. User clicks "🚀 Let's Go!" button
   └─> Bot shows Nationality dropdown (Step 1 of 2)
   
3. User selects Nationality
   └─> Bot shows Grade dropdown (Step 2 of 2)
   
4. User selects Grade
   └─> Bot shows Rules + Accept button
   
5. User clicks "✅ I Accept"
   └─> Bot assigns roles:
       - 🌱 Member
       - Nationality role (e.g., 🇻🇳 Vietnam)
       - Grade role (e.g., 🎒 Junior)
   └─> Bot posts welcome in #introductions
   └─> User gains access to server
```

### Onboarding Options

**Nationality Options (Step 1):**
| Label | Value | Emoji |
|-------|-------|-------|
| Vietnam | `vietnam` | 🇻🇳 |
| United States | `usa` | 🇺🇸 |
| United Kingdom | `uk` | 🇬🇧 |
| Singapore | `singapore` | 🇸🇬 |
| South Korea | `korea` | 🇰🇷 |
| Japan | `japan` | 🇯🇵 |
| China | `china` | 🇨🇳 |
| India | `india` | 🇮🇳 |
| Other | `other` | 🌏 |

**Grade Options (Step 2):**
| Label | Value | Emoji |
|-------|-------|-------|
| Freshman (Grade 9) | `freshman` | 📗 |
| Sophomore (Grade 10) | `sophomore` | 📘 |
| Junior (Grade 11) | `junior` | 📙 |
| Senior (Grade 12) | `senior` | 📕 |
| Gap Year / Other | `gap_year` | 📓 |

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
