/**
 * Lumist.ai Discord Bot v4.6
 *
 * Features:
 * - Native Discord Onboarding (via Server Settings)
 * - Auto-moderation
 * - Slash commands
 * - Ticket system
 * - Analytics pipeline (Supabase integration)
 * - AI Chatbot via n8n
 * - Escalation System
 * - Forum-based Verification System
 * - College Application Forums (US + Vietnam)
 * - Brain Teaser Channel
 * - Bulk Vietnam college population command
 */

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  Events,
  PermissionFlagsBits,
  SlashCommandBuilder,
  REST,
  Routes,
  ChannelType,
  Partials,
  ForumLayoutType,
  SortOrderType,
} = require('discord.js');

const http = require('http');

// ============================================
// CONFIGURATION
// ============================================
const BOT_TOKEN = process.env.BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID || '1456886174600794291';
const PORT = process.env.PORT || 3000;

// Supabase Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://jkcdwriffpfoyrtqqtzt.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANALYTICS_INTERVAL = 5 * 60 * 1000;

// n8n Chatbot Configuration
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || 'https://n8n.lumist.ai/webhook/discord-webhook';
const CHATBOT_CHANNEL_ID = process.env.CHATBOT_CHANNEL_ID;

// Escalation Configuration
const N8N_ESCALATION_URL = process.env.N8N_ESCALATION_URL || 'https://n8n.lumist.ai/webhook';
const MOD_LOG_CHANNEL_ID = process.env.MOD_LOG_CHANNEL_ID;

if (!BOT_TOKEN) {
  console.error('❌ Error: BOT_TOKEN environment variable is not set');
  process.exit(1);
}

if (!SUPABASE_SERVICE_KEY) {
  console.warn('⚠️ Warning: SUPABASE_SERVICE_KEY not set - analytics disabled');
}

// ============================================
// AUTO-MOD CONFIGURATION
// ============================================
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

const ROLES = {
  MEMBER: '🌱 Member',
  VERIFIED: '✅ Verified',
  PREMIUM: '💎 Premium',
  ALUMNI: '🎓 Alumni',
  MODERATOR: '🛡️ Moderator',
  ADMIN: '⚙️ Admin',
  FOUNDER: '👑 Founder',
  VIETNAM: '🇻🇳 Vietnam',
  USA: '🇺🇸 United States',
  UK: '🇬🇧 United Kingdom',
  SINGAPORE: '🇸🇬 Singapore',
  KOREA: '🇰🇷 South Korea',
  JAPAN: '🇯🇵 Japan',
  CHINA: '🇨🇳 China',
  INDIA: '🇮🇳 India',
  OTHER: '🌏 Other International',
  FRESHMAN: '🎒 Freshman',
  SOPHOMORE: '🎒 Sophomore',
  JUNIOR: '🎒 Junior',
  SENIOR: '🎒 Senior',
  GAP_YEAR: '🎒 Gap Year',
};

const NATIONALITY_MAP = {
  [ROLES.VIETNAM]: 'vietnam',
  [ROLES.USA]: 'usa',
  [ROLES.UK]: 'uk',
  [ROLES.SINGAPORE]: 'singapore',
  [ROLES.KOREA]: 'korea',
  [ROLES.JAPAN]: 'japan',
  [ROLES.CHINA]: 'china',
  [ROLES.INDIA]: 'india',
  [ROLES.OTHER]: 'other',
};

const GRADE_MAP = {
  [ROLES.FRESHMAN]: 'freshman',
  [ROLES.SOPHOMORE]: 'sophomore',
  [ROLES.JUNIOR]: 'junior',
  [ROLES.SENIOR]: 'senior',
  [ROLES.GAP_YEAR]: 'gap_year',
};

// ============================================
// BOT CLIENT
// ============================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildPresences,
  ],
  partials: [Partials.Channel, Partials.Message],
});

// ============================================
// DATA STORES
// ============================================
const messageHistory = new Map();
const duplicateHistory = new Map();
const joinHistory = [];
const userWarnings = new Map();
const activeTickets = new Map();
let isRaidMode = false;
const channelMessageCounts = new Map();
const chatbotCooldown = new Map();
const CHATBOT_COOLDOWN_MS = 2000;

// Escalation tracking
const escalationThreads = new Map();
const escalationMessages = new Map();

// ============================================
// HTTP SERVER (Health Check + Escalation)
// ============================================
const server = http.createServer(async (req, res) => {
  const parseBody = () => {
    return new Promise((resolve) => {
      let body = '';
      req.on('data', chunk => body += chunk.toString());
      req.on('end', () => {
        try { resolve(body ? JSON.parse(body) : {}); }
        catch (e) { resolve({}); }
      });
    });
  };

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

  if ((req.url === '/' || req.url === '/health') && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      bot: client.user ? client.user.tag : 'connecting...',
      uptime: process.uptime(),
      analyticsEnabled: !!SUPABASE_SERVICE_KEY,
      chatbotEnabled: !!N8N_WEBHOOK_URL,
      escalationEnabled: true,
      timestamp: new Date().toISOString()
    }));
    return;
  }

  if (req.url === '/escalation/create' && req.method === 'POST') {
    try {
      const data = await parseBody();
      const result = await createEscalationEmbed(data);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (error) {
      console.error('❌ Escalation create error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
    return;
  }

  if (req.url === '/escalation/message' && req.method === 'POST') {
    try {
      const data = await parseBody();
      const result = await forwardUserMessageToThread(data);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (error) {
      console.error('❌ Escalation message error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
    return;
  }

  if (req.url === '/escalation/update' && req.method === 'POST') {
    try {
      const data = await parseBody();
      const result = await updateEscalationEmbed(data);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (error) {
      console.error('❌ Escalation update error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: error.message }));
    }
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`🌐 Health check server running on port ${PORT}`);
});

// ============================================
// ESCALATION FUNCTIONS
// ============================================
async function createEscalationEmbed(data) {
  const guild = await client.guilds.fetch(GUILD_ID);
  
  let modLogChannel;
  if (MOD_LOG_CHANNEL_ID) {
    modLogChannel = await guild.channels.fetch(MOD_LOG_CHANNEL_ID);
  } else {
    modLogChannel = await findChannel(guild, CHANNELS.MOD_LOGS);
  }
  
  if (!modLogChannel) throw new Error('Mod log channel not found');

  const priorityConfig = {
    urgent: { color: '#FF0000', emoji: '🔴', pingRole: true },
    high: { color: '#FFA500', emoji: '🟠', pingRole: true },
    medium: { color: '#FFFF00', emoji: '🟡', pingRole: false },
    low: { color: '#00FF00', emoji: '🟢', pingRole: false }
  };

  const config = priorityConfig[data.priority] || priorityConfig.medium;

  const embed = new EmbedBuilder()
    .setColor(config.color)
    .setTitle(`🎫 New Escalation [${(data.priority || 'medium').toUpperCase()}]`)
    .addFields(
      { name: 'Platform', value: data.source_platform || 'Unknown', inline: true },
      { name: 'User', value: data.user_context?.platform_username || 'Unknown', inline: true },
      { name: 'Team', value: data.team || 'support', inline: true }
    );

  if (data.trigger_reason) {
    embed.addFields({ name: 'Trigger', value: data.trigger_reason, inline: false });
  }

  if (data.sales_context?.sales_stage) {
    embed.addFields(
      { name: 'Sales Stage', value: data.sales_context.sales_stage, inline: true },
      { name: 'Qualified', value: data.sales_context.is_qualified ? '✅ Yes' : '❌ No', inline: true }
    );
  }

  if (data.last_messages?.length > 0) {
    const lastMsg = data.last_messages[data.last_messages.length - 1];
    const content = lastMsg.content || lastMsg.message || '';
    const truncated = content.length > 200 ? content.substring(0, 197) + '...' : content;
    embed.addFields({ name: 'Last Message', value: `"${truncated}"`, inline: false });
  }

  embed.setFooter({ text: `Escalation ID: ${data.escalation_id}` });
  embed.setTimestamp();

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`claim_escalation_${data.escalation_id}`).setLabel('🙋 Claim Ticket').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`view_history_${data.escalation_id}`).setLabel('👁️ View History').setStyle(ButtonStyle.Secondary)
  );

  let messageContent = '';
  if (config.pingRole) {
    const modRole = await findRole(guild, ROLES.MODERATOR);
    if (modRole) messageContent = `<@&${modRole.id}> `;
  }
  messageContent += `${config.emoji} **${(data.priority || 'medium').toUpperCase()}** priority escalation`;

  const message = await modLogChannel.send({ content: messageContent, embeds: [embed], components: [buttons] });
  escalationMessages.set(message.id, data.escalation_id);
  console.log(`🎫 Created escalation embed for ${data.escalation_id}`);

  return { success: true, discord_message_id: message.id, discord_channel_id: modLogChannel.id };
}

async function forwardUserMessageToThread(data) {
  const { thread_id, message, user_name } = data;
  if (!thread_id) return { success: false, error: 'No thread ID provided' };

  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const thread = await guild.channels.fetch(thread_id);
    if (!thread || !thread.isThread()) return { success: false, error: 'Thread not found' };

    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setAuthor({ name: `💬 ${user_name || 'User'}` })
      .setDescription(message)
      .setTimestamp();

    await thread.send({ embeds: [embed] });
    console.log(`💬 Forwarded user message to thread ${thread_id}`);
    return { success: true };
  } catch (error) {
    console.error('❌ Error forwarding to thread:', error);
    return { success: false, error: error.message };
  }
}

async function updateEscalationEmbed(data) {
  const { escalation_id, message_id, channel_id, agent_name, action } = data;

  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const channel = await guild.channels.fetch(channel_id);
    const message = await channel.messages.fetch(message_id);
    if (!message) return { success: false, error: 'Message not found' };

    const existingEmbed = message.embeds[0];
    if (!existingEmbed) return { success: false, error: 'No embed found' };

    const newEmbed = EmbedBuilder.from(existingEmbed);

    if (action === 'claimed') {
      newEmbed.setTitle(`🎫 Escalation [CLAIMED]`).setColor('#3498DB');
      newEmbed.addFields(
        { name: 'Assigned To', value: agent_name || 'Unknown', inline: true },
        { name: 'Claimed At', value: new Date().toLocaleTimeString(), inline: true }
      );

      const newButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`resolve_escalation_${escalation_id}`).setLabel('✅ Resolve').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`return_to_ai_${escalation_id}`).setLabel('🤖 Return to AI').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`open_thread_${escalation_id}`).setLabel('💬 Open Thread').setStyle(ButtonStyle.Primary)
      );
      await message.edit({ embeds: [newEmbed], components: [newButtons] });
    } else if (action === 'resolved' || action === 'returned_to_ai') {
      const statusText = action === 'resolved' ? 'RESOLVED' : 'RETURNED TO AI';
      const statusColor = action === 'resolved' ? '#2ECC71' : '#9B59B6';
      newEmbed.setTitle(`🎫 Escalation [${statusText}]`).setColor(statusColor);
      newEmbed.addFields({ name: 'Resolved By', value: agent_name || 'Unknown', inline: true });
      await message.edit({ embeds: [newEmbed], components: [] });
    }

    console.log(`📝 Updated escalation embed: ${action}`);
    return { success: true };
  } catch (error) {
    console.error('❌ Error updating embed:', error);
    return { success: false, error: error.message };
  }
}

