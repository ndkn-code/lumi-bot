/**
 * Lumist.ai Discord Bot v4.3
 *
 * Features:
 * - Native Discord Onboarding (via Server Settings)
 * - Auto-moderation
 * - Slash commands
 * - Ticket system
 * - Analytics pipeline (Supabase integration)
 * - AI Chatbot via n8n
 * - Escalation System
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
  console.log(`🦊 Lumi Bot v4.3 is online!`);
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
          .setDescription(`🎉 Welcome ${newMember} to **Lumist.ai**!`)
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
