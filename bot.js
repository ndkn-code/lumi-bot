/**
 * Lumist.ai Discord Bot v3.1
 * 
 * Changes in v3.1:
 * - Removed score range from onboarding (needs verification instead)
 * - Simplified onboarding: Nationality → Grade → Rules → Done
 * - Clearer welcome DM messaging
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
} = require('discord.js');

const http = require('http');

// ============================================
// CONFIGURATION
// ============================================
const BOT_TOKEN = process.env.BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID || '1456886174600794291';
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN) {
  console.error('❌ Error: BOT_TOKEN environment variable is not set');
  process.exit(1);
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
};

// Roles
const ROLES = {
  MEMBER: '🌱 Member',
  VERIFIED: '✅ Verified',
  PREMIUM: '💎 Premium',
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
  ],
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
        await member.send(`⚠️ **Warning from Lumist.ai Server**\nReason: ${reason}\n\nThis is warning #${warningCount}. Please follow the server rules.`).catch(() => {});
        await logModAction(guild, 'Warning Issued', member.user, 'Auto-Mod', `${reason} (Warning #${warningCount})`, '#FFA500');
        break;
      case 'mute_1h':
        await member.timeout(60 * 60 * 1000, reason);
        await member.send(`🔇 **You have been muted for 1 hour**\nReason: ${reason}\n\nThis is warning #${warningCount}.`).catch(() => {});
        await logModAction(guild, 'Muted (1 hour)', member.user, 'Auto-Mod', `${reason} (Warning #${warningCount})`, '#E67E22');
        break;
      case 'mute_24h':
        await member.timeout(24 * 60 * 60 * 1000, reason);
        await member.send(`🔇 **You have been muted for 24 hours**\nReason: ${reason}\n\nThis is warning #${warningCount}.`).catch(() => {});
        await logModAction(guild, 'Muted (24 hours)', member.user, 'Auto-Mod', `${reason} (Warning #${warningCount})`, '#E74C3C');
        break;
      case 'ban_7d':
        await member.send(`🚫 **You have been banned for 7 days**\nReason: ${reason}`).catch(() => {});
        await member.ban({ deleteMessageSeconds: 86400, reason: `${reason} (Warning #${warningCount})` });
        await logModAction(guild, 'Banned (7 days)', member.user, 'Auto-Mod', `${reason} (Warning #${warningCount})`, '#992D22');
        break;
      case 'ban_permanent':
        await member.send(`🚫 **You have been permanently banned**\nReason: ${reason}`).catch(() => {});
        await member.ban({ deleteMessageSeconds: 86400, reason: `${reason} (Warning #${warningCount})` });
        await logModAction(guild, 'Banned (Permanent)', member.user, 'Auto-Mod', `${reason} (Warning #${warningCount})`, '#1a1a1a');
        break;
    }
    console.log(`⚠️ Warning #${warningCount} issued to ${member.user.tag}: ${action}`);
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
  const duplicateCount = recentMessages.filter(m => m.content === content).length;
  return duplicateCount >= AUTOMOD_CONFIG.duplicates.maxDuplicates;
}

function checkMentionSpam(message) {
  if (!AUTOMOD_CONFIG.mentions.enabled) return false;
  const mentionCount = message.mentions.users.size + message.mentions.roles.size;
  return mentionCount > AUTOMOD_CONFIG.mentions.maxMentions;
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
    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('🚨 RAID DETECTED - LOCKDOWN ENABLED')
      .setDescription(`Detected ${AUTOMOD_CONFIG.raid.joinThreshold}+ joins within ${AUTOMOD_CONFIG.raid.timeWindow / 1000} seconds.`)
      .setTimestamp();
    await modLogChannel.send({ embeds: [embed] });
  }
  
  setTimeout(async () => {
    isRaidMode = false;
    console.log('✅ Raid mode disabled');
    if (modLogChannel) {
      modLogChannel.send({
        embeds: [new EmbedBuilder().setColor('#2ECC71').setTitle('✅ Raid Mode Disabled').setTimestamp()]
      });
    }
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
• 💬 **General Support** - Questions about the server or community
• 🐛 **Bug Report** - Report issues with Lumist.ai platform
• 🎓 **Alumni Verification** - Verify your SAT score and university admission

Click the button below to open a ticket.
    `)
    .setFooter({ text: 'Lumist.ai Support' });

  const buttons = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('create_ticket')
        .setLabel('🎫 Create Ticket')
        .setStyle(ButtonStyle.Primary)
    );

  return { embeds: [embed], components: [buttons] };
}

function createTicketCategorySelect() {
  const embed = new EmbedBuilder()
    .setColor('#3498DB')
    .setTitle('Select Ticket Category')
    .setDescription('What do you need help with?');

  const select = new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('ticket_category')
        .setPlaceholder('Select a category')
        .addOptions([
          { label: 'General Support', value: 'general', emoji: '💬', description: 'Questions about the server' },
          { label: 'Bug Report', value: 'bug', emoji: '🐛', description: 'Report platform issues' },
          { label: 'Alumni Verification', value: 'alumni', emoji: '🎓', description: 'Verify your SAT score & admission' },
        ])
    );

  return { embeds: [embed], components: [select], ephemeral: true };
}

async function createTicketChannel(guild, user, category) {
  if (activeTickets.has(user.id)) {
    return { error: `You already have an open ticket: <#${activeTickets.get(user.id)}>` };
  }

  const categoryEmoji = { general: '💬', bug: '🐛', alumni: '🎓' };
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
      topic: `Ticket by ${user.tag} | Category: ${categoryName[category]} | Created: ${new Date().toISOString()}`,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
        ...(modRole ? [{ id: modRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageMessages] }] : []),
        ...(adminRole ? [{ id: adminRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }] : []),
        ...(founderRole ? [{ id: founderRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] }] : []),
      ],
    });

    activeTickets.set(user.id, ticketChannel.id);

    // Different welcome messages based on category
    let instructions = '';
    if (category === 'alumni') {
      instructions = `
**To verify as Alumni, please provide:**
1. 📸 Screenshot of your official SAT score
2. 📸 Screenshot of your university admission letter/portal

A moderator will review and assign the 🎓 Alumni role.`;
    } else if (category === 'bug') {
      instructions = `
**Please describe the bug:**
1. What were you trying to do?
2. What happened instead?
3. Screenshots if possible`;
    } else {
      instructions = `
Please describe your issue and a staff member will assist you soon.`;
    }

    const welcomeEmbed = new EmbedBuilder()
      .setColor('#3498DB')
      .setTitle(`${categoryEmoji[category]} ${categoryName[category]} Ticket`)
      .setDescription(`
Hello ${user}! Thanks for creating a ticket.

**Ticket ID:** \`${ticketNumber}\`
**Category:** ${categoryName[category]}
${instructions}
      `)
      .setTimestamp()
      .setFooter({ text: 'Use the button below to close this ticket' });

    const closeButton = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('close_ticket')
          .setLabel('🔒 Close Ticket')
          .setStyle(ButtonStyle.Danger)
      );

    await ticketChannel.send({ content: `${user} | ${modRole ? `<@&${modRole.id}>` : 'Staff'}`, embeds: [welcomeEmbed], components: [closeButton] });

    const modLogChannel = await findChannel(guild, CHANNELS.MOD_LOGS);
    if (modLogChannel) {
      const logEmbed = new EmbedBuilder()
        .setColor('#3498DB')
        .setTitle('🎫 Ticket Created')
        .addFields(
          { name: 'User', value: `${user} (${user.id})`, inline: true },
          { name: 'Category', value: categoryName[category], inline: true },
          { name: 'Channel', value: `<#${ticketChannel.id}>`, inline: true }
        )
        .setTimestamp();
      await modLogChannel.send({ embeds: [logEmbed] });
    }

    return { channel: ticketChannel };
  } catch (error) {
    console.error('❌ Error creating ticket:', error);
    return { error: 'Failed to create ticket. Please contact a moderator.' };
  }
}

async function closeTicket(channel, closedBy) {
  const guild = channel.guild;
  
  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    const transcript = messages.reverse().map(m => 
      `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content}${m.attachments.size > 0 ? ' [Attachments: ' + m.attachments.map(a => a.url).join(', ') + ']' : ''}`
    ).join('\n');

    const topicMatch = channel.topic?.match(/Ticket by (.+?) \|/);
    const ticketOwner = topicMatch ? topicMatch[1] : 'Unknown';

    for (const [userId, channelId] of activeTickets.entries()) {
      if (channelId === channel.id) {
        activeTickets.delete(userId);
        break;
      }
    }

    const modLogChannel = await findChannel(guild, CHANNELS.MOD_LOGS);
    if (modLogChannel) {
      const logEmbed = new EmbedBuilder()
        .setColor('#E74C3C')
        .setTitle('🎫 Ticket Closed')
        .addFields(
          { name: 'Channel', value: channel.name, inline: true },
          { name: 'Closed By', value: `${closedBy}`, inline: true },
          { name: 'Original Creator', value: ticketOwner, inline: true }
        )
        .setTimestamp();

      const transcriptBuffer = Buffer.from(transcript, 'utf-8');
      await modLogChannel.send({ 
        embeds: [logEmbed],
        files: [{ attachment: transcriptBuffer, name: `${channel.name}-transcript.txt` }]
      });
    }

    await channel.delete('Ticket closed');
    console.log(`🎫 Ticket closed: ${channel.name} by ${closedBy.tag}`);

  } catch (error) {
    console.error('❌ Error closing ticket:', error);
    throw error;
  }
}

// ============================================
// ONBOARDING MESSAGES (Simplified - No Score Range)
// ============================================
function createWelcomeDM() {
  const embed = new EmbedBuilder()
    .setColor('#2ECC71')
    .setTitle('🦊 Hey there! Welcome to Lumist.ai!')
    .setDescription(`
I'm **Lumi**, your friendly fox guide! 🌸

Before you can access the server, I need to ask you a couple quick questions. This only takes **30 seconds**!

**What I'll ask:**
1️⃣ Where are you from?
2️⃣ What grade are you in?
3️⃣ Accept the community rules

Ready? Click the button below to start! 👇
    `)
    .setThumbnail('https://i.imgur.com/AfFp7pu.png')
    .setFooter({ text: 'Lumist.ai • AI-Powered SAT Prep' });

  const button = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('start_onboarding')
        .setLabel('🚀 Let\'s Go!')
        .setStyle(ButtonStyle.Primary)
    );

  return { embeds: [embed], components: [button] };
}

function createNationalitySelect() {
  const embed = new EmbedBuilder()
    .setColor('#3498DB')
    .setTitle('🌍 Step 1 of 2: Where are you from?')
    .setDescription('This helps us connect you with students from your region!');

  const select = new ActionRowBuilder()
    .addComponents(
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
          { label: 'Other / International', value: 'other', emoji: '🌏' },
        ])
    );

  return { embeds: [embed], components: [select] };
}

function createGradeSelect() {
  const embed = new EmbedBuilder()
    .setColor('#3498DB')
    .setTitle('🎒 Step 2 of 2: What grade are you in?')
    .setDescription('This helps us connect you with peers at the same stage!');

  const select = new ActionRowBuilder()
    .addComponents(
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
    );

  return { embeds: [embed], components: [select] };
}

function createRulesAcceptance() {
  const embed = new EmbedBuilder()
    .setColor('#E74C3C')
    .setTitle('📜 Almost done! Accept the rules')
    .setDescription(`
Please read and agree to our community rules:

**1. Be Respectful** - No harassment or hate speech
**2. No Spam** - Keep it clean
**3. Stay On Topic** - Use the right channels
**4. No Cheating** - Earn your score honestly
**5. Protect Privacy** - Keep personal info safe
**6. No NSFW** - This is an educational server
**7. Follow Discord ToS** - Standard rules apply
**8. Listen to Staff** - Mods have final say

By clicking "I Accept", you agree to follow these rules.
    `);

  const button = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('accept_rules')
        .setLabel('✅ I Accept the Rules')
        .setStyle(ButtonStyle.Success)
    );

  return { embeds: [embed], components: [button] };
}

function createCompletionMessage() {
  const embed = new EmbedBuilder()
    .setColor('#2ECC71')
    .setTitle('🎉 You\'re all set!')
    .setDescription(`
Welcome to the **Lumist.ai** community! You now have full access.

**What to do next:**
📝 Introduce yourself in **#introductions**
📚 Check out the **SAT study channels**
🔗 Link your Lumist.ai account in **#verify** to appear on leaderboards
💬 Say hi in **#general**

Good luck on your SAT journey! 🚀
    `);

  return { embeds: [embed], components: [] };
}

// ============================================
// EVENT: BOT READY
// ============================================
client.once(Events.ClientReady, async () => {
  console.log('═══════════════════════════════════════════════════════');
  console.log(`🦊 Lumi Bot v3.1 is online!`);
  console.log(`   Logged in as: ${client.user.tag}`);
  console.log(`   Serving guild: ${GUILD_ID}`);
  console.log(`   Started at: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════');
  
  await registerCommands();
  
  console.log('');
  console.log('📋 Active features:');
  console.log('   • Onboarding (Nationality → Grade → Rules)');
  console.log('   • Auto-moderation');
  console.log('   • Slash commands');
  console.log('   • Ticket system');
  console.log('');
});

// ============================================
// EVENT: NEW MEMBER JOINS
// ============================================
client.on(Events.GuildMemberAdd, async (member) => {
  console.log(`👋 New member joined: ${member.user.tag}`);
  
  joinHistory.push(Date.now());
  const now = Date.now();
  while (joinHistory.length > 0 && now - joinHistory[0] > AUTOMOD_CONFIG.raid.timeWindow) {
    joinHistory.shift();
  }
  
  if (checkForRaid()) {
    await enableRaidMode(member.guild);
  }
  
  if (isRaidMode) {
    try {
      await member.send('⚠️ The server is currently in lockdown mode. Please try joining again later.');
      await member.kick('Raid protection');
      return;
    } catch (error) {
      console.error(`❌ Error kicking during raid: ${error.message}`);
    }
  }
  
  // Simplified state - no score
  onboardingState.set(member.user.id, {
    nationality: null,
    grade: null,
    guildId: member.guild.id,
  });
  
  try {
    await member.send(createWelcomeDM());
    console.log(`   ✅ Sent welcome DM to ${member.user.tag}`);
  } catch (error) {
    console.log(`   ❌ Could not DM ${member.user.tag}`);
    const welcomeChannel = await findChannel(member.guild, CHANNELS.WELCOME);
    if (welcomeChannel) {
      const fallbackEmbed = new EmbedBuilder()
        .setColor('#FFA500')
        .setDescription(`Hey ${member}! 🦊 I couldn't send you a DM.\n\n**Please enable DMs from server members**, then click the button below to start onboarding.`);
      const button = new ActionRowBuilder()
        .addComponents(new ButtonBuilder().setCustomId('start_onboarding').setLabel('🚀 Start Onboarding').setStyle(ButtonStyle.Primary));
      await welcomeChannel.send({ embeds: [fallbackEmbed], components: [button] });
    }
  }
});

// ============================================
// EVENT: MESSAGE CREATE (Auto-Mod)
// ============================================
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;
  if (isStaff(message.member)) return;
  
  let violation = null;
  let reason = null;
  
  if (checkBannedWords(message)) { violation = 'banned_words'; reason = 'Using prohibited language'; }
  else if (checkLinks(message)) { violation = 'unapproved_link'; reason = 'Posting unapproved links'; }
  else if (checkMentionSpam(message)) { violation = 'mention_spam'; reason = 'Mention spam'; }
  else if (checkSpam(message)) { violation = 'spam'; reason = 'Message spam'; }
  else if (checkDuplicates(message)) { violation = 'duplicate'; reason = 'Duplicate messages'; }
  
  if (violation) {
    try {
      await message.delete();
      console.log(`🗑️ Deleted message from ${message.author.tag}: ${violation}`);
      const warningCount = addWarning(message.author.id, reason);
      await executeWarningAction(message.member, warningCount, reason, message.guild);
      const feedback = await message.channel.send({ content: `⚠️ ${message.author}, your message was removed: **${reason}**` });
      setTimeout(() => feedback.delete().catch(() => {}), 5000);
    } catch (error) {
      console.error(`❌ Auto-mod error: ${error.message}`);
    }
  }
});

// ============================================
// EVENT: INTERACTIONS
// ============================================
client.on(Events.InteractionCreate, async (interaction) => {
  // ---- SLASH COMMANDS ----
  if (interaction.isChatInputCommand()) {
    const { commandName, options } = interaction;
    
    if (commandName === 'warn') {
      const user = options.getUser('user');
      const reason = options.getString('reason');
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) return interaction.reply({ content: '❌ User not found.', ephemeral: true });
      const warningCount = addWarning(user.id, reason, interaction.user.tag);
      await logModAction(interaction.guild, 'Warning Issued', user, interaction.user, `${reason} (Warning #${warningCount})`, '#FFA500');
      await member.send(`⚠️ **Warning from Lumist.ai Server**\nReason: ${reason}\nModerator: ${interaction.user.tag}\n\nThis is warning #${warningCount}.`).catch(() => {});
      await interaction.reply({ content: `✅ Warned **${user.tag}** (Warning #${warningCount})\nReason: ${reason}`, ephemeral: true });
    }
    
    if (commandName === 'mute') {
      const user = options.getUser('user');
      const duration = options.getInteger('duration');
      const reason = options.getString('reason') || 'No reason provided';
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) return interaction.reply({ content: '❌ User not found.', ephemeral: true });
      try {
        await member.timeout(duration * 60 * 1000, reason);
        await logModAction(interaction.guild, `Muted (${duration} min)`, user, interaction.user, reason, '#E67E22');
        await interaction.reply({ content: `✅ Muted **${user.tag}** for ${duration} minutes.`, ephemeral: true });
      } catch (error) {
        await interaction.reply({ content: `❌ Failed: ${error.message}`, ephemeral: true });
      }
    }
    
    if (commandName === 'unmute') {
      const user = options.getUser('user');
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) return interaction.reply({ content: '❌ User not found.', ephemeral: true });
      try {
        await member.timeout(null);
        await logModAction(interaction.guild, 'Unmuted', user, interaction.user, 'Manual unmute', '#2ECC71');
        await interaction.reply({ content: `✅ Unmuted **${user.tag}**.`, ephemeral: true });
      } catch (error) {
        await interaction.reply({ content: `❌ Failed: ${error.message}`, ephemeral: true });
      }
    }
    
    if (commandName === 'kick') {
      const user = options.getUser('user');
      const reason = options.getString('reason') || 'No reason provided';
      const member = await interaction.guild.members.fetch(user.id).catch(() => null);
      if (!member) return interaction.reply({ content: '❌ User not found.', ephemeral: true });
      try {
        await member.send(`👢 **You have been kicked from Lumist.ai**\nReason: ${reason}`).catch(() => {});
        await member.kick(reason);
        await logModAction(interaction.guild, 'Kicked', user, interaction.user, reason, '#E74C3C');
        await interaction.reply({ content: `✅ Kicked **${user.tag}**.`, ephemeral: true });
      } catch (error) {
        await interaction.reply({ content: `❌ Failed: ${error.message}`, ephemeral: true });
      }
    }
    
    if (commandName === 'ban') {
      const user = options.getUser('user');
      const reason = options.getString('reason') || 'No reason provided';
      const days = options.getInteger('days') || 0;
      try {
        await user.send(`🚫 **You have been banned from Lumist.ai**\nReason: ${reason}`).catch(() => {});
        await interaction.guild.members.ban(user.id, { deleteMessageSeconds: days * 86400, reason });
        await logModAction(interaction.guild, 'Banned', user, interaction.user, reason, '#992D22');
        await interaction.reply({ content: `✅ Banned **${user.tag}**.`, ephemeral: true });
      } catch (error) {
        await interaction.reply({ content: `❌ Failed: ${error.message}`, ephemeral: true });
      }
    }
    
    if (commandName === 'warnings') {
      const user = options.getUser('user');
      const warnings = getWarnings(user.id);
      if (warnings.length === 0) return interaction.reply({ content: `✅ **${user.tag}** has no active warnings.`, ephemeral: true });
      const warningList = warnings.map((w, i) => `**#${i + 1}** - ${new Date(w.timestamp).toLocaleDateString()}\nReason: ${w.reason}\nBy: ${w.moderator}`).join('\n\n');
      const embed = new EmbedBuilder()
        .setColor('#FFA500')
        .setTitle(`⚠️ Warnings for ${user.tag}`)
        .setDescription(warningList)
        .setFooter({ text: `Total: ${warnings.length} | Expire after ${AUTOMOD_CONFIG.warnings.expireDays} days` });
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
    
    if (commandName === 'clearwarnings') {
      const user = options.getUser('user');
      clearWarnings(user.id);
      await logModAction(interaction.guild, 'Warnings Cleared', user, interaction.user, 'All warnings cleared', '#2ECC71');
      await interaction.reply({ content: `✅ Cleared all warnings for **${user.tag}**.`, ephemeral: true });
    }
    
    if (commandName === 'purge') {
      const amount = options.getInteger('amount');
      const targetUser = options.getUser('user');
      try {
        let messages = await interaction.channel.messages.fetch({ limit: amount + 1 });
        if (targetUser) messages = messages.filter(m => m.author.id === targetUser.id);
        const deleted = await interaction.channel.bulkDelete(messages.first(amount), true);
        await interaction.reply({ content: `✅ Deleted ${deleted.size} messages.`, ephemeral: true });
      } catch (error) {
        await interaction.reply({ content: `❌ Failed: ${error.message}`, ephemeral: true });
      }
    }
    
    if (commandName === 'ticket') {
      await interaction.reply(createTicketCategorySelect());
    }
    
    if (commandName === 'close') {
      if (!interaction.channel.name.startsWith('ticket-')) {
        return interaction.reply({ content: '❌ This command can only be used in ticket channels.', ephemeral: true });
      }
      await interaction.reply({ content: '🔒 Closing ticket...', ephemeral: true });
      await closeTicket(interaction.channel, interaction.user);
    }
    
    if (commandName === 'setuptickets') {
      await interaction.channel.send(createTicketEmbed());
      await interaction.reply({ content: '✅ Ticket system set up!', ephemeral: true });
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
      if (!state) return interaction.reply({ content: '❌ Something went wrong. Please try again.', ephemeral: true });
      
      try {
        const guild = await client.guilds.fetch(state.guildId || GUILD_ID);
        const member = await guild.members.fetch(interaction.user.id);
        
        // Only assign: Member, Nationality, Grade (no score)
        const rolesToAssign = [
          ROLES.MEMBER,
          getNationalityRole(state.nationality),
          getGradeRole(state.grade),
        ];
        
        for (const roleName of rolesToAssign) {
          if (roleName) {
            const role = await findRole(guild, roleName);
            if (role) await member.roles.add(role);
          }
        }
        
        await interaction.update(createCompletionMessage());
        
        const introChannel = await findChannel(guild, CHANNELS.INTRODUCTIONS);
        if (introChannel) {
          const welcomeEmbed = new EmbedBuilder()
            .setColor('#2ECC71')
            .setDescription(`🎉 Welcome ${member} to **Lumist.ai**! Say hi and tell us about yourself!`)
            .setTimestamp();
          await introChannel.send({ embeds: [welcomeEmbed] });
        }
        
        onboardingState.delete(interaction.user.id);
        console.log(`🎉 ${interaction.user.tag} completed onboarding!`);
      } catch (error) {
        console.error('❌ Error:', error);
        await interaction.reply({ content: '❌ Error completing onboarding. Please contact a moderator.', ephemeral: true });
      }
    }
    
    if (interaction.customId === 'create_ticket') {
      await interaction.reply(createTicketCategorySelect());
    }
    
    if (interaction.customId === 'close_ticket') {
      await interaction.reply({ content: '🔒 Closing ticket...', ephemeral: true });
      await closeTicket(interaction.channel, interaction.user);
    }
  }
  
  // ---- SELECT MENUS ----
  if (interaction.isStringSelectMenu()) {
    const state = onboardingState.get(interaction.user.id) || { nationality: null, grade: null, guildId: GUILD_ID };
    
    // Simplified flow: Nationality → Grade → Rules
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
      const category = interaction.values[0];
      const result = await createTicketChannel(interaction.guild, interaction.user, category);
      if (result.error) {
        await interaction.update({ content: `❌ ${result.error}`, embeds: [], components: [], ephemeral: true });
      } else {
        await interaction.update({ content: `✅ Ticket created! <#${result.channel.id}>`, embeds: [], components: [], ephemeral: true });
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