async function createEscalationThread(escalationId, message, userName, platform) {
  try {
    const threadName = `🎫 ${platform} - ${userName}`.substring(0, 100);
    const thread = await message.startThread({ name: threadName, autoArchiveDuration: 1440 });
    escalationThreads.set(thread.id, escalationId);

    await thread.send({
      embeds: [new EmbedBuilder()
        .setColor('#3498DB')
        .setTitle('📜 Escalation Thread Started')
        .setDescription('Messages you send here will be forwarded to the user.\nUser replies will appear in this thread.')
        .setFooter({ text: `Escalation ID: ${escalationId}` })]
    });

    console.log(`🧵 Created thread ${thread.id} for escalation ${escalationId}`);
    return thread;
  } catch (error) {
    console.error('❌ Error creating thread:', error);
    return null;
  }
}

async function handleClaimEscalation(interaction, escalationId) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const response = await fetch(`${N8N_ESCALATION_URL}/escalation-update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        escalation_id: escalationId,
        action: 'claim',
        agent_discord_id: interaction.user.id,
        agent_name: interaction.user.tag,
        claimed_via: 'discord'
      })
    });

    const result = await response.json();
    if (!result.success) {
      await interaction.editReply({ content: `❌ Failed to claim: ${result.error || 'Unknown error'}` });
      return;
    }

    const message = interaction.message;
    const existingEmbed = message.embeds[0];
    const platform = existingEmbed.fields?.find(f => f.name === 'Platform')?.value || 'Unknown';
    const userName = existingEmbed.fields?.find(f => f.name === 'User')?.value || 'Unknown';
    const thread = await createEscalationThread(escalationId, message, userName, platform);
    // Save thread ID to database
    if (thread) {
      try {
        await fetch(`${N8N_ESCALATION_URL}/escalation-update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            escalation_id: escalationId,
            action: 'save_thread',
            discord_thread_id: thread.id
          })
        });
      } catch (e) {
        console.error('Failed to save thread ID:', e.message);
      }
    }
    const newEmbed = EmbedBuilder.from(existingEmbed);
    newEmbed.setTitle('🎫 Escalation [CLAIMED]').setColor('#3498DB');
    newEmbed.addFields(
      { name: 'Assigned To', value: interaction.user.tag, inline: true },
      { name: 'Claimed At', value: new Date().toLocaleTimeString(), inline: true }
    );

    const newButtons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`resolve_escalation_${escalationId}`).setLabel('✅ Resolve').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`return_to_ai_${escalationId}`).setLabel('🤖 Return to AI').setStyle(ButtonStyle.Secondary)
    );

    await message.edit({ embeds: [newEmbed], components: [newButtons] });
    await interaction.editReply({ content: `✅ Claimed! ${thread ? `Thread created: <#${thread.id}>` : 'Reply in the thread to respond.'}` });
    console.log(`✅ ${interaction.user.tag} claimed escalation ${escalationId}`);
  } catch (error) {
    console.error('❌ Claim error:', error);
    await interaction.editReply({ content: `❌ Error: ${error.message}` });
  }
}

async function handleResolveEscalation(interaction, escalationId) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const response = await fetch(`${N8N_ESCALATION_URL}/escalation-update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        escalation_id: escalationId,
        action: 'resolve',
        agent_discord_id: interaction.user.id,
        agent_name: interaction.user.tag,
        resolution_type: 'resolved'
      })
    });

    const result = await response.json();
    if (!result.success) {
      await interaction.editReply({ content: `❌ Failed: ${result.error}` });
      return;
    }

    const message = interaction.message;
    const newEmbed = EmbedBuilder.from(message.embeds[0]);
    newEmbed.setTitle('🎫 Escalation [RESOLVED]').setColor('#2ECC71');
    newEmbed.addFields({ name: 'Resolved By', value: interaction.user.tag, inline: true });

    await message.edit({ embeds: [newEmbed], components: [] });

    for (const [threadId, escId] of escalationThreads.entries()) {
      if (escId === escalationId) { escalationThreads.delete(threadId); break; }
    }

    await interaction.editReply({ content: '✅ Escalation resolved!' });
    console.log(`✅ ${interaction.user.tag} resolved escalation ${escalationId}`);
  } catch (error) {
    console.error('❌ Resolve error:', error);
    await interaction.editReply({ content: `❌ Error: ${error.message}` });
  }
}

async function handleReturnToAI(interaction, escalationId) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const response = await fetch(`${N8N_ESCALATION_URL}/escalation-update`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        escalation_id: escalationId,
        action: 'return_to_ai',
        agent_discord_id: interaction.user.id,
        agent_name: interaction.user.tag
      })
    });

    const result = await response.json();
    if (!result.success) {
      await interaction.editReply({ content: `❌ Failed: ${result.error}` });
      return;
    }

    const message = interaction.message;
    const newEmbed = EmbedBuilder.from(message.embeds[0]);
    newEmbed.setTitle('🎫 Escalation [RETURNED TO AI]').setColor('#9B59B6');
    newEmbed.addFields({ name: 'Returned By', value: interaction.user.tag, inline: true });

    await message.edit({ embeds: [newEmbed], components: [] });

    for (const [threadId, escId] of escalationThreads.entries()) {
      if (escId === escalationId) { escalationThreads.delete(threadId); break; }
    }

    await interaction.editReply({ content: '✅ Returned to AI. The chatbot will handle future messages.' });
    console.log(`🤖 ${interaction.user.tag} returned escalation ${escalationId} to AI`);
  } catch (error) {
    console.error('❌ Return to AI error:', error);
    await interaction.editReply({ content: `❌ Error: ${error.message}` });
  }
}

async function handleViewHistory(interaction, escalationId) {
  await interaction.deferReply({ ephemeral: true });
  await interaction.editReply({
    content: `📜 Conversation history for escalation \`${escalationId}\`\n\n*Full history view coming soon. Claim the ticket to see messages in the thread.*`
  });
}

async function forwardAgentMessage(message, escalationId) {
  try {
    const response = await fetch(`${N8N_ESCALATION_URL}/agent-reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        escalation_id: escalationId,
        agent_discord_id: message.author.id,
        agent_name: message.author.tag,
        message: message.content,
        reply_via: 'discord'
      })
    });

    const result = await response.json();
    if (result.success) {
      await message.react('✅');
    } else {
      await message.react('❌');
      await message.reply({ content: `⚠️ Failed to send: ${result.error}`, allowedMentions: { repliedUser: false } });
    }
  } catch (error) {
    console.error('❌ Forward agent message error:', error);
    await message.react('❌');
  }
}

// ============================================
// N8N CHATBOT FUNCTIONS
// ============================================
async function sendToN8nChatbot(message, isDM = false) {
  if (!N8N_WEBHOOK_URL) return { success: false, error: 'Chatbot not configured' };

  const cooldownKey = message.author.id;
  const lastMessage = chatbotCooldown.get(cooldownKey);
  if (lastMessage && Date.now() - lastMessage < CHATBOT_COOLDOWN_MS) {
    return { success: false, error: 'cooldown' };
  }
  chatbotCooldown.set(cooldownKey, Date.now());

  let userMessage = message.content;
  if (!isDM && client.user) {
    userMessage = userMessage.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
  }

  if (!userMessage) return { success: false, error: 'empty' };

  let isVerified = false;
  if (message.member) {
    isVerified = message.member.roles.cache.some(r => r.name === ROLES.VERIFIED);
  }

  const payload = {
    platform: 'discord',
    user_id: message.author.id,
    sender_id: message.author.id,
    user_name: message.author.username,
    sender_name: message.member?.displayName || message.author.displayName || message.author.username,
    channel_id: isDM ? `dm_${message.author.id}` : message.channel.id,
    message: userMessage,
    content: userMessage,
    text: userMessage,
    is_dm: isDM,
    is_verified: isVerified,
  };

  try {
    const response = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ n8n webhook error: ${response.status} - ${errorText}`);
      return { success: false, error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    return {
      success: data.success || true,
      response: data.response || data.text || data.message,
      conversationId: data.conversation_id,
      detectedLanguage: data.detected_language,
    };
  } catch (error) {
    console.error('❌ n8n chatbot error:', error.message);
    return { success: false, error: error.message };
  }
}

function shouldTriggerChatbot(message) {
  if (message.channel.type === ChannelType.DM) return true;
  if (message.mentions.has(client.user)) return true;
  if (CHATBOT_CHANNEL_ID && message.channel.id === CHATBOT_CHANNEL_ID) return true;
  if (message.channel.name === CHANNELS.ASK_LUMI) return true;
  return false;
}

async function handleChatbotMessage(message) {
  const isDM = message.channel.type === ChannelType.DM;
  
  try { await message.channel.sendTyping(); } catch (e) {}

  const result = await sendToN8nChatbot(message, isDM);

  if (!result.success) {
    if (result.error === 'cooldown') return;
    if (result.error === 'empty') {
      await message.reply({ content: '🦊 Hey! Did you have a question? Just ask me anything about Lumist!', allowedMentions: { repliedUser: false } });
      return;
    }
    await message.reply({ content: '🦊 Oops! I had a little hiccup. Try again in a moment!', allowedMentions: { repliedUser: false } });
    return;
  }

  const responseText = result.response || "I'm not sure how to answer that!";
  const chunks = splitMessage(responseText, 1900);
  
  for (let i = 0; i < chunks.length; i++) {
    if (i === 0) {
      await message.reply({ content: chunks[i], allowedMentions: { repliedUser: false } });
    } else {
      await message.channel.send(chunks[i]);
    }
  }

  console.log(`💬 Chatbot replied to ${message.author.tag}${isDM ? ' (DM)' : ''}`);
}

function splitMessage(text, maxLength) {
  if (text.length <= maxLength) return [text];
  
  const chunks = [];
  let remaining = text;
  
  while (remaining.length > 0) {
    if (remaining.length <= maxLength) { chunks.push(remaining); break; }
    
    let splitIndex = remaining.lastIndexOf('. ', maxLength);
    if (splitIndex === -1 || splitIndex < maxLength / 2) splitIndex = remaining.lastIndexOf('\n', maxLength);
    if (splitIndex === -1 || splitIndex < maxLength / 2) splitIndex = remaining.lastIndexOf(' ', maxLength);
    if (splitIndex === -1) splitIndex = maxLength;
    
    chunks.push(remaining.substring(0, splitIndex + 1));
    remaining = remaining.substring(splitIndex + 1);
  }
  
  return chunks;
}

// ============================================
// SUPABASE ANALYTICS
// ============================================
async function supabaseInsert(table, data) {
  if (!SUPABASE_SERVICE_KEY) return null;
  
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Profile': 'social_analytics',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(data),
    });
    
    if (!response.ok) {
      const error = await response.text();
      console.error(`❌ Supabase insert error (${table}):`, error);
      return null;
    }
    return true;
  } catch (error) {
    console.error(`❌ Supabase request failed (${table}):`, error.message);
    return null;
  }
}

