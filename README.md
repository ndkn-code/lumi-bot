# Lumist.ai Discord Bot

Discord bot for the Lumist.ai community. Handles member onboarding with interactive questionnaires and automatic role assignment.

## Features

- 🎉 **Welcome DM** - Automatic welcome message when members join
- 📝 **Interactive Onboarding** - Step-by-step questionnaire
- 🏷️ **Auto Role Assignment** - Assigns roles based on selections
- 👋 **Introduction Post** - Posts welcome in #introductions
- 🌐 **Health Check Endpoint** - For uptime monitoring services

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `BOT_TOKEN` | Your Discord bot token | ✅ Yes |
| `GUILD_ID` | Your Discord server ID | Optional |
| `PORT` | HTTP server port (default: 3000) | Optional |

## Deployment on Render

1. Fork/upload this repo to GitHub
2. Create a new **Web Service** on Render
3. Connect your GitHub repo
4. Set environment variable: `BOT_TOKEN`
5. Deploy!

### Keep-Alive Setup

Use a free ping service to prevent Render from sleeping:

1. After deploying, copy your Render URL (e.g., `https://lumist-discord-bot.onrender.com`)
2. Sign up at [BetterStack](https://betterstack.com) or [UptimeRobot](https://uptimerobot.com)
3. Create a monitor that pings your URL every 5 minutes

## Health Check Endpoint

The bot exposes a health check at:
- `GET /` or `GET /health`

Returns:
```json
{
  "status": "ok",
  "bot": "Lumist Bot#1234",
  "uptime": 3600,
  "timestamp": "2026-01-03T12:00:00.000Z"
}
```

## License

MIT
