/**
 * Lumist.ai Discord Bot v4.1
 * 
 * Features:
 * - Onboarding system
 * - Auto-moderation
 * - Slash commands
 * - Ticket system
 * - Analytics pipeline (Supabase integration)
 * - AI Chatbot via n8n (NEW)
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
const ANALYTICS_INTERVAL = 5 * 60 * 1000; // 5 minutes

// n8n Chatbot Configuration
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL; // e.g., https://your-n8n.app.n8n.cloud/webhook/lumist-chat
const CHATBOT_CHANNEL_ID = process.env.CHATBOT_CHANNEL_ID; // Optional: dedicated channel for chatbot

if (!BOT_TOKEN) {
  console.error('❌ Error: BOT_TOKEN environment variable is not set');
  process.exit(1);
}

if (!SUPABASE_SERVICE_KEY) {
  console.warn('⚠️ Warning: SUPABASE_SERVICE_KEY not set - analytics disabled');
}

if (!N8N_WEBHOOK_URL) {
  console.warn('⚠️ Warning: N8N_WEBHOOK_URL not set - chatbot disabled');
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

// Channel names
const CHANNELS = {
  INTRODUCTIONS: 'introductions',
  WELCOME: 'welcome',
  RULES: 'rules',
  MOD_LOGS: 'mod-logs',
  SUPPORT_TICKETS: 'support-tickets',
  ASK_LUMI: 'ask-lumi', // Optional dedicated chatbot channel
};

// Roles
const ROLES = {
  MEMBER: '🌱 Member',
  VERIFIED: '✅ Verified',
  PREMIUM: '💎 Premium',
  ALUMNI: '🎓 Alumni',
  MODERATOR: '🛡️ Moderator',
  ADMIN: '⚙️ Admin',
  FOUNDER: '👑 Founder',
  // Nationality
  VIETNAM: '🇻🇳 Vietnam',
  USA: '🇺🇸 United States',
  UK: '🇬🇧 United Kingdom',
  SINGAPORE: '🇸🇬 Singapore',
  KOREA: '🇰🇷 South Korea',
  JAPAN: '🇯🇵 Japan',
  CHINA: '🇨🇳 China',
  INDIA: '🇮🇳 India',
  OTHER: '🌏 Other International',
  // Grade levels
  FRESHMAN: '🎒 Freshman',
  SOPHOMORE: '🎒 Sophomore',
  JUNIOR: '🎒 Junior',
  SENIOR: '🎒 Senior',
  GAP_YEAR: '🎒 Gap Year',
};

// Nationality mapping for analytics
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

// Grade mapping for analytics
const GRADE_MAP = {
  [ROLES.FRESHMAN]: 'freshman',
  [ROLES.SOPHOMORE]: 'sophomore',
  [ROLES.JUNIOR]: 'junior',
  [ROLES.SENIOR]: 'senior',
  [ROLES.GAP_YEAR]: 'gap_year',
};

// ============================================
// HTTP SERVER (Health Check)
// ============================================
const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      bot: client.user ? client.user.tag : 'connecting...',
      uptime: process.uptime(),
      analyticsEnabled: !!SUPABASE_SERVICE_KEY,
      chatbotEnabled: !!N8N_WEBHOOK_URL,
      timestamp: new Date().toISOString()
    }));
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`🌐 Health check server running on port ${PORT}`);
});

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
  partials: [Partials.Channel, Partials.Message], // Required for DMs
});

// ============================================
// DATA STORES
// ============================================
const onboardingState = new Map();
const messageHistory = new Map();
const duplicateHistory = new Map();
const joinHistory = [];
const userWarnings = new Map();
const activeTickets = new Map();
let isRaidMode = false;

// Analytics tracking
const channelMessageCounts = new Map();

// Chatbot cooldown (prevent spam)
const chatbotCooldown = new Map();
const CHATBOT_COOLDOWN_MS = 2000; // 2 seconds between messages

// ============================================
// N8N CHATBOT FUNCTIONS
// ============================================
async function sendToN8nChatbot(message, isDM = false) {
  if (!N8N_WEBHOOK_URL) {
    return { success: false, error: 'Chatbot not configured' };
  }

  // Check cooldown
  const cooldownKey = message.author.id;
  const lastMessage = chatbotCooldown.get(cooldownKey);
  if (lastMessage && Date.now() - lastMessage < CHATBOT_COOLDOWN_MS) {
    return { success: false, error: 'cooldown' };
  }
  chatbotCooldown.set(cooldownKey, Date.now());

  // Extract the actual question (remove bot mention if present)
  let userMessage = message.content;
  if (!isDM && client.user) {
    userMessage = userMessage.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
  }

  // Skip if empty message after removing mention
  if (!userMessage) {
    return { success: false, error: 'empty' };
  }

  // Get user info for context
  let isVerified = false;
  let lumistUserName = null;
  
  if (message.member) {
    isVerified = message.member.roles.cache.some(r => r.name === ROLES.VERIFIED);
    // Could fetch from database if linked
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
    lumist_user_name: lumistUserName,
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

// Check if message should trigger chatbot
function shouldTriggerChatbot(message) {
  // Always respond to DMs
  if (message.channel.type === ChannelType.DM) {
    return true;
  }

  // Check if bot is mentioned
  if (message.mentions.has(client.user)) {
    return true;
  }

  // Check if in dedicated chatbot channel
  if (CHATBOT_CHANNEL_ID && message.channel.id === CHATBOT_CHANNEL_ID) {
    return true;
  }

  // Check if in #ask-lumi channel
  if (message.channel.name === CHANNELS.ASK_LUMI) {
    return true;
  }

  return false;
}

// Handle chatbot response
async function handleChatbotMessage(message) {
  const isDM = message.channel.type === ChannelType.DM;
  
  // Show typing indicator
  try {
    await message.channel.sendTyping();
  } catch (e) {
    // Ignore typing errors
  }

  const result = await sendToN8nChatbot(message, isDM);

  if (!result.success) {
    if (result.error === 'cooldown') {
      // Silently ignore cooldown
      return;
    }
    if (result.error === 'empty') {
      await message.reply({
        content: '🦊 Hey! Did you have a question? Just ask me anything about Lumist!',
        allowedMentions: { repliedUser: false }
      });
      return;
    }
    
    // Generic error
    await message.reply({
      content: '🦊 Oops! I had a little hiccup. Try again in a moment, or reach out to contact@lumist.ai if it keeps happening!',
      allowedMentions: { repliedUser: false }
    });
    return;
  }

  // Send the AI response
  const responseText = result.response || "I'm not sure how to answer that. Try asking in a different way!";
  
  // Split long responses (Discord has 2000 char limit)
  const chunks = splitMessage(responseText, 1900);
  
  for (let i = 0; i < chunks.length; i++) {
    if (i === 0) {
      await message.reply({
        content: chunks[i],
        allowedMentions: { repliedUser: false }
      });
    } else {
      await message.channel.send(chunks[i]);
    }
  }

  console.log(`💬 Chatbot replied to ${message.author.tag}${isDM ? ' (DM)' : ''}`);
}

// Split long messages
function splitMessage(text, maxLength) {
  if (text.length <= maxLength) return [text];
  
  const chunks = [];
  let remaining = text;
  
  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }
    
    // Try to split at sentence end or newline
    let splitIndex = remaining.lastIndexOf('. ', maxLength);
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      splitIndex = remaining.lastIndexOf('\n', maxLength);
    }
    if (splitIndex === -1 || splitIndex < maxLength / 2) {
      splitIndex = remaining.lastIndexOf(' ', maxLength);
    }
    if (splitIndex === -1) {
      splitIndex = maxLength;
    }
    
    chunks.push(remaining.substring(0, splitIndex + 1));
    remaining = remaining.substring(splitIndex + 1);
  }
  
  return chunks;
}

// ============================================
// SUPABASE ANALYTICS FUNCTIONS
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

// Log member event
async function logMemberEvent(eventType, member, metadata = {}) {
  await supabaseInsert('discord_member_events', {
    event_type: eventType,
    discord_user_id: member.user?.id || member.id,
    discord_username: member.user?.tag || member.tag || 'Unknown',
    metadata,
  });
  console.log(`📊 Event logged: ${eventType} - ${member.user?.tag || member.tag}`);
}

// Collect and send server stats
async function collectServerStats() {
  if (!SUPABASE_SERVICE_KEY) return;
  
  try {
    const guild = await client.guilds.fetch(GUILD_ID);
    const members = await guild.members.fetch();
    const roles = await guild.roles.fetch();
    
    // Find roles
    const memberRole = roles.find(r => r.name === ROLES.MEMBER);
    const verifiedRole = roles.find(r => r.name === ROLES.VERIFIED);
    const premiumRole = roles.find(r => r.name === ROLES.PREMIUM);
    const alumniRole = roles.find(r => r.name === ROLES.ALUMNI);
    
    // Count members by role
    const totalMembers = members.filter(m => !m.user.bot).size;
    const onlineMembers = members.filter(m => !m.user.bot && m.presence?.status !== 'offline').size;
    const botCount = members.filter(m => m.user.bot).size;
    const memberRoleCount = memberRole ? members.filter(m => m.roles.cache.has(memberRole.id)).size : 0;
    const verifiedCount = verifiedRole ? members.filter(m => m.roles.cache.has(verifiedRole.id)).size : 0;
    const premiumCount = premiumRole ? members.filter(m => m.roles.cache.has(premiumRole.id)).size : 0;
    const alumniCount = alumniRole ? members.filter(m => m.roles.cache.has(alumniRole.id)).size : 0;
    
    // Insert server stats
    await supabaseInsert('discord_server_stats', {
      total_members: totalMembers,
      online_members: onlineMembers,
      member_role_count: memberRoleCount,
      verified_count: verifiedCount,
      premium_count: premiumCount,
      alumni_count: alumniCount,
      bot_count: botCount,
    });
    
    // Collect nationality stats
    const nationalityStats = {};
    for (const [roleName, nationalityKey] of Object.entries(NATIONALITY_MAP)) {
      const role = roles.find(r => r.name === roleName);
      if (role) {
        nationalityStats[nationalityKey] = members.filter(m => m.roles.cache.has(role.id)).size;
      }
    }
    
    const timestamp = new Date().toISOString();
    for (const [nationality, count] of Object.entries(nationalityStats)) {
      if (count > 0) {
        await supabaseInsert('discord_nationality_stats', {
          recorded_at: timestamp,
          nationality,
          member_count: count,
        });
      }
    }
    
    // Collect grade stats
    const gradeStats = {};
    for (const [roleName, gradeKey] of Object.entries(GRADE_MAP)) {
      const role = roles.find(r => r.name === roleName);
      if (role) {
        gradeStats[gradeKey] = members.filter(m => m.roles.cache.has(role.id)).size;
      }
    }
    
    for (const [grade, count] of Object.entries(gradeStats)) {
      if (count > 0) {
        await supabaseInsert('discord_grade_stats', {
          recorded_at: timestamp,
          grade,
          member_count: count,
        });
      }
    }
    
    // Collect funnel stats
    await supabaseInsert('discord_funnel_stats', {
      recorded_at: timestamp,
      total_joined: totalMembers,
      completed_onboarding: memberRoleCount,
      verified: verifiedCount,
      premium: premiumCount,
    });
    
    // Collect channel activity
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
    
    // Reset channel message counts
    channelMessageCounts.clear();
    
    console.log(`📊 Analytics snapshot sent - ${totalMembers} members, ${onlineMembers} online`);
  } catch (error) {
    console.error('❌ Error collecting server stats:', error);
  }
}

// Track message for channel activity
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
// SLASH COMMANDS DEFINITION
// ============================================
const commands = [
  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Issue a warning to a user')
    .addUserOption(option => option.setName('user').setDescription('User to warn').setRequired(true))
    .addStringOption(option => option.setName('reason').setDescription('Reason for warning').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  
  new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Mute a user')
    .addUserOption(option => option.setName('user').setDescription('User to mute').setRequired(true))
    .addIntegerOption(option => option.setName('duration').setDescription('Duration in minutes').setRequired(true).setMinValue(1).setMaxValue(40320))
    .addStringOption(option => option.setName('reason').setDescription('Reason for mute'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  
  new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Unmute a user')
    .addUserOption(option => option.setName('user').setDescription('User to unmute').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  
  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a user from the server')
    .addUserOption(option => option.setName('user').setDescription('User to kick').setRequired(true))
    .addStringOption(option => option.setName('reason').setDescription('Reason for kick'))
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
  
  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user from the server')
    .addUserOption(option => option.setName('user').setDescription('User to ban').setRequired(true))
    .addStringOption(option => option.setName('reason').setDescription('Reason for ban'))
    .addIntegerOption(option => option.setName('days').setDescription('Days of messages to delete (0-7)').setMinValue(0).setMaxValue(7))
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
  
  new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('Check warnings for a user')
    .addUserOption(option => option.setName('user').setDescription('User to check').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),
  
  new SlashCommandBuilder()
    .setName('clearwarnings')
    .setDescription('Clear all warnings for a user')
    .addUserOption(option => option.setName('user').setDescription('User to clear warnings for').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  
  new SlashCommandBuilder()
    .setName('purge')
    .setDescription('Delete multiple messages')
    .addIntegerOption(option => option.setName('amount').setDescription('Number of messages to delete (1-100)').setRequired(true).setMinValue(1).setMaxValue(100))
    .addUserOption(option => option.setName('user').setDescription('Only delete messages from this user'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),
  
  new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Create a support ticket'),
  
  new SlashCommandBuilder()
    .setName('close')
    .setDescription('Close the current ticket')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  
  new SlashCommandBuilder()
    .setName('setuptickets')
    .setDescription('Set up the ticket system in the current channel')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  
  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Show server statistics')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  
  new SlashCommandBuilder()
    .setName('ask')
    .setDescription('Ask Lumi a question about Lumist.ai')
    .addStringOption(option => option.setName('question').setDescription('Your question').setRequired(true)),
].map(command => command.toJSON());

// ============================================
// REGISTER SLASH COMMANDS
// ============================================
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
  return member.permissions.has(PermissionFlagsBits.ManageMessages) ||
         member.permissions.has(PermissionFlagsBits.Administrator);
}

function getNationalityRole(value) {
  const map = {
    'vietnam': ROLES.VIETNAM, 'usa': ROLES.USA, 'uk': ROLES.UK,
    'singapore': ROLES.SINGAPORE, 'korea': ROLES.KOREA, 'japan': ROLES.JAPAN,
    'china': ROLES.CHINA, 'india': ROLES.INDIA, 'other': ROLES.OTHER,
  };
  return map[value];
}

function getGradeRole(value) {
  const map = {
    'freshman': ROLES.FRESHMAN, 'sophomore': ROLES.SOPHOMORE,
    'junior': ROLES.JUNIOR, 'senior': ROLES.SENIOR, 'gap_year': ROLES.GAP_YEAR,
  };
  return map[value];
}

// ============================================
// MOD LOGGING
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

// ============================================
// WARNING SYSTEM
// ============================================
function getWarnings(userId) {
  const warnings = userWarnings.get(userId) || [];
  const now = Date.now();
  const validWarnings = warnings.filter(w => 
    now - w.timestamp < AUTOMOD_CONFIG.warnings.expireDays * 24 * 60 * 60 * 1000
  );
  userWarnings.set(userId, validWarnings);
  return validWarnings;
}

function getWarningCount(userId) {
  return getWarnings(userId).length;
}

function addWarning(userId, reason, moderator = 'Auto-Mod') {
  const warnings = userWarnings.get(userId) || [];
  warnings.push({ timestamp: Date.now(), reason, moderator });
  userWarnings.set(userId, warnings);
  return warnings.length;
}

function clearWarnings(userId) {
  userWarnings.delete(userId);
}

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
        await member.send(`🔇 **You have been muted for 1 hour**\nReason: ${reason}`).catch(() => {});
        await logModAction(guild, 'Muted (1 hour)', member.user, 'Auto-Mod', `${reason} (Warning #${warningCount})`, '#E67E22');
        break;
      case 'mute_24h':
        await member.timeout(24 * 60 * 60 * 1000, reason);
        await member.send(`🔇 **You have been muted for 24 hours**\nReason: ${reason}`).catch(() => {});
        await logModAction(guild, 'Muted (24 hours)', member.user, 'Auto-Mod', `${reason} (Warning #${warningCount})`, '#E74C3C');
        break;
      case 'ban_7d':
        await member.send(`🚫 **You have been banned**\nReason: ${reason}`).catch(() => {});
        await member.ban({ deleteMessageSeconds: 86400, reason });
        await logModAction(guild, 'Banned (7 days)', member.user, 'Auto-Mod', `${reason} (Warning #${warningCount})`, '#992D22');
        break;
      case 'ban_permanent':
        await member.send(`🚫 **You have been permanently banned**\nReason: ${reason}`).catch(() => {});
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
      const isAllowed = AUTOMOD_CONFIG.links.allowedDomains.some(domain => 
        hostname === domain || hostname.endsWith('.' + domain)
      );
      if (!isAllowed) return true;
    } catch {
      return true;
    }
  }
  return false;
}

// ============================================
// RAID PROTECTION
// ============================================
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
    await modLogChannel.send({
      embeds: [new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('🚨 RAID DETECTED - LOCKDOWN ENABLED')
        .setTimestamp()
      ]
    });
  }
  
  setTimeout(() => {
    isRaidMode = false;
    console.log('✅ Raid mode disabled');
  }, AUTOMOD_CONFIG.raid.lockdownMinutes * 60 * 1000);
}

// ============================================
// TICKET SYSTEM
// ============================================
function createTicketEmbed() {
  const embed = new EmbedBuilder()
    .setColor('#3498DB')
    .setTitle('🎫 Support Tickets')
    .setDescription(`
Need help? Create a support ticket!

**Ticket Categories:**
• 💬 **General Support** - Questions about the server
• 🐛 **Bug Report** - Report Lumist.ai issues
• 🎓 **Alumni Verification** - Verify your SAT score

Click the button below to open a ticket.
    `);

  return { embeds: [embed], components: [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('create_ticket').setLabel('🎫 Create Ticket').setStyle(ButtonStyle.Primary)
  )] };
}

function createTicketCategorySelect() {
  return {
    embeds: [new EmbedBuilder().setColor('#3498DB').setTitle('Select Ticket Category')],
    components: [new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('ticket_category')
        .setPlaceholder('Select a category')
        .addOptions([
          { label: 'General Support', value: 'general', emoji: '💬' },
          { label: 'Bug Report', value: 'bug', emoji: '🐛' },
          { label: 'Alumni Verification', value: 'alumni', emoji: '🎓' },
        ])
    )],
    ephemeral: true
  };
}

async function createTicketChannel(guild, user, category) {
  if (activeTickets.has(user.id)) {
    return { error: `You already have an open ticket: <#${activeTickets.get(user.id)}>` };
  }

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
      embeds: [new EmbedBuilder()
        .setColor('#3498DB')
        .setTitle(`${categoryName[category]} Ticket`)
        .setDescription(`Hello ${user}!\n\n**Ticket ID:** \`${ticketNumber}\`\n\nPlease describe your issue.`)
      ],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('close_ticket').setLabel('🔒 Close Ticket').setStyle(ButtonStyle.Danger)
      )]
    });

    return { channel: ticketChannel };
  } catch (error) {
    console.error('❌ Error creating ticket:', error);
    return { error: 'Failed to create ticket.' };
  }
}

async function closeTicket(channel, closedBy) {
  try {
    for (const [userId, channelId] of activeTickets.entries()) {
      if (channelId === channel.id) {
        activeTickets.delete(userId);
        break;
      }
    }
    await channel.delete('Ticket closed');
  } catch (error) {
    console.error('❌ Error closing ticket:', error);
  }
}

// ============================================
// ONBOARDING MESSAGES
// ============================================
function createWelcomeDM() {
  return {
    embeds: [new EmbedBuilder()
      .setColor('#2ECC71')
      .setTitle('🦊 Hey there! Welcome to Lumist.ai!')
      .setDescription(`
I'm **Lumi**, your friendly fox guide! 🌸

Before you can access the server, I need to ask you a couple quick questions. This only takes **30 seconds**!

**What I'll ask:**
1️⃣ Where are you from?
2️⃣ What grade are you in?
3️⃣ Accept the community rules

Ready? Click the button below! 👇
      `)
      .setThumbnail('https://i.imgur.com/AfFp7pu.png')
    ],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('start_onboarding').setLabel('🚀 Let\'s Go!').setStyle(ButtonStyle.Primary)
    )]
  };
}

function createNationalitySelect() {
  return {
    embeds: [new EmbedBuilder().setColor('#3498DB').setTitle('🌍 Step 1 of 2: Where are you from?')],
    components: [new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('select_nationality')
        .setPlaceholder('Select your country/region')
        .addOptions([
          { label: 'Vietnam', value: 'vietnam', emoji: '🇻🇳' },
          { label: 'United States', value: 'usa', emoji: '🇺🇸' },
          { label: 'United Kingdom', value: 'uk', emoji: '🇬🇧' },
          { label: 'Singapore', value: 'singapore', emoji: '🇸🇬' },
          { label: 'South Korea', value: 'korea', emoji: '🇰🇷' },
          { label: 'Japan', value: 'japan', emoji: '🇯🇵' },
          { label: 'China', value: 'china', emoji: '🇨🇳' },
          { label: 'India', value: 'india', emoji: '🇮🇳' },
          { label: 'Other', value: 'other', emoji: '🌏' },
        ])
    )]
  };
}

function createGradeSelect() {
  return {
    embeds: [new EmbedBuilder().setColor('#3498DB').setTitle('🎒 Step 2 of 2: What grade are you in?')],
    components: [new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('select_grade')
        .setPlaceholder('Select your grade level')
        .addOptions([
          { label: 'Freshman (Grade 9)', value: 'freshman', emoji: '📗' },
          { label: 'Sophomore (Grade 10)', value: 'sophomore', emoji: '📘' },
          { label: 'Junior (Grade 11)', value: 'junior', emoji: '📙' },
          { label: 'Senior (Grade 12)', value: 'senior', emoji: '📕' },
          { label: 'Gap Year / Other', value: 'gap_year', emoji: '📓' },
        ])
    )]
  };
}

function createRulesAcceptance() {
  return {
    embeds: [new EmbedBuilder()
      .setColor('#E74C3C')
      .setTitle('📜 Almost done! Accept the rules')
      .setDescription(`
**1. Be Respectful** - No harassment
**2. No Spam** - Keep it clean
**3. Stay On Topic** - Use right channels
**4. No Cheating** - Earn your score honestly
**5. Protect Privacy** - Keep info safe
**6. No NSFW** - Educational server
**7. Follow Discord ToS**
**8. Listen to Staff**
      `)
    ],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('accept_rules').setLabel('✅ I Accept').setStyle(ButtonStyle.Success)
    )]
  };
}

function createCompletionMessage() {
  return {
    embeds: [new EmbedBuilder()
      .setColor('#2ECC71')
      .setTitle('🎉 You\'re all set!')
      .setDescription(`Welcome to **Lumist.ai**!\n\n📝 Introduce yourself in **#introductions**\n🔗 Link your account in **#verify**\n💬 Say hi in **#general**\n\n🦊 **Tip:** You can DM me anytime or mention me in channels if you have questions about Lumist!`)
    ],
    components: []
  };
}

// ============================================
// EVENT: BOT READY
// ============================================
client.once(Events.ClientReady, async () => {
  console.log('═══════════════════════════════════════════════════════');
  console.log(`🦊 Lumi Bot v4.1 is online!`);
  console.log(`   Logged in as: ${client.user.tag}`);
  console.log(`   Serving guild: ${GUILD_ID}`);
  console.log(`   Analytics: ${SUPABASE_SERVICE_KEY ? 'ENABLED' : 'DISABLED'}`);
  console.log(`   Chatbot: ${N8N_WEBHOOK_URL ? 'ENABLED' : 'DISABLED'}`);
  console.log(`   Started at: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════');
  
  await registerCommands();
  
  // Start analytics collection
  if (SUPABASE_SERVICE_KEY) {
    console.log(`📊 Starting analytics collection (every ${ANALYTICS_INTERVAL / 1000}s)...`);
    setTimeout(() => collectServerStats(), 5000);
    setInterval(collectServerStats, ANALYTICS_INTERVAL);
  }
  
  console.log('');
  console.log('📋 Active features:');
  console.log('   • Onboarding system');
  console.log('   • Auto-moderation');
  console.log('   • Slash commands');
  console.log('   • Ticket system');
  console.log('   • Analytics pipeline');
  if (N8N_WEBHOOK_URL) console.log('   • AI Chatbot (n8n)');
  console.log('');
});

// ============================================
// EVENT: NEW MEMBER JOINS
// ============================================
client.on(Events.GuildMemberAdd, async (member) => {
  console.log(`👋 New member joined: ${member.user.tag}`);
  
  await logMemberEvent('join', member);
  
  joinHistory.push(Date.now());
  const now = Date.now();
  while (joinHistory.length > 0 && now - joinHistory[0] > AUTOMOD_CONFIG.raid.timeWindow) {
    joinHistory.shift();
  }
  
  if (checkForRaid()) {
    await enableRaidMode(member.guild);
  }
  
  if (isRaidMode) {
    await member.send('⚠️ Server is in lockdown mode. Try again later.').catch(() => {});
    await member.kick('Raid protection');
    return;
  }
  
  onboardingState.set(member.user.id, { nationality: null, grade: null, guildId: member.guild.id });
  
  try {
    await member.send(createWelcomeDM());
    console.log(`   ✅ Sent welcome DM to ${member.user.tag}`);
  } catch (error) {
    console.log(`   ❌ Could not DM ${member.user.tag}`);
    const welcomeChannel = await findChannel(member.guild, CHANNELS.WELCOME);
    if (welcomeChannel) {
      await welcomeChannel.send({
        embeds: [new EmbedBuilder().setColor('#FFA500').setDescription(`Hey ${member}! Enable DMs and click below to start.`)],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('start_onboarding').setLabel('🚀 Start').setStyle(ButtonStyle.Primary)
        )]
      });
    }
  }
});

// ============================================
// EVENT: MEMBER LEAVES
// ============================================
client.on(Events.GuildMemberRemove, async (member) => {
  console.log(`👋 Member left: ${member.user.tag}`);
  
  const hadMemberRole = member.roles.cache.some(r => r.name === ROLES.MEMBER);
  
  await logMemberEvent('leave', member, {
    had_member_role: hadMemberRole,
    roles: member.roles.cache.map(r => r.name),
  });
});

// ============================================
// EVENT: MESSAGE CREATE (Auto-Mod + Analytics + Chatbot)
// ============================================
client.on(Events.MessageCreate, async (message) => {
  // Ignore bot messages
  if (message.author.bot) return;
  
  // Track for analytics (only guild messages)
  if (message.guild) {
    trackMessage(message);
  }
  
  // Check if should trigger chatbot
  if (shouldTriggerChatbot(message)) {
    await handleChatbotMessage(message);
    return; // Skip auto-mod for chatbot messages
  }
  
  // Auto-mod only applies to guild messages
  if (!message.guild) return;
  if (isStaff(message.member)) return;
  
  let violation = null;
  let reason = null;
  
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

// ============================================
// EVENT: ROLE UPDATES (Track verification/premium)
// ============================================
client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  const oldRoles = oldMember.roles.cache;
  const newRoles = newMember.roles.cache;
  
  const verifiedRole = newRoles.find(r => r.name === ROLES.VERIFIED);
  const hadVerified = oldRoles.some(r => r.name === ROLES.VERIFIED);
  if (verifiedRole && !hadVerified) {
    await logMemberEvent('verified', newMember);
    console.log(`✅ ${newMember.user.tag} is now verified`);
  }
  
  const premiumRole = newRoles.find(r => r.name === ROLES.PREMIUM);
  const hadPremium = oldRoles.some(r => r.name === ROLES.PREMIUM);
  if (premiumRole && !hadPremium) {
    await logMemberEvent('premium_added', newMember);
    console.log(`💎 ${newMember.user.tag} is now premium`);
  }
  
  if (!premiumRole && hadPremium) {
    await logMemberEvent('premium_removed', newMember);
    console.log(`📉 ${newMember.user.tag} lost premium`);
  }
});

// ============================================
// EVENT: INTERACTIONS
// ============================================
client.on(Events.InteractionCreate, async (interaction) => {
  // ---- SLASH COMMANDS ----
  if (interaction.isChatInputCommand()) {
    const { commandName, options } = interaction;
    
    // /ask command for chatbot
    if (commandName === 'ask') {
      if (!N8N_WEBHOOK_URL) {
        return interaction.reply({ content: '🦊 Sorry, the chatbot is not configured yet!', ephemeral: true });
      }
      
      const question = options.getString('question');
      await interaction.deferReply();
      
      // Create a fake message object for the chatbot handler
      const fakeMessage = {
        content: question,
        author: interaction.user,
        member: interaction.member,
        channel: interaction.channel,
      };
      
      const result = await sendToN8nChatbot(fakeMessage, false);
      
      if (!result.success) {
        await interaction.editReply('🦊 Oops! I had a little hiccup. Try again in a moment!');
        return;
      }
      
      const responseText = result.response || "I'm not sure how to answer that!";
      const chunks = splitMessage(responseText, 1900);
      
      await interaction.editReply(chunks[0]);
      for (let i = 1; i < chunks.length; i++) {
        await interaction.followUp(chunks[i]);
      }
      
      console.log(`💬 /ask command used by ${interaction.user.tag}`);
      return;
    }
    
    if (commandName === 'warn') {
      const user = options.getUser('user');
      const reason = options.getString('reason');
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) return interaction.reply({ content: '❌ User not found.', ephemeral: true });
      const warningCount = addWarning(user.id, reason, interaction.user.tag);
      await logModAction(interaction.guild, 'Warning Issued', user, interaction.user, `${reason} (Warning #${warningCount})`, '#FFA500');
      await member.send(`⚠️ **Warning**\nReason: ${reason}\nThis is warning #${warningCount}.`).catch(() => {});
      await interaction.reply({ content: `✅ Warned **${user.tag}** (Warning #${warningCount})`, ephemeral: true });
    }
    
    if (commandName === 'mute') {
      const user = options.getUser('user');
      const duration = options.getInteger('duration');
      const reason = options.getString('reason') || 'No reason';
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) return interaction.reply({ content: '❌ User not found.', ephemeral: true });
      try {
        await member.timeout(duration * 60 * 1000, reason);
        await logModAction(interaction.guild, `Muted (${duration} min)`, user, interaction.user, reason, '#E67E22');
        await interaction.reply({ content: `✅ Muted **${user.tag}** for ${duration} minutes.`, ephemeral: true });
      } catch (e) {
        await interaction.reply({ content: `❌ Failed: ${e.message}`, ephemeral: true });
      }
    }
    
    if (commandName === 'unmute') {
      const user = options.getUser('user');
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) return interaction.reply({ content: '❌ User not found.', ephemeral: true });
      try {
        await member.timeout(null);
        await logModAction(interaction.guild, 'Unmuted', user, interaction.user, 'Manual', '#2ECC71');
        await interaction.reply({ content: `✅ Unmuted **${user.tag}**.`, ephemeral: true });
      } catch (e) {
        await interaction.reply({ content: `❌ Failed: ${e.message}`, ephemeral: true });
      }
    }
    
    if (commandName === 'kick') {
      const user = options.getUser('user');
      const reason = options.getString('reason') || 'No reason';
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) return interaction.reply({ content: '❌ User not found.', ephemeral: true });
      try {
        await member.kick(reason);
        await logModAction(interaction.guild, 'Kicked', user, interaction.user, reason, '#E74C3C');
        await interaction.reply({ content: `✅ Kicked **${user.tag}**.`, ephemeral: true });
      } catch (e) {
        await interaction.reply({ content: `❌ Failed: ${e.message}`, ephemeral: true });
      }
    }
    
    if (commandName === 'ban') {
      const user = options.getUser('user');
      const reason = options.getString('reason') || 'No reason';
      const days = options.getInteger('days') || 0;
      try {
        await interaction.guild.members.ban(user.id, { deleteMessageSeconds: days * 86400, reason });
        await logModAction(interaction.guild, 'Banned', user, interaction.user, reason, '#992D22');
        await interaction.reply({ content: `✅ Banned **${user.tag}**.`, ephemeral: true });
      } catch (e) {
        await interaction.reply({ content: `❌ Failed: ${e.message}`, ephemeral: true });
      }
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
      const amount = options.getInteger('amount');
      const targetUser = options.getUser('user');
      try {
        let messages = await interaction.channel.messages.fetch({ limit: amount + 1 });
        if (targetUser) messages = messages.filter(m => m.author.id === targetUser.id);
        const deleted = await interaction.channel.bulkDelete(messages.first(amount), true);
        await interaction.reply({ content: `✅ Deleted ${deleted.size} messages.`, ephemeral: true });
      } catch (e) {
        await interaction.reply({ content: `❌ Failed: ${e.message}`, ephemeral: true });
      }
    }
    
    if (commandName === 'ticket') {
      await interaction.reply(createTicketCategorySelect());
    }
    
    if (commandName === 'close') {
      if (!interaction.channel.name.startsWith('ticket-')) {
        return interaction.reply({ content: '❌ Use in ticket channels only.', ephemeral: true });
      }
      await interaction.reply({ content: '🔒 Closing...', ephemeral: true });
      await closeTicket(interaction.channel, interaction.user);
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
      
      const embed = new EmbedBuilder()
        .setColor('#3498DB')
        .setTitle('📊 Server Statistics')
        .addFields(
          { name: 'Total Members', value: `${total}`, inline: true },
          { name: 'Online', value: `${online}`, inline: true },
          { name: 'Onboarded', value: `${onboarded}`, inline: true },
          { name: 'Verified', value: `${verified}`, inline: true },
          { name: 'Premium', value: `${premium}`, inline: true },
        )
        .setTimestamp();
      
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
  }
  
  // ---- BUTTONS ----
  if (interaction.isButton()) {
    if (interaction.customId === 'start_onboarding') {
      if (!onboardingState.has(interaction.user.id)) {
        onboardingState.set(interaction.user.id, { nationality: null, grade: null, guildId: GUILD_ID });
      }
      await interaction.update(createNationalitySelect());
    }
    
    if (interaction.customId === 'accept_rules') {
      const state = onboardingState.get(interaction.user.id);
      if (!state) return interaction.reply({ content: '❌ Error. Try again.', ephemeral: true });
      
      try {
        const guild = await client.guilds.fetch(state.guildId || GUILD_ID);
        const member = await guild.members.fetch(interaction.user.id);
        
        const rolesToAssign = [ROLES.MEMBER, getNationalityRole(state.nationality), getGradeRole(state.grade)];
        
        for (const roleName of rolesToAssign) {
          if (roleName) {
            const role = await findRole(guild, roleName);
            if (role) await member.roles.add(role);
          }
        }
        
        await interaction.update(createCompletionMessage());
        
        await logMemberEvent('onboarding_complete', member, {
          nationality: state.nationality,
          grade: state.grade,
        });
        
        const introChannel = await findChannel(guild, CHANNELS.INTRODUCTIONS);
        if (introChannel) {
          await introChannel.send({
            embeds: [new EmbedBuilder().setColor('#2ECC71').setDescription(`🎉 Welcome ${member} to **Lumist.ai**!`).setTimestamp()]
          });
        }
        
        onboardingState.delete(interaction.user.id);
        console.log(`🎉 ${interaction.user.tag} completed onboarding!`);
      } catch (error) {
        console.error('❌ Error:', error);
        await interaction.reply({ content: '❌ Error. Contact a moderator.', ephemeral: true });
      }
    }
    
    if (interaction.customId === 'create_ticket') {
      await interaction.reply(createTicketCategorySelect());
    }
    
    if (interaction.customId === 'close_ticket') {
      await interaction.reply({ content: '🔒 Closing...', ephemeral: true });
      await closeTicket(interaction.channel, interaction.user);
    }
  }
  
  // ---- SELECT MENUS ----
  if (interaction.isStringSelectMenu()) {
    const state = onboardingState.get(interaction.user.id) || { nationality: null, grade: null, guildId: GUILD_ID };
    
    if (interaction.customId === 'select_nationality') {
      state.nationality = interaction.values[0];
      onboardingState.set(interaction.user.id, state);
      await interaction.update(createGradeSelect());
    }
    
    if (interaction.customId === 'select_grade') {
      state.grade = interaction.values[0];
      onboardingState.set(interaction.user.id, state);
      await interaction.update(createRulesAcceptance());
    }
    
    if (interaction.customId === 'ticket_category') {
      const result = await createTicketChannel(interaction.guild, interaction.user, interaction.values[0]);
      if (result.error) {
        await interaction.update({ content: `❌ ${result.error}`, embeds: [], components: [] });
      } else {
        await interaction.update({ content: `✅ Ticket created! <#${result.channel.id}>`, embeds: [], components: [] });
      }
    }
  }
});

// ============================================
// ERROR HANDLING
// ============================================
client.on('error', (error) => console.error('❌ Client error:', error));
process.on('unhandledRejection', (error) => console.error('❌ Unhandled rejection:', error));
process.on('SIGTERM', () => { client.destroy(); server.close(); process.exit(0); });

// ============================================
// LOGIN
// ============================================
console.log('🔄 Connecting to Discord...');
client.login(BOT_TOKEN);