async function logMemberEvent(eventType, member, metadata = {}) {
  await supabaseInsert('discord_member_events', {
    event_type: eventType,
    discord_user_id: member.user?.id || member.id,
    discord_username: member.user?.tag || member.tag || 'Unknown',
    metadata,
  });
  console.log(`📊 Event logged: ${eventType} - ${member.user?.tag || member.tag}`);
}

async function collectServerStats() {
  if (!SUPABASE_SERVICE_KEY) return;
  
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const members = await guild.members.fetch();
    const roles = await guild.roles.fetch();
    
    const memberRole = roles.find(r => r.name === ROLES.MEMBER);
    const verifiedRole = roles.find(r => r.name === ROLES.VERIFIED);
    const premiumRole = roles.find(r => r.name === ROLES.PREMIUM);
    const alumniRole = roles.find(r => r.name === ROLES.ALUMNI);
    
    const totalMembers = members.filter(m => !m.user.bot).size;
    const onlineMembers = members.filter(m => !m.user.bot && m.presence?.status !== 'offline').size;
    const botCount = members.filter(m => m.user.bot).size;
    const memberRoleCount = memberRole ? members.filter(m => m.roles.cache.has(memberRole.id)).size : 0;
    const verifiedCount = verifiedRole ? members.filter(m => m.roles.cache.has(verifiedRole.id)).size : 0;
    const premiumCount = premiumRole ? members.filter(m => m.roles.cache.has(premiumRole.id)).size : 0;
    const alumniCount = alumniRole ? members.filter(m => m.roles.cache.has(alumniRole.id)).size : 0;
    
    await supabaseInsert('discord_server_stats', {
      total_members: totalMembers,
      online_members: onlineMembers,
      member_role_count: memberRoleCount,
      verified_count: verifiedCount,
      premium_count: premiumCount,
      alumni_count: alumniCount,
      bot_count: botCount,
    });
    
    const timestamp = new Date().toISOString();
    
    for (const [roleName, nationalityKey] of Object.entries(NATIONALITY_MAP)) {
      const role = roles.find(r => r.name === roleName);
      if (role) {
        const count = members.filter(m => m.roles.cache.has(role.id)).size;
        if (count > 0) {
          await supabaseInsert('discord_nationality_stats', { recorded_at: timestamp, nationality: nationalityKey, member_count: count });
        }
      }
    }
    
    for (const [roleName, gradeKey] of Object.entries(GRADE_MAP)) {
      const role = roles.find(r => r.name === roleName);
      if (role) {
        const count = members.filter(m => m.roles.cache.has(role.id)).size;
        if (count > 0) {
          await supabaseInsert('discord_grade_stats', { recorded_at: timestamp, grade: gradeKey, member_count: count });
        }
      }
    }
    
    await supabaseInsert('discord_funnel_stats', {
      recorded_at: timestamp,
      total_joined: totalMembers,
      completed_onboarding: memberRoleCount,
      verified: verifiedCount,
      premium: premiumCount,
    });
    
    const channels = await guild.channels.fetch();
    for (const [channelId, stats] of channelMessageCounts.entries()) {
      const channel = channels.get(channelId);
      if (channel && stats.count > 0) {
        await supabaseInsert('discord_channel_activity', {
          recorded_at: timestamp,
          channel_id: channelId,
          channel_name: channel.name,
          category_name: channel.parent?.name || 'Uncategorized',
          message_count: stats.count,
          unique_users: stats.users.size,
        });
      }
    }
    
    channelMessageCounts.clear();
    console.log(`📊 Analytics snapshot sent - ${totalMembers} members, ${onlineMembers} online`);
  } catch (error) {
    console.error('❌ Error collecting server stats:', error);
  }
}

function trackMessage(message) {
  if (message.author.bot || !message.guild) return;
  const channelId = message.channel.id;
  if (!channelMessageCounts.has(channelId)) {
    channelMessageCounts.set(channelId, { count: 0, users: new Set() });
  }
  const stats = channelMessageCounts.get(channelId);
  stats.count++;
  stats.users.add(message.author.id);
}

// ============================================
// SLASH COMMANDS
// ============================================
const commands = [
  new SlashCommandBuilder().setName('warn').setDescription('Issue a warning').addUserOption(o => o.setName('user').setDescription('User').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName('mute').setDescription('Mute a user').addUserOption(o => o.setName('user').setDescription('User').setRequired(true)).addIntegerOption(o => o.setName('duration').setDescription('Minutes').setRequired(true).setMinValue(1).setMaxValue(40320)).addStringOption(o => o.setName('reason').setDescription('Reason')).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName('unmute').setDescription('Unmute a user').addUserOption(o => o.setName('user').setDescription('User').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName('kick').setDescription('Kick a user').addUserOption(o => o.setName('user').setDescription('User').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('Reason')).setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
  new SlashCommandBuilder().setName('ban').setDescription('Ban a user').addUserOption(o => o.setName('user').setDescription('User').setRequired(true)).addStringOption(o => o.setName('reason').setDescription('Reason')).addIntegerOption(o => o.setName('days').setDescription('Delete days (0-7)').setMinValue(0).setMaxValue(7)).setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  new SlashCommandBuilder().setName('warnings').setDescription('Check warnings').addUserOption(o => o.setName('user').setDescription('User').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName('clearwarnings').setDescription('Clear warnings').addUserOption(o => o.setName('user').setDescription('User').setRequired(true)).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('purge').setDescription('Delete messages').addIntegerOption(o => o.setName('amount').setDescription('Amount (1-100)').setRequired(true).setMinValue(1).setMaxValue(100)).addUserOption(o => o.setName('user').setDescription('Filter by user')).setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  new SlashCommandBuilder().setName('ticket').setDescription('Create a support ticket'),
  new SlashCommandBuilder().setName('close').setDescription('Close ticket').setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder().setName('setuptickets').setDescription('Setup ticket system').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('stats').setDescription('Server stats').setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('ask').setDescription('Ask Lumi a question').addStringOption(o => o.setName('question').setDescription('Your question').setRequired(true)),
  new SlashCommandBuilder().setName('setupverify').setDescription('Setup verification forum channel with pinned posts').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('setupcollegeforums').setDescription('Setup US and Vietnam college application forum channels').setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder().setName('addcollege').setDescription('Add a new college post to a college forum').addStringOption(o => o.setName('forum').setDescription('Which forum').setRequired(true).addChoices({ name: 'US College Apps', value: 'us' }, { name: 'Vietnam College Apps', value: 'vn' })).addStringOption(o => o.setName('name').setDescription('College name (e.g., Stanford University)').setRequired(true)).addStringOption(o => o.setName('deadline').setDescription('Application deadline (e.g., Jan 1, 2026)')).addStringOption(o => o.setName('avg_sat').setDescription('Average SAT score (e.g., 1500-1570)')).addStringOption(o => o.setName('avg_gpa').setDescription('Average GPA (e.g., 3.9-4.0)')).addStringOption(o => o.setName('link').setDescription('Link to application requirements')).setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  new SlashCommandBuilder().setName('populatevncolleges').setDescription('Bulk add Vietnam universities that accept SAT to the VN forum').addBooleanOption(o => o.setName('clear').setDescription('Delete all existing posts first before populating')).setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
].map(c => c.toJSON());

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
  try {
    console.log('📝 Registering slash commands...');
    await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), { body: commands });
    console.log('✅ Slash commands registered!');
  } catch (error) {
    console.error('❌ Error registering commands:', error);
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================
async function findRole(guild, roleName) {
  const roles = await guild.roles.fetch();
  return roles.find(r => r.name === roleName);
}

async function findChannel(guild, channelName) {
  const channels = await guild.channels.fetch();
  return channels.find(c => c.name === channelName);
}

function isStaff(member) {
  return member.permissions.has(PermissionFlagsBits.ManageMessages) || member.permissions.has(PermissionFlagsBits.Administrator);
}


// ============================================
// MOD LOGGING & WARNINGS
// ============================================
async function logModAction(guild, action, target, moderator, reason, color = '#E74C3C') {
  const modLogChannel = await findChannel(guild, CHANNELS.MOD_LOGS);
  if (!modLogChannel) return;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`🛡️ ${action}`)
    .addFields(
      { name: 'User', value: `${target} (${target.id})`, inline: true },
      { name: 'Moderator', value: `${moderator}`, inline: true },
      { name: 'Reason', value: reason || 'No reason provided' }
    )
    .setTimestamp()
    .setFooter({ text: `User ID: ${target.id}` });

  await modLogChannel.send({ embeds: [embed] });
}

function getWarnings(userId) {
  const warnings = userWarnings.get(userId) || [];
  const now = Date.now();
  const validWarnings = warnings.filter(w => now - w.timestamp < AUTOMOD_CONFIG.warnings.expireDays * 24 * 60 * 60 * 1000);
  userWarnings.set(userId, validWarnings);
  return validWarnings;
}

function addWarning(userId, reason, moderator = 'Auto-Mod') {
  const warnings = userWarnings.get(userId) || [];
  warnings.push({ timestamp: Date.now(), reason, moderator });
  userWarnings.set(userId, warnings);
  return warnings.length;
}

function clearWarnings(userId) { userWarnings.delete(userId); }

async function executeWarningAction(member, warningCount, reason, guild) {
  const action = AUTOMOD_CONFIG.warnings.escalation[warningCount] || 'warn';
  
  try {
    switch (action) {
      case 'warn':
        await member.send(`⚠️ **Warning from Lumist.ai Server**\nReason: ${reason}\n\nThis is warning #${warningCount}.`).catch(() => {});
        await logModAction(guild, 'Warning Issued', member.user, 'Auto-Mod', `${reason} (Warning #${warningCount})`, '#FFA500');
        break;
      case 'mute_1h':
        await member.timeout(60 * 60 * 1000, reason);
        await logModAction(guild, 'Muted (1 hour)', member.user, 'Auto-Mod', `${reason} (Warning #${warningCount})`, '#E67E22');
        break;
      case 'mute_24h':
        await member.timeout(24 * 60 * 60 * 1000, reason);
        await logModAction(guild, 'Muted (24 hours)', member.user, 'Auto-Mod', `${reason} (Warning #${warningCount})`, '#E74C3C');
        break;
      case 'ban_7d':
        await member.ban({ deleteMessageSeconds: 86400, reason });
        await logModAction(guild, 'Banned (7 days)', member.user, 'Auto-Mod', `${reason} (Warning #${warningCount})`, '#992D22');
        break;
      case 'ban_permanent':
        await member.ban({ deleteMessageSeconds: 86400, reason });
        await logModAction(guild, 'Banned (Permanent)', member.user, 'Auto-Mod', `${reason} (Warning #${warningCount})`, '#1a1a1a');
        break;
    }
  } catch (error) {
    console.error(`❌ Error executing warning action: ${error.message}`);
  }
}

// ============================================
// AUTO-MOD CHECKS
// ============================================
function checkSpam(message) {
  if (!AUTOMOD_CONFIG.spam.enabled) return false;
  const userId = message.author.id;
  const now = Date.now();
  const history = messageHistory.get(userId) || [];
  history.push(now);
  const recentMessages = history.filter(t => now - t < AUTOMOD_CONFIG.spam.timeWindow);
  messageHistory.set(userId, recentMessages);
  return recentMessages.length > AUTOMOD_CONFIG.spam.maxMessages;
}

function checkDuplicates(message) {
  if (!AUTOMOD_CONFIG.duplicates.enabled) return false;
  const userId = message.author.id;
  const content = message.content.toLowerCase().trim();
  const now = Date.now();
  if (content.length < 5) return false;
  const history = duplicateHistory.get(userId) || [];
  history.push({ content, timestamp: now });
  const recentMessages = history.filter(m => now - m.timestamp < AUTOMOD_CONFIG.duplicates.timeWindow);
  duplicateHistory.set(userId, recentMessages);
  return recentMessages.filter(m => m.content === content).length >= AUTOMOD_CONFIG.duplicates.maxDuplicates;
}

function checkMentionSpam(message) {
  if (!AUTOMOD_CONFIG.mentions.enabled) return false;
  return (message.mentions.users.size + message.mentions.roles.size) > AUTOMOD_CONFIG.mentions.maxMentions;
}

function checkBannedWords(message) {
  if (!AUTOMOD_CONFIG.bannedWords.enabled) return false;
  const content = message.content.toLowerCase();
  for (const word of AUTOMOD_CONFIG.bannedWords.words) {
    if (content.includes(word.toLowerCase())) return true;
  }
  for (const pattern of AUTOMOD_CONFIG.bannedWords.patterns) {
    if (pattern.test(content)) return true;
  }
  return false;
}

function checkLinks(message) {
  if (!AUTOMOD_CONFIG.links.enabled) return false;
  const urlRegex = /https?:\/\/([^\s<]+)/gi;
  const matches = message.content.match(urlRegex);
  if (!matches) return false;
  for (const url of matches) {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      const isAllowed = AUTOMOD_CONFIG.links.allowedDomains.some(domain => hostname === domain || hostname.endsWith('.' + domain));
      if (!isAllowed) return true;
    } catch { return true; }
  }
  return false;
}

