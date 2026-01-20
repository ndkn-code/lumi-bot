# Lumist.ai Discord Bot

Discord bot v4.6 for the Lumist.ai community. Full-featured community management with native Discord onboarding, moderation, AI chatbot, ticketing, verification, college forums, and analytics.

## Features

### Core
- 🎉 **Native Discord Onboarding** - Polished onboarding UI with country/grade selection and interest-based channel access
- 👋 **Smart Welcome** - Personalized welcome in #introductions with quick links when onboarding completes
- ✅ **Verification System** - Forum-based #verify channel with Lumist.ai account linking and Alumni verification
- 🎓 **College Application Forums** - US and Vietnam college discussion forums with tagging system
- 🧠 **Brain Teaser Channel** - Daily SAT-style questions from Lumist.ai

### Moderation
- 🛡️ **Auto-Moderation** - Spam detection, mention spam, duplicate messages, link filtering, banned words
- 🚨 **Raid Protection** - Automatic lockdown when join threshold exceeded
- ⚠️ **Warning System** - Escalating punishments (warn → mute → ban)
- 🔧 **Slash Commands** - `/warn`, `/mute`, `/unmute`, `/kick`, `/ban`, `/purge`, `/warnings`, `/clearwarnings`

### Support
- 🎫 **Ticket System** - Category-based tickets (General, Bug Report, Alumni Verification)
- 🤖 **AI Chatbot** - Lumi chatbot via n8n webhook (responds to mentions, DMs, and #ask-lumi)
- 📞 **Escalation System** - Human handoff from AI with Discord thread support

### Analytics
- 📊 **Supabase Integration** - Server stats, member events, channel activity, funnel tracking
- 📈 **Demographics** - Nationality and grade distribution tracking

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `BOT_TOKEN` | Discord bot token | ✅ Yes |
| `GUILD_ID` | Discord server ID | Optional (has default) |
| `PORT` | HTTP server port (default: 3000) | Optional |
| `SUPABASE_URL` | Supabase project URL | Optional |
| `SUPABASE_SERVICE_KEY` | Supabase service key for analytics | Optional |
| `N8N_WEBHOOK_URL` | n8n webhook for AI chatbot | Optional |
| `CHATBOT_CHANNEL_ID` | Channel ID for dedicated chatbot channel | Optional |
| `N8N_ESCALATION_URL` | n8n webhook for escalation system | Optional |
| `MOD_LOG_CHANNEL_ID` | Channel ID for mod logs | Optional |
| `LUMIST_VERIFY_URL` | URL for Lumist.ai verification | Optional |

## Initial Setup

### Configure Discord Onboarding

Before running the bot, configure Discord's native onboarding:

```bash
BOT_TOKEN=your_token node setup-onboarding.js
```

This script:
- Creates country roles for nationality selection (9 options due to Discord limits)
- Configures onboarding prompts (country, grade, interests)
- Sets up default channels with proper @everyone permissions
- Enables the Server Guide

After running, verify in **Server Settings > Onboarding**.

### Setup Verification Channel

After the bot is running, set up the #verify channel:

```
/setupverify
```

This creates FAQ-style posts in #verify for:
- **Lumist.ai Verification** - Link account for Verified badge
- **Alumni Verification** - Submit proof for Alumni role

## Deployment on GCP

The bot runs on a Google Cloud Platform Compute Engine instance.

### Setup

1. Create a GCP Compute Engine VM (e2-micro or larger)
2. SSH into the instance and install Node.js 18+
3. Clone/upload the repository
4. Install dependencies: `npm install`
5. Run `setup-onboarding.js` to configure Discord onboarding (one-time)
6. Set environment variables (via `.env` file or systemd service)
7. Run with: `npm start`

### Running as a Service

Create a systemd service for auto-restart:

```bash
sudo nano /etc/systemd/system/lumist-bot.service
```

```ini
[Unit]
Description=Lumist Discord Bot
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/lumi-bot
ExecStart=/usr/bin/node bot.js
Restart=always
RestartSec=10
Environment=BOT_TOKEN=your-token
Environment=SUPABASE_SERVICE_KEY=your-key
Environment=N8N_WEBHOOK_URL=https://n8n.lumist.ai/webhook/discord-webhook

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable lumist-bot
sudo systemctl start lumist-bot
```

## HTTP Endpoints

The bot exposes an HTTP server for health checks and escalation webhooks:

### Health Check
- `GET /` or `GET /health`

```json
{
  "status": "ok",
  "bot": "Lumi Bot#1234",
  "uptime": 3600,
  "analyticsEnabled": true,
  "chatbotEnabled": true,
  "escalationEnabled": true,
  "timestamp": "2026-01-19T12:00:00.000Z"
}
```

### Escalation Endpoints
- `POST /escalation/create` - Create new escalation embed
- `POST /escalation/message` - Forward user message to thread
- `POST /escalation/update` - Update escalation status

## Slash Commands

| Command | Description | Permission |
|---------|-------------|------------|
| `/ask <question>` | Ask Lumi a question | Everyone |
| `/ticket` | Create a support ticket | Everyone |
| `/warn <user> <reason>` | Issue a warning | Moderator |
| `/mute <user> <duration>` | Timeout a user | Moderator |
| `/unmute <user>` | Remove timeout | Moderator |
| `/kick <user> [reason]` | Kick a user | Kick Members |
| `/ban <user> [reason] [days]` | Ban a user | Ban Members |
| `/warnings <user>` | Check user warnings | Moderator |
| `/clearwarnings <user>` | Clear user warnings | Admin |
| `/purge <amount> [user]` | Delete messages | Manage Messages |
| `/stats` | Server statistics | Manage Guild |
| `/setuptickets` | Setup ticket system | Admin |
| `/setupverify` | Setup verification forum in #verify | Admin |
| `/setupcollegeforums` | Setup college forums and brain-teaser channel | Admin |
| `/addcollege` | Add a university post to college forum | Moderator |
| `/populatevncolleges` | Bulk-create Vietnam university posts | Admin |
| `/close` | Close current ticket | Manage Channels |

## License

MIT