function checkForRaid() {
  if (!AUTOMOD_CONFIG.raid.enabled) return false;
  const now = Date.now();
  const recentJoins = joinHistory.filter(t => now - t < AUTOMOD_CONFIG.raid.timeWindow);
  return recentJoins.length >= AUTOMOD_CONFIG.raid.joinThreshold;
}

async function enableRaidMode(guild) {
  if (isRaidMode) return;
  isRaidMode = true;
  console.log('🚨 RAID MODE ENABLED');
  
  const modLogChannel = await findChannel(guild, CHANNELS.MOD_LOGS);
  if (modLogChannel) {
    await modLogChannel.send({ embeds: [new EmbedBuilder().setColor('#FF0000').setTitle('🚨 RAID DETECTED - LOCKDOWN ENABLED').setTimestamp()] });
  }
  
  setTimeout(() => { isRaidMode = false; console.log('✅ Raid mode disabled'); }, AUTOMOD_CONFIG.raid.lockdownMinutes * 60 * 1000);
}

// ============================================
// TICKET SYSTEM
// ============================================
function createTicketEmbed() {
  const embed = new EmbedBuilder()
    .setColor('#3498DB')
    .setTitle('🎫 Support Tickets')
    .setDescription('Need help? Create a support ticket!\n\n**Categories:**\n• 💬 General Support\n• 🐛 Bug Report\n• 🎓 Alumni Verification');

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('create_ticket').setLabel('🎫 Create Ticket').setStyle(ButtonStyle.Primary)
  )] };
}

function createTicketCategorySelect() {
  return {
    embeds: [new EmbedBuilder().setColor('#3498DB').setTitle('Select Ticket Category')],
    components: [new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder().setCustomId('ticket_category').setPlaceholder('Select a category').addOptions([
        { label: 'General Support', value: 'general', emoji: '💬' },
        { label: 'Bug Report', value: 'bug', emoji: '🐛' },
        { label: 'Alumni Verification', value: 'alumni', emoji: '🎓' },
      ])
    )],
    ephemeral: true
  };
}

async function createTicketChannel(guild, user, category) {
  if (activeTickets.has(user.id)) return { error: `You already have an open ticket: <#${activeTickets.get(user.id)}>` };

  const categoryName = { general: 'General Support', bug: 'Bug Report', alumni: 'Alumni Verification' };
  const ticketNumber = Date.now().toString(36).slice(-4).toUpperCase();
  const channelName = `ticket-${ticketNumber}-${user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '');

  try {
    const modRole = await findRole(guild, ROLES.MODERATOR);
    const adminRole = await findRole(guild, ROLES.ADMIN);
    const founderRole = await findRole(guild, ROLES.FOUNDER);

    const ticketChannel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      topic: `Ticket by ${user.tag} | Category: ${categoryName[category]}`,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
        { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
        ...(modRole ? [{ id: modRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] : []),
        ...(adminRole ? [{ id: adminRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] : []),
        ...(founderRole ? [{ id: founderRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }] : []),
      ],
    });

    activeTickets.set(user.id, ticketChannel.id);

    await ticketChannel.send({
      content: `${user} | ${modRole ? `<@&${modRole.id}>` : 'Staff'}`,
      embeds: [new EmbedBuilder().setColor('#3498DB').setTitle(`${categoryName[category]} Ticket`).setDescription(`Hello ${user}!\n\n**Ticket ID:** \`${ticketNumber}\`\n\nPlease describe your issue.`)],
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('close_ticket').setLabel('🔒 Close Ticket').setStyle(ButtonStyle.Danger))]
    });

    return { channel: ticketChannel };
  } catch (error) {
    console.error('❌ Error creating ticket:', error);
    return { error: 'Failed to create ticket.' };
  }
}

async function closeTicket(channel) {
  try {
    for (const [userId, channelId] of activeTickets.entries()) {
      if (channelId === channel.id) { activeTickets.delete(userId); break; }
    }
    await channel.delete('Ticket closed');
  } catch (error) {
    console.error('❌ Error closing ticket:', error);
  }
}


// ============================================
// EVENTS
// ============================================
client.once(Events.ClientReady, async () => {
  console.log('═══════════════════════════════════════════════════════');
  console.log(`🦊 Lumi Bot v4.5 is online!`);
  console.log(`   Logged in as: ${client.user.tag}`);
  console.log(`   Serving guild: ${GUILD_ID}`);
  console.log(`   Analytics: ${SUPABASE_SERVICE_KEY ? 'ENABLED' : 'DISABLED'}`);
  console.log(`   Chatbot: ${N8N_WEBHOOK_URL ? 'ENABLED' : 'DISABLED'}`);
  console.log(`   Escalation: ENABLED`);
  console.log(`   Onboarding: Native Discord (Server Settings)`);
  console.log(`   Started at: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════');

  await registerCommands();

  if (SUPABASE_SERVICE_KEY) {
    console.log(`📊 Starting analytics collection (every ${ANALYTICS_INTERVAL / 1000}s)...`);
    setTimeout(() => collectServerStats(), 5000);
    setInterval(collectServerStats, ANALYTICS_INTERVAL);
  }

  console.log('\n📋 Active features:\n   • Native Discord Onboarding\n   • Auto-moderation\n   • Slash commands\n   • Ticket system\n   • Analytics pipeline');
  if (N8N_WEBHOOK_URL) console.log('   • AI Chatbot (n8n)');
  console.log('   • Escalation system\n');
});

client.on(Events.GuildMemberAdd, async (member) => {
  console.log(`👋 New member joined: ${member.user.tag}`);
  await logMemberEvent('join', member);

  // Raid protection
  joinHistory.push(Date.now());
  const now = Date.now();
  while (joinHistory.length > 0 && now - joinHistory[0] > AUTOMOD_CONFIG.raid.timeWindow) joinHistory.shift();

  if (checkForRaid()) await enableRaidMode(member.guild);

  if (isRaidMode) {
    await member.send('⚠️ Server is in lockdown mode. Try again later.').catch(() => {});
    await member.kick('Raid protection');
    return;
  }

  // Native Discord onboarding handles the rest - no DM needed
  console.log(`   📋 ${member.user.tag} will complete native Discord onboarding`);
});

client.on(Events.GuildMemberRemove, async (member) => {
  console.log(`👋 Member left: ${member.user.tag}`);
  const hadMemberRole = member.roles.cache.some(r => r.name === ROLES.MEMBER);
  await logMemberEvent('leave', member, { had_member_role: hadMemberRole, roles: member.roles.cache.map(r => r.name) });
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  
  // Check escalation thread
  if (message.channel.isThread && message.channel.isThread() && escalationThreads.has(message.channel.id)) {
    if (!message.content.startsWith('/')) {
      const escalationId = escalationThreads.get(message.channel.id);
      await forwardAgentMessage(message, escalationId);
    }
    return;
  }
  
  if (message.guild) trackMessage(message);
  
  if (shouldTriggerChatbot(message)) {
    await handleChatbotMessage(message);
    return;
  }
  
  if (!message.guild) return;
  if (isStaff(message.member)) return;
  
  let violation = null, reason = null;
  
  if (checkBannedWords(message)) { violation = 'banned_words'; reason = 'Prohibited language'; }
  else if (checkLinks(message)) { violation = 'unapproved_link'; reason = 'Unapproved links'; }
  else if (checkMentionSpam(message)) { violation = 'mention_spam'; reason = 'Mention spam'; }
  else if (checkSpam(message)) { violation = 'spam'; reason = 'Message spam'; }
  else if (checkDuplicates(message)) { violation = 'duplicate'; reason = 'Duplicate messages'; }
  
  if (violation) {
    try {
      await message.delete();
      const warningCount = addWarning(message.author.id, reason);
      await executeWarningAction(message.member, warningCount, reason, message.guild);
      const feedback = await message.channel.send({ content: `⚠️ ${message.author}, message removed: **${reason}**` });
      setTimeout(() => feedback.delete().catch(() => {}), 5000);
    } catch (error) {
      console.error(`❌ Auto-mod error: ${error.message}`);
    }
  }
});

client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  const oldRoles = oldMember.roles.cache;
  const newRoles = newMember.roles.cache;

  // Detect when Member role is added (onboarding complete)
  if (newRoles.find(r => r.name === ROLES.MEMBER) && !oldRoles.some(r => r.name === ROLES.MEMBER)) {
    await logMemberEvent('onboarding_complete', newMember);
    console.log(`🎉 ${newMember.user.tag} completed onboarding!`);

    // Post welcome message to #introductions
    const introChannel = await findChannel(newMember.guild, CHANNELS.INTRODUCTIONS);
    if (introChannel) {
      await introChannel.send({
        embeds: [new EmbedBuilder()
          .setColor('#2ECC71')
          .setTitle(`Welcome to Lumist.ai!`)
          .setDescription(`Hey ${newMember}! We're excited to have you here.\n\n` +
            `**Quick Links:**\n` +
            `• Check out the <#${(await findChannel(newMember.guild, CHANNELS.RULES))?.id || 'rules'}> channel\n` +
            `• Get verified in <#${(await findChannel(newMember.guild, 'verify'))?.id || 'verify'}>\n` +
            `• Ask questions in <#${(await findChannel(newMember.guild, CHANNELS.ASK_LUMI))?.id || 'ask-lumi'}>\n\n` +
            `Tell us about yourself! What grade are you in and what SAT score are you aiming for?`)
          .setThumbnail(newMember.user.displayAvatarURL({ dynamic: true }))
          .setTimestamp()
        ]
      });
    }
  }

  if (newRoles.find(r => r.name === ROLES.VERIFIED) && !oldRoles.some(r => r.name === ROLES.VERIFIED)) {
    await logMemberEvent('verified', newMember);
    console.log(`✅ ${newMember.user.tag} is now verified`);
  }

  if (newRoles.find(r => r.name === ROLES.PREMIUM) && !oldRoles.some(r => r.name === ROLES.PREMIUM)) {
    await logMemberEvent('premium_added', newMember);
    console.log(`💎 ${newMember.user.tag} is now premium`);
  }

  if (!newRoles.find(r => r.name === ROLES.PREMIUM) && oldRoles.some(r => r.name === ROLES.PREMIUM)) {
    await logMemberEvent('premium_removed', newMember);
    console.log(`📉 ${newMember.user.tag} lost premium`);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const { commandName, options } = interaction;
    
    if (commandName === 'ask') {
      if (!N8N_WEBHOOK_URL) return interaction.reply({ content: '🦊 Sorry, the chatbot is not configured!', ephemeral: true });
      const question = options.getString('question');
      await interaction.deferReply();
      const fakeMessage = { content: question, author: interaction.user, member: interaction.member, channel: interaction.channel };
      const result = await sendToN8nChatbot(fakeMessage, false);
      if (!result.success) { await interaction.editReply('🦊 Oops! Try again in a moment!'); return; }
      const chunks = splitMessage(result.response || "I'm not sure!", 1900);
      await interaction.editReply(chunks[0]);
      for (let i = 1; i < chunks.length; i++) await interaction.followUp(chunks[i]);
      console.log(`💬 /ask used by ${interaction.user.tag}`);
      return;
    }
    
    if (commandName === 'warn') {
      const user = options.getUser('user'), reason = options.getString('reason');
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) return interaction.reply({ content: '❌ User not found.', ephemeral: true });
      const count = addWarning(user.id, reason, interaction.user.tag);
      await logModAction(interaction.guild, 'Warning Issued', user, interaction.user, `${reason} (Warning #${count})`, '#FFA500');
      await member.send(`⚠️ **Warning**\nReason: ${reason}\nThis is warning #${count}.`).catch(() => {});
      await interaction.reply({ content: `✅ Warned **${user.tag}** (#${count})`, ephemeral: true });
    }
    
    if (commandName === 'mute') {
      const user = options.getUser('user'), duration = options.getInteger('duration'), reason = options.getString('reason') || 'No reason';
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) return interaction.reply({ content: '❌ User not found.', ephemeral: true });
      try {
        await member.timeout(duration * 60 * 1000, reason);
        await logModAction(interaction.guild, `Muted (${duration} min)`, user, interaction.user, reason, '#E67E22');
        await interaction.reply({ content: `✅ Muted **${user.tag}** for ${duration} min.`, ephemeral: true });
      } catch (e) { await interaction.reply({ content: `❌ Failed: ${e.message}`, ephemeral: true }); }
    }
    
    if (commandName === 'unmute') {
      const user = options.getUser('user');
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) return interaction.reply({ content: '❌ User not found.', ephemeral: true });
      try {
        await member.timeout(null);
        await logModAction(interaction.guild, 'Unmuted', user, interaction.user, 'Manual', '#2ECC71');
        await interaction.reply({ content: `✅ Unmuted **${user.tag}**.`, ephemeral: true });
      } catch (e) { await interaction.reply({ content: `❌ Failed: ${e.message}`, ephemeral: true }); }
    }
    
    if (commandName === 'kick') {
      const user = options.getUser('user'), reason = options.getString('reason') || 'No reason';
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) return interaction.reply({ content: '❌ User not found.', ephemeral: true });
      try {
        await member.kick(reason);
        await logModAction(interaction.guild, 'Kicked', user, interaction.user, reason, '#E74C3C');
        await interaction.reply({ content: `✅ Kicked **${user.tag}**.`, ephemeral: true });
      } catch (e) { await interaction.reply({ content: `❌ Failed: ${e.message}`, ephemeral: true }); }
    }
    
    if (commandName === 'ban') {
      const user = options.getUser('user'), reason = options.getString('reason') || 'No reason', days = options.getInteger('days') || 0;
      try {
        await interaction.guild.members.ban(user.id, { deleteMessageSeconds: days * 86400, reason });
        await logModAction(interaction.guild, 'Banned', user, interaction.user, reason, '#992D22');
        await interaction.reply({ content: `✅ Banned **${user.tag}**.`, ephemeral: true });
      } catch (e) { await interaction.reply({ content: `❌ Failed: ${e.message}`, ephemeral: true }); }
    }
    
    if (commandName === 'warnings') {
      const user = options.getUser('user');
      const warnings = getWarnings(user.id);
      if (warnings.length === 0) return interaction.reply({ content: `✅ **${user.tag}** has no warnings.`, ephemeral: true });
      const list = warnings.map((w, i) => `**#${i + 1}** - ${new Date(w.timestamp).toLocaleDateString()}: ${w.reason}`).join('\n');
      await interaction.reply({ embeds: [new EmbedBuilder().setColor('#FFA500').setTitle(`Warnings: ${user.tag}`).setDescription(list)], ephemeral: true });
    }
    
    if (commandName === 'clearwarnings') {
      const user = options.getUser('user');
      clearWarnings(user.id);
      await logModAction(interaction.guild, 'Warnings Cleared', user, interaction.user, 'All cleared', '#2ECC71');
      await interaction.reply({ content: `✅ Cleared warnings for **${user.tag}**.`, ephemeral: true });
    }
    
    if (commandName === 'purge') {
      const amount = options.getInteger('amount'), targetUser = options.getUser('user');
      try {
        let messages = await interaction.channel.messages.fetch({ limit: amount + 1 });
        if (targetUser) messages = messages.filter(m => m.author.id === targetUser.id);
        const deleted = await interaction.channel.bulkDelete(messages.first(amount), true);
        await interaction.reply({ content: `✅ Deleted ${deleted.size} messages.`, ephemeral: true });
      } catch (e) { await interaction.reply({ content: `❌ Failed: ${e.message}`, ephemeral: true }); }
    }
    
    if (commandName === 'ticket') await interaction.reply(createTicketCategorySelect());
    
    if (commandName === 'close') {
      if (!interaction.channel.name.startsWith('ticket-')) return interaction.reply({ content: '❌ Use in ticket channels only.', ephemeral: true });
      await interaction.reply({ content: '🔒 Closing...', ephemeral: true });
      await closeTicket(interaction.channel);
    }
    
    if (commandName === 'setuptickets') {
      await interaction.channel.send(createTicketEmbed());
      await interaction.reply({ content: '✅ Ticket system set up!', ephemeral: true });
    }

    if (commandName === 'setupverify') {
      await interaction.deferReply({ ephemeral: true });

      try {
        const guild = interaction.guild;

        // Find and delete existing verify channel if it exists
        const existingChannel = await findChannel(guild, 'verify');
        if (existingChannel) {
          await existingChannel.delete('Replacing with forum channel');
          console.log('🗑️ Deleted existing #verify channel');
        }

        // Get roles for permissions
        const modRole = await findRole(guild, ROLES.MODERATOR);
        const adminRole = await findRole(guild, ROLES.ADMIN);
        const founderRole = await findRole(guild, ROLES.FOUNDER);

        // Find the WELCOME & INFO category
        const channels = await guild.channels.fetch();
        const welcomeCategory = channels.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes('welcome'));

        // Create forum channel with permissions:
        // - @everyone can view but NOT create posts
        // - Moderators and above CAN create posts
        const forumChannel = await guild.channels.create({
          name: 'verify',
          type: ChannelType.GuildForum,
          topic: 'Link your Lumist.ai account to get verified. Choose a verification type below.',
          parent: welcomeCategory?.id,
          defaultForumLayout: ForumLayoutType.List,
          defaultSortOrder: SortOrderType.CreationDate,
          permissionOverwrites: [
            // @everyone: can view and read, but CANNOT create threads
            {
              id: guild.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
              deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.CreatePrivateThreads, PermissionFlagsBits.SendMessagesInThreads],
            },
            // Bot can do everything
            {
              id: client.user.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageThreads, PermissionFlagsBits.SendMessagesInThreads],
            },
            // Moderators can create and manage
            ...(modRole ? [{
              id: modRole.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.ManageThreads, PermissionFlagsBits.SendMessagesInThreads],
            }] : []),
            // Admins can create and manage
            ...(adminRole ? [{
              id: adminRole.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.ManageThreads, PermissionFlagsBits.SendMessagesInThreads],
            }] : []),
            // Founders can create and manage
            ...(founderRole ? [{
              id: founderRole.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.ManageThreads, PermissionFlagsBits.SendMessagesInThreads],
            }] : []),
          ],
          availableTags: [
            { name: '✅ Lumist.ai', moderated: true },
            { name: '🎓 Alumni', moderated: true },
          ],
        });

        console.log(`📋 Created forum channel: #${forumChannel.name}`);

        // Get tags
        const lumistTag = forumChannel.availableTags.find(t => t.name === '✅ Lumist.ai');
        const alumniTag = forumChannel.availableTags.find(t => t.name === '🎓 Alumni');

        // Create Forum Post 1: Lumist.ai Verification
        const lumistVerifyEmbed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle('✅ Lumist.ai Account Verification')
          .setDescription('Link your Lumist.ai account to unlock exclusive benefits!')
          .addFields(
            { name: '🎁 Benefits', value: '• Get the ✅ Verified badge\n• Display your referral code\n• Appear on leaderboards\n• Premium users get 💎 Premium role automatically' },
            { name: '📝 How to Verify', value: 'Click the button below to start the verification process.\n\n*Don\'t have an account yet? Sign up at [lumist.ai](https://lumist.ai)*' }
          );

        const lumistVerifyRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('verify_lumist')
            .setLabel('Verify Lumist.ai Account')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('✅')
        );

        const lumistThread = await forumChannel.threads.create({
          name: '✅ Lumist.ai Account Verification',
          message: {
            embeds: [lumistVerifyEmbed],
            components: [lumistVerifyRow],
          },
          appliedTags: lumistTag ? [lumistTag.id] : [],
        });

        console.log('📌 Created Lumist.ai verification post');

        // Create Forum Post 2: Alumni Verification
        const alumniVerifyEmbed = new EmbedBuilder()
          .setColor('#F1C40F')
          .setTitle('🎓 Alumni Verification')
          .setDescription('Prove you\'re a college student to earn the Alumni role!')
          .addFields(
            { name: '🎁 Benefits', value: '• Get the 🎓 Alumni role\n• Access to alumni-only channels\n• Mentor high school students\n• Share your college experience' },
            { name: '📝 Requirements', value: '• Must be currently enrolled in college/university\n• Provide proof of enrollment (student ID, acceptance letter, or .edu email)' },
            { name: '📋 How to Apply', value: 'Click the button below to submit your alumni verification request. A moderator will review your application.' }
          );

        const alumniVerifyRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('verify_alumni')
            .setLabel('Apply for Alumni Verification')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('🎓')
        );

        const alumniThread = await forumChannel.threads.create({
          name: '🎓 Alumni Verification',
          message: {
            embeds: [alumniVerifyEmbed],
            components: [alumniVerifyRow],
          },
          appliedTags: alumniTag ? [alumniTag.id] : [],
        });

        console.log('📌 Created Alumni verification post');

        // Pin only the Lumist thread (Discord only allows 1 pinned thread per forum)
        await lumistThread.pin();
        console.log('📌 Pinned Lumist.ai verification post');

        await interaction.editReply({
          content: `✅ **Verification forum set up!**\n\n` +
            `Created forum channel: <#${forumChannel.id}>\n\n` +
            `**Posts created:**\n` +
            `• ✅ Lumist.ai Account Verification (pinned)\n` +
            `• 🎓 Alumni Verification\n\n` +
            `**Permissions:**\n` +
            `• Regular users can view but cannot create new posts\n` +
            `• Moderators and above can create and manage posts`,
        });

        console.log('✅ Verification forum setup complete!');
      } catch (error) {
        console.error('❌ Error setting up verify forum:', error);
        await interaction.editReply({ content: `❌ Error: ${error.message}` });
      }
    }

    if (commandName === 'stats') {
      const guild = interaction.guild;
      const members = await guild.members.fetch();
      const roles = await guild.roles.fetch();
      const memberRole = roles.find(r => r.name === ROLES.MEMBER);
      const verifiedRole = roles.find(r => r.name === ROLES.VERIFIED);
      const premiumRole = roles.find(r => r.name === ROLES.PREMIUM);
      const total = members.filter(m => !m.user.bot).size;
      const online = members.filter(m => !m.user.bot && m.presence?.status !== 'offline').size;
      const onboarded = memberRole ? members.filter(m => m.roles.cache.has(memberRole.id)).size : 0;
      const verified = verifiedRole ? members.filter(m => m.roles.cache.has(verifiedRole.id)).size : 0;
      const premium = premiumRole ? members.filter(m => m.roles.cache.has(premiumRole.id)).size : 0;
      
      await interaction.reply({ embeds: [new EmbedBuilder().setColor('#3498DB').setTitle('📊 Server Statistics').addFields(
        { name: 'Total', value: `${total}`, inline: true },
        { name: 'Online', value: `${online}`, inline: true },
        { name: 'Onboarded', value: `${onboarded}`, inline: true },
        { name: 'Verified', value: `${verified}`, inline: true },
        { name: 'Premium', value: `${premium}`, inline: true },
      ).setTimestamp()], ephemeral: true });
    }

    if (commandName === 'setupcollegeforums') {
      await interaction.deferReply({ ephemeral: true });

      try {
        const guild = interaction.guild;

        // Get roles for permissions
        const modRole = await findRole(guild, ROLES.MODERATOR);
        const adminRole = await findRole(guild, ROLES.ADMIN);
        const founderRole = await findRole(guild, ROLES.FOUNDER);
        const vietnamRole = await findRole(guild, ROLES.VIETNAM);

        // Find or create COLLEGE & BEYOND category
        const channels = await guild.channels.fetch();
        let collegeCategory = channels.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes('college'));

        if (!collegeCategory) {
          collegeCategory = await guild.channels.create({
            name: '🎓 COLLEGE & BEYOND',
            type: ChannelType.GuildCategory,
          });
          console.log('📁 Created COLLEGE & BEYOND category');
        }

        // Find SAT STUDY category for Brain Teaser
        let satCategory = channels.find(c => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes('sat'));

        // Delete existing college channels if they exist
        const existingUSChannel = channels.find(c => c.name === CHANNELS.COLLEGE_APPS_US);
        const existingVNChannel = channels.find(c => c.name === CHANNELS.COLLEGE_APPS_VN);
        const existingBrainTeaser = channels.find(c => c.name === CHANNELS.BRAIN_TEASER);

        if (existingUSChannel) {
          await existingUSChannel.delete('Recreating college forum');
          console.log('🗑️ Deleted existing US college apps channel');
        }
        if (existingVNChannel) {
          await existingVNChannel.delete('Recreating college forum');
          console.log('🗑️ Deleted existing Vietnam college apps channel');
        }
        if (existingBrainTeaser) {
          await existingBrainTeaser.delete('Recreating brain teaser channel');
          console.log('🗑️ Deleted existing brain teaser channel');
        }

        // ============================================
        // CREATE BRAIN TEASER CHANNEL
        // ============================================
        const brainTeaserChannel = await guild.channels.create({
          name: CHANNELS.BRAIN_TEASER,
          type: ChannelType.GuildText,
          topic: '🧠 Daily brain teasers from Lumist.ai! Test your skills with challenging SAT-style questions.',
          parent: satCategory?.id,
          permissionOverwrites: [
            // @everyone can view and read but not send messages
            {
              id: guild.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
              deny: [PermissionFlagsBits.SendMessages],
            },
            // Bot can send messages
            {
              id: client.user.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages],
            },
            // Moderators can send
            ...(modRole ? [{
              id: modRole.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
            }] : []),
          ],
        });
        console.log(`📋 Created brain teaser channel: #${brainTeaserChannel.name}`);

        // ============================================
        // US COLLEGE APPLICATIONS TAGS
        // ============================================
        const usCollegeTags = [
          // Region tags
          { name: '🌲 Northeast', moderated: false },
          { name: '☀️ West Coast', moderated: false },
          { name: '🤠 South', moderated: false },
          { name: '🌽 Midwest', moderated: false },
          { name: '🌍 International', moderated: false },
          // Type tags
          { name: '🏛️ Ivy League', moderated: false },
          { name: '📚 Liberal Arts', moderated: false },
          { name: '🏫 State School', moderated: false },
          { name: '✊ HBCU', moderated: false },
          { name: '🔬 Tech/STEM', moderated: false },
          // Status tags
          { name: '⚡ Early Action', moderated: false },
          { name: '📝 Early Decision', moderated: false },
          { name: '📋 Regular Decision', moderated: false },
          { name: '⏳ Waitlist', moderated: false },
        ];

        // ============================================
        // CREATE US COLLEGE APPLICATIONS FORUM
        // ============================================
        const usCollegeForum = await guild.channels.create({
          name: CHANNELS.COLLEGE_APPS_US,
          type: ChannelType.GuildForum,
          topic: '🇺🇸 US College Applications - One post per university. Find your dream school, share stats, discuss essays, and connect with other applicants!',
          parent: collegeCategory?.id,
          defaultForumLayout: ForumLayoutType.List,
          defaultSortOrder: SortOrderType.CreationDate,
          permissionOverwrites: [
            // @everyone: can view, can send messages in threads, but CANNOT create threads (requires approval)
            {
              id: guild.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessagesInThreads],
              deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.CreatePrivateThreads],
            },
            // Bot can do everything
            {
              id: client.user.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageThreads, PermissionFlagsBits.SendMessagesInThreads],
            },
            // Moderators can create and manage
            ...(modRole ? [{
              id: modRole.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.ManageThreads, PermissionFlagsBits.SendMessagesInThreads],
            }] : []),
            // Admins can create and manage
            ...(adminRole ? [{
              id: adminRole.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.ManageThreads, PermissionFlagsBits.SendMessagesInThreads],
            }] : []),
            // Founders can create and manage
            ...(founderRole ? [{
              id: founderRole.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.ManageThreads, PermissionFlagsBits.SendMessagesInThreads],
            }] : []),
          ],
          availableTags: usCollegeTags,
        });
        console.log(`📋 Created US college forum: #${usCollegeForum.name}`);

        // ============================================
        // VIETNAM COLLEGE APPLICATIONS TAGS
        // ============================================
        const vnCollegeTags = [
          // City tags
          { name: '🏙️ Hà Nội', moderated: false },
          { name: '🌆 TP.HCM', moderated: false },
          { name: '🏖️ Đà Nẵng', moderated: false },
          { name: '🌾 Other Cities', moderated: false },
          // Type tags
          { name: '🏛️ Top University', moderated: false },
          { name: '🔬 Tech/Engineering', moderated: false },
          { name: '💼 Business/Economics', moderated: false },
          { name: '🩺 Medical', moderated: false },
          { name: '🎨 Arts/Humanities', moderated: false },
          // Status tags
          { name: '📝 Application Open', moderated: false },
          { name: '✅ Accepted', moderated: false },
          { name: '⏳ Waiting', moderated: false },
        ];

        // ============================================
        // CREATE VIETNAM COLLEGE APPLICATIONS FORUM
        // ============================================
        const vnCollegeForum = await guild.channels.create({
          name: CHANNELS.COLLEGE_APPS_VN,
          type: ChannelType.GuildForum,
          topic: '🇻🇳 Vietnam College Applications - Dành riêng cho sinh viên Việt Nam. One post per university.',
          parent: collegeCategory?.id,
          defaultForumLayout: ForumLayoutType.List,
          defaultSortOrder: SortOrderType.CreationDate,
          permissionOverwrites: [
            // @everyone: CANNOT view (Vietnam-only channel)
            {
              id: guild.id,
              deny: [PermissionFlagsBits.ViewChannel],
            },
            // Vietnam role: can view, can send in threads, but CANNOT create threads
            ...(vietnamRole ? [{
              id: vietnamRole.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessagesInThreads],
              deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.CreatePrivateThreads],
            }] : []),
            // Bot can do everything
            {
              id: client.user.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageThreads, PermissionFlagsBits.SendMessagesInThreads],
            },
            // Moderators can create and manage
            ...(modRole ? [{
              id: modRole.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.ManageThreads, PermissionFlagsBits.SendMessagesInThreads],
            }] : []),
            // Admins can create and manage
            ...(adminRole ? [{
              id: adminRole.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.ManageThreads, PermissionFlagsBits.SendMessagesInThreads],
            }] : []),
            // Founders can create and manage
            ...(founderRole ? [{
              id: founderRole.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.CreatePublicThreads, PermissionFlagsBits.ManageThreads, PermissionFlagsBits.SendMessagesInThreads],
            }] : []),
          ],
          availableTags: vnCollegeTags,
        });
        console.log(`📋 Created Vietnam college forum: #${vnCollegeForum.name}`);

        await interaction.editReply({
          content: `✅ **College Forums Set Up!**\n\n` +
            `**Created:**\n` +
            `• <#${brainTeaserChannel.id}> - Daily brain teasers (under SAT Study)\n` +
            `• <#${usCollegeForum.id}> - US College Applications\n` +
            `• <#${vnCollegeForum.id}> - Vietnam College Applications (Vietnam-only)\n\n` +
            `**How it works:**\n` +
            `• Each university gets ONE dedicated post\n` +
            `• Users can discuss in threads but cannot create new posts\n` +
            `• Use \`/addcollege\` to add new universities\n` +
            `• Users can filter by tags (Region, Type, Status)\n\n` +
            `**US Tags:** Northeast, West Coast, South, Midwest, Ivy League, Liberal Arts, State School, HBCU, Tech/STEM\n` +
            `**VN Tags:** Hà Nội, TP.HCM, Đà Nẵng, Top University, Tech, Business, Medical, Arts`,
        });

        console.log('✅ College forums setup complete!');
      } catch (error) {
        console.error('❌ Error setting up college forums:', error);
        await interaction.editReply({ content: `❌ Error: ${error.message}` });
      }
    }

    if (commandName === 'addcollege') {
      await interaction.deferReply({ ephemeral: true });

      try {
        const forumType = options.getString('forum');
        const collegeName = options.getString('name');
        const deadline = options.getString('deadline');
        const avgSat = options.getString('avg_sat');
        const avgGpa = options.getString('avg_gpa');
        const link = options.getString('link');

        const guild = interaction.guild;
        const channels = await guild.channels.fetch();

        // Find the appropriate forum channel
        const channelName = forumType === 'us' ? CHANNELS.COLLEGE_APPS_US : CHANNELS.COLLEGE_APPS_VN;
        const forumChannel = channels.find(c => c.name === channelName && c.type === ChannelType.GuildForum);

        if (!forumChannel) {
          return interaction.editReply({ content: `❌ Forum channel \`#${channelName}\` not found. Run \`/setupcollegeforums\` first.` });
        }

        // Check if a thread for this college already exists
        const existingThreads = await forumChannel.threads.fetchActive();
        const existingThread = existingThreads.threads.find(t => t.name.toLowerCase() === collegeName.toLowerCase());
        if (existingThread) {
          return interaction.editReply({ content: `❌ A post for **${collegeName}** already exists: <#${existingThread.id}>` });
        }

        // Build the wiki/info embed
        const wikiEmbed = new EmbedBuilder()
          .setColor(forumType === 'us' ? '#3498DB' : '#E74C3C')
          .setTitle(`📚 ${collegeName}`)
          .setDescription(`Welcome to the **${collegeName}** discussion thread!\n\nShare your stats, discuss essays, ask questions, and connect with other applicants.`)
          .setTimestamp();

        // Add fields based on provided info
        const fields = [];
        if (deadline) fields.push({ name: '📅 Application Deadline', value: deadline, inline: true });
        if (avgSat) fields.push({ name: '📊 Average SAT', value: avgSat, inline: true });
        if (avgGpa) fields.push({ name: '📈 Average GPA', value: avgGpa, inline: true });
        if (link) fields.push({ name: '🔗 Application Info', value: `[View Requirements](${link})`, inline: false });

        fields.push({
          name: '💡 Discussion Guidelines',
          value: '• Be respectful and supportive\n• Share your stats and experiences\n• Ask questions about essays and requirements\n• Celebrate acceptances and support rejections\n• No sharing of confidential application materials',
          inline: false
        });

        wikiEmbed.addFields(fields);
        wikiEmbed.setFooter({ text: `Created by ${interaction.user.tag} • Follow this post to get notified of new discussions` });

        // Create the thread/post
        const collegeThread = await forumChannel.threads.create({
          name: collegeName,
          message: {
            embeds: [wikiEmbed],
          },
          appliedTags: [], // Moderators can add tags manually
        });

        await interaction.editReply({
          content: `✅ **College post created!**\n\n` +
            `**${collegeName}** has been added to <#${forumChannel.id}>\n` +
            `Direct link: <#${collegeThread.id}>\n\n` +
            `*Tip: Add relevant tags (Region, Type, Status) by editing the post.*`,
        });

        console.log(`🏫 Created college post: ${collegeName} in ${channelName}`);
      } catch (error) {
        console.error('❌ Error adding college:', error);
        await interaction.editReply({ content: `❌ Error: ${error.message}` });
      }
    }

    if (commandName === 'populatevncolleges') {
      await interaction.deferReply({ ephemeral: true });

      try {
        const guild = interaction.guild;
        const channels = await guild.channels.fetch();
        const shouldClear = options.getBoolean('clear') || false;

        // Find the Vietnam college forum
        const forumChannel = channels.find(c => c.name === CHANNELS.COLLEGE_APPS_VN && c.type === ChannelType.GuildForum);
        if (!forumChannel) {
          return interaction.editReply({ content: `❌ Forum channel \`#${CHANNELS.COLLEGE_APPS_VN}\` not found. Run \`/setupcollegeforums\` first.` });
        }

        // If clear option is set, delete all existing posts first
        if (shouldClear) {
          await interaction.editReply({ content: `🗑️ Clearing existing posts in #${CHANNELS.COLLEGE_APPS_VN}...` });

          const activeThreads = await forumChannel.threads.fetchActive();
          const archivedThreads = await forumChannel.threads.fetchArchived();
          const allThreads = [...activeThreads.threads.values(), ...archivedThreads.threads.values()];

          let deleted = 0;
          for (const thread of allThreads) {
            try {
              await thread.delete();
              deleted++;
              await new Promise(resolve => setTimeout(resolve, 500)); // Rate limit
            } catch (err) {
              console.error(`Failed to delete thread ${thread.name}:`, err.message);
            }
          }

          await interaction.editReply({ content: `🗑️ Deleted ${deleted} existing posts. Now creating new posts...` });
        }

        // Vietnam universities that accept SAT - with city and type tags
        // Tags match: 🏙️ Hà Nội, 🌆 TP.HCM, 🏛️ Top University, 🔬 Tech/Engineering, 💼 Business/Economics, 🩺 Medical, 🎨 Arts/Humanities
        const vnUniversities = [
          // Hanoi-only universities
          { code: 'NEU', name: 'Đại Học Kinh Tế Quốc Dân', city: 'Hà Nội', tags: ['🏙️ Hà Nội', '💼 Business/Economics', '🏛️ Top University'] },
          { code: 'HUST', name: 'Đại Học Bách Khoa Hà Nội', city: 'Hà Nội', tags: ['🏙️ Hà Nội', '🔬 Tech/Engineering', '🏛️ Top University'] },
          { code: 'TMU', name: 'Đại Học Thương Mại', city: 'Hà Nội', tags: ['🏙️ Hà Nội', '💼 Business/Economics'] },
          { code: 'DAV', name: 'Học Viện Ngoại Giao', city: 'Hà Nội', tags: ['🏙️ Hà Nội', '🎨 Arts/Humanities'] },
          { code: 'BFAV', name: 'Học Viện Ngân Hàng', city: 'Hà Nội', tags: ['🏙️ Hà Nội', '💼 Business/Economics'] },
          { code: 'AOF', name: 'Học Viện Tài Chính', city: 'Hà Nội', tags: ['🏙️ Hà Nội', '💼 Business/Economics'] },
          { code: 'HANU', name: 'Đại Học Hà Nội', city: 'Hà Nội', tags: ['🏙️ Hà Nội', '🎨 Arts/Humanities'] },
          { code: 'NUCE', name: 'Đại Học Xây Dựng Hà Nội', city: 'Hà Nội', tags: ['🏙️ Hà Nội', '🔬 Tech/Engineering'] },
          // VNU Hanoi
          { code: 'VNU-UED', name: 'Đại Học Giáo Dục - ĐHQGHN', city: 'Hà Nội', tags: ['🏙️ Hà Nội', '🎨 Arts/Humanities', '🏛️ Top University'] },
          { code: 'VNU-ULIS', name: 'Đại Học Ngoại Ngữ - ĐHQGHN', city: 'Hà Nội', tags: ['🏙️ Hà Nội', '🎨 Arts/Humanities', '🏛️ Top University'] },
          { code: 'VNU-IS', name: 'Khoa Quốc Tế - ĐHQGHN', city: 'Hà Nội', tags: ['🏙️ Hà Nội', '💼 Business/Economics', '🏛️ Top University'] },
          { code: 'VNU-SB', name: 'Khoa Quản Trị Kinh Doanh - ĐHQGHN', city: 'Hà Nội', tags: ['🏙️ Hà Nội', '💼 Business/Economics', '🏛️ Top University'] },
          { code: 'VJU', name: 'Đại Học Việt Nhật - ĐHQGHN', city: 'Hà Nội', tags: ['🏙️ Hà Nội', '🔬 Tech/Engineering', '🏛️ Top University'] },
          // Medical/Military (Hanoi)
          { code: 'HMU', name: 'Đại Học Y Hà Nội', city: 'Hà Nội', tags: ['🏙️ Hà Nội', '🩺 Medical', '🏛️ Top University'] },
          { code: 'MMA', name: 'Học Viện Quân Y', city: 'Hà Nội', tags: ['🏙️ Hà Nội', '🩺 Medical'] },
          // Multi-campus universities (Hà Nội & TP.HCM)
          { code: 'FTU', name: 'Đại Học Ngoại Thương', city: 'Hà Nội & TP.HCM', tags: ['🏙️ Hà Nội', '🌆 TP.HCM', '💼 Business/Economics', '🏛️ Top University'] },
          { code: 'PTIT', name: 'Học Viện Công Nghệ Bưu Chính Viễn Thông', city: 'Hà Nội & TP.HCM', tags: ['🏙️ Hà Nội', '🌆 TP.HCM', '🔬 Tech/Engineering'] },
          { code: 'RMIT-VN', name: 'RMIT Vietnam', city: 'TP.HCM & Hà Nội', tags: ['🌆 TP.HCM', '🏙️ Hà Nội', '💼 Business/Economics', '🔬 Tech/Engineering', '🏛️ Top University'] },
          // Ho Chi Minh City-only universities
          { code: 'UEH', name: 'Đại Học Kinh Tế TP.HCM', city: 'TP.HCM', tags: ['🌆 TP.HCM', '💼 Business/Economics', '🏛️ Top University'] },
          { code: 'HCMUT', name: 'Đại Học Bách Khoa TP.HCM', city: 'TP.HCM', tags: ['🌆 TP.HCM', '🔬 Tech/Engineering', '🏛️ Top University'] },
          { code: 'UMP', name: 'Đại Học Y Dược TP.HCM', city: 'TP.HCM', tags: ['🌆 TP.HCM', '🩺 Medical', '🏛️ Top University'] },
          { code: 'UEL', name: 'Đại Học Kinh Tế - Luật TP.HCM', city: 'TP.HCM', tags: ['🌆 TP.HCM', '💼 Business/Economics'] },
          { code: 'HCMUARC', name: 'Đại Học Kiến Trúc TP.HCM', city: 'TP.HCM', tags: ['🌆 TP.HCM', '🎨 Arts/Humanities'] },
          { code: 'OU-HCMC', name: 'Đại Học Mở TP.HCM', city: 'TP.HCM', tags: ['🌆 TP.HCM', '💼 Business/Economics'] },
          { code: 'BUH', name: 'Đại Học Ngân Hàng TP.HCM', city: 'TP.HCM', tags: ['🌆 TP.HCM', '💼 Business/Economics'] },
          { code: 'HIU', name: 'Đại Học Quốc Tế Hồng Bàng', city: 'TP.HCM', tags: ['🌆 TP.HCM', '💼 Business/Economics', '🩺 Medical'] },
          { code: 'TDTU', name: 'Đại Học Tôn Đức Thắng', city: 'TP.HCM', tags: ['🌆 TP.HCM', '🔬 Tech/Engineering', '💼 Business/Economics', '🏛️ Top University'] },
        ];

        // Get existing threads to avoid duplicates
        const existingThreads = await forumChannel.threads.fetchActive();
        const archivedThreads = await forumChannel.threads.fetchArchived();
        const allExistingNames = new Set([
          ...existingThreads.threads.map(t => t.name.toLowerCase()),
          ...archivedThreads.threads.map(t => t.name.toLowerCase()),
        ]);

        let created = 0;
        let skipped = 0;
        const results = [];

        // Get available tags from the forum channel
        const availableTags = forumChannel.availableTags;
        const tagMap = new Map(availableTags.map(t => [t.name, t.id]));

        // Debug: Log available tags
        console.log('📋 Available forum tags:', availableTags.map(t => t.name));

        await interaction.editReply({ content: `🔄 Starting population of Vietnam colleges... (0/${vnUniversities.length})` });

        for (const uni of vnUniversities) {
          const postName = `${uni.code} - ${uni.name}`;

          // Check if already exists
          if (allExistingNames.has(postName.toLowerCase())) {
            skipped++;
            results.push(`⏭️ Skipped: ${postName} (already exists)`);
            continue;
          }

          // Map university tags to forum tag IDs (max 5 tags per post)
          const appliedTagIds = uni.tags
            .map(tagName => tagMap.get(tagName))
            .filter(id => id !== undefined)
            .slice(0, 5);

          // Debug: Log tag mapping for multi-campus universities
          if (uni.tags.length > 3) {
            const mapped = uni.tags.map(t => ({ tag: t, found: tagMap.has(t) }));
            console.log(`🏷️ ${uni.code} tags: requested=${uni.tags.length}, applied=${appliedTagIds.length}`, mapped);
          }

          // Build the wiki embed
          const wikiEmbed = new EmbedBuilder()
            .setColor('#E74C3C')
            .setTitle(`🇻🇳 ${postName}`)
            .setDescription(`Chào mừng đến với thread thảo luận **${uni.name}**!\n\nChia sẻ điểm số, thảo luận hồ sơ, đặt câu hỏi, và kết nối với các thí sinh khác.`)
            .addFields(
              { name: '📍 Thành phố', value: uni.city, inline: true },
              { name: '📋 Phương thức xét tuyển', value: 'SAT Score', inline: true },
              { name: '💡 Hướng dẫn thảo luận', value: '• Tôn trọng và hỗ trợ lẫn nhau\n• Chia sẻ điểm số và kinh nghiệm\n• Đặt câu hỏi về hồ sơ và yêu cầu\n• Chúc mừng khi đỗ, động viên khi trượt\n• Không chia sẻ tài liệu mật', inline: false }
            )
            .setFooter({ text: `Created via /populatevncolleges • Follow this post to get notified` })
            .setTimestamp();

          try {
            await forumChannel.threads.create({
              name: postName,
              message: { embeds: [wikiEmbed] },
              appliedTags: appliedTagIds,
            });
            created++;
            results.push(`✅ Created: ${postName} [${appliedTagIds.length}/${uni.tags.length} tags applied]`);

            // Rate limit: wait a bit between creates
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Update progress every 5 universities
            if ((created + skipped) % 5 === 0) {
              await interaction.editReply({ content: `🔄 Processing Vietnam colleges... (${created + skipped}/${vnUniversities.length})` });
            }
          } catch (err) {
            results.push(`❌ Failed: ${postName} - ${err.message}`);
          }
        }

        // Final summary
        const summary = `✅ **Vietnam College Forum Population Complete!**\n\n` +
          `**Created:** ${created} new posts\n` +
          `**Skipped:** ${skipped} (already existed)\n` +
          `**Total Universities:** ${vnUniversities.length}\n\n` +
          `Forum: <#${forumChannel.id}>\n\n` +
          `*Details:*\n${results.slice(0, 20).join('\n')}${results.length > 20 ? `\n...and ${results.length - 20} more` : ''}`;

        await interaction.editReply({ content: summary });
        console.log(`🇻🇳 Populated VN college forum: ${created} created, ${skipped} skipped`);
      } catch (error) {
        console.error('❌ Error populating VN colleges:', error);
        await interaction.editReply({ content: `❌ Error: ${error.message}` });
      }
    }
  }

  if (interaction.isButton()) {
    // Escalation buttons
    if (interaction.customId.startsWith('claim_escalation_')) {
      await handleClaimEscalation(interaction, interaction.customId.replace('claim_escalation_', ''));
      return;
    }
    if (interaction.customId.startsWith('resolve_escalation_')) {
      await handleResolveEscalation(interaction, interaction.customId.replace('resolve_escalation_', ''));
      return;
    }
    if (interaction.customId.startsWith('return_to_ai_')) {
      await handleReturnToAI(interaction, interaction.customId.replace('return_to_ai_', ''));
      return;
    }
    if (interaction.customId.startsWith('view_history_')) {
      await handleViewHistory(interaction, interaction.customId.replace('view_history_', ''));
      return;
    }
    if (interaction.customId.startsWith('open_thread_')) {
      const escalationId = interaction.customId.replace('open_thread_', '');
      for (const [threadId, escId] of escalationThreads.entries()) {
        if (escId === escalationId) { await interaction.reply({ content: `Thread: <#${threadId}>`, ephemeral: true }); return; }
      }
      await interaction.reply({ content: 'Thread not found. Try claiming again.', ephemeral: true });
      return;
    }
    
    // Ticket buttons
    if (interaction.customId === 'create_ticket') await interaction.reply(createTicketCategorySelect());
    if (interaction.customId === 'close_ticket') { await interaction.reply({ content: '🔒 Closing...', ephemeral: true }); await closeTicket(interaction.channel); }

    // Verification buttons
    if (interaction.customId === 'verify_lumist') {
      // TODO: Configure actual verification link
      const verifyLink = process.env.LUMIST_VERIFY_URL || 'https://lumist.ai/discord-verify';
      await interaction.reply({
        content: `✅ **Lumist.ai Verification**\n\nClick the link below to verify your account:\n${verifyLink}\n\nAfter verifying on the website, you'll automatically receive the ✅ Verified role!`,
        ephemeral: true
      });
    }

    if (interaction.customId === 'verify_alumni') {
      // Create a ticket for alumni verification
      const result = await createTicketChannel(interaction.guild, interaction.user, 'Alumni Verification');
      if (result.error) {
        await interaction.reply({ content: `❌ ${result.error}`, ephemeral: true });
      } else {
        // Send instructions in the ticket
        await result.channel.send({
          embeds: [new EmbedBuilder()
            .setColor('#F1C40F')
            .setTitle('🎓 Alumni Verification Request')
            .setDescription(`Welcome ${interaction.user}!\n\nTo get verified as an Alumni, please provide **one** of the following:`)
            .addFields(
              { name: '📄 Accepted Documents', value: '• Photo of your student ID (blur sensitive info)\n• College acceptance letter\n• Screenshot of .edu email\n• Enrollment verification letter' },
              { name: '⚠️ Privacy Note', value: 'Feel free to blur/hide any sensitive personal information. We only need to verify your enrollment status.' },
              { name: '⏰ Next Steps', value: 'Upload your proof of enrollment here, and a moderator will review it shortly!' }
            )
            .setFooter({ text: 'A moderator will review your request' })
          ]
        });
        await interaction.reply({ content: `✅ Alumni verification ticket created! <#${result.channel.id}>`, ephemeral: true });
      }
    }
  }
  
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'ticket_category') {
      const result = await createTicketChannel(interaction.guild, interaction.user, interaction.values[0]);
      if (result.error) await interaction.update({ content: `❌ ${result.error}`, embeds: [], components: [] });
      else await interaction.update({ content: `✅ Ticket created! <#${result.channel.id}>`, embeds: [], components: [] });
    }
  }
});

// ============================================
// ERROR HANDLING & LOGIN
// ============================================
client.on('error', (error) => console.error('❌ Client error:', error));
process.on('unhandledRejection', (error) => console.error('❌ Unhandled rejection:', error));
process.on('SIGTERM', () => { client.destroy(); server.close(); process.exit(0); });

console.log('🔄 Connecting to Discord...');
client.login(BOT_TOKEN);
