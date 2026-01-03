/**
 * Lumist.ai Discord Bot
 * 
 * Features:
 * - Onboarding system with questionnaire
 * - Auto-moderation (spam, links, banned words, raids)
 * - Warning system with escalation
 * - Mod logging
 * - Health check endpoint for uptime monitoring
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
  AuditLogEvent,
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
  // Spam detection
  spam: {
    enabled: true,
    maxMessages: 5,        // Max messages allowed
    timeWindow: 5000,      // Within this time (ms)
    muteMinutes: 10,       // Mute duration for spam
  },
  
  // Mention spam
  mentions: {
    enabled: true,
    maxMentions: 5,        // Max mentions per message
  },
  
  // Duplicate messages
  duplicates: {
    enabled: true,
    maxDuplicates: 3,      // Same message X times = warning
    timeWindow: 60000,     // Within this time (ms)
  },
  
  // URL allowlist
  links: {
    enabled: true,
    allowedDomains: [
      'lumist.ai',
      'www.lumist.ai',
      'app.lumist.ai',
      'collegeboard.org',
      'www.collegeboard.org',
      'khanacademy.org',
      'www.khanacademy.org',
      'youtube.com',
      'www.youtube.com',
      'youtu.be',
      'discord.com',
      'discord.gg',
      'imgur.com',
      'i.imgur.com',
      'gyazo.com',
      'tenor.com',
      'giphy.com',
    ],
  },
  
  // Banned words (add more as needed)
  bannedWords: {
    enabled: true,
    words: [
      // Add banned words/slurs here
      // Example: 'badword1', 'badword2'
    ],
    // Regex patterns for more complex filtering
    patterns: [
      // Example: /n[i1!|]gg[e3]r/gi
    ],
  },
  
  // Raid protection
  raid: {
    enabled: true,
    joinThreshold: 10,     // X joins within timeWindow = raid
    timeWindow: 60000,     // 1 minute
    lockdownMinutes: 5,    // Auto-lockdown duration
  },
  
  // Warning escalation
  warnings: {
    expireDays: 30,        // Warnings expire after X days
    escalation: {
      1: 'warn',           // 1st warning: just warn
      2: 'mute_1h',        // 2nd warning: 1 hour mute
      3: 'mute_24h',       // 3rd warning: 24 hour mute
      4: 'ban_7d',         // 4th warning: 7 day ban
      5: 'ban_permanent',  // 5th warning: permanent ban
    },
  },
};

// Channel names
const CHANNELS = {
  INTRODUCTIONS: 'introductions',
  WELCOME: 'welcome',
  RULES: 'rules',
  MOD_LOGS: 'mod-logs',
  STAFF_CHAT: 'staff-chat',
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
  // Score ranges
  SCORE_BELOW_1000: '📊 Below 1000',
  SCORE_1000_1200: '📊 1000-1200',
  SCORE_1200_1400: '📊 1200-1400',
  SCORE_1400_1500: '📊 1400-1500',
  SCORE_1500_PLUS: '📊 1500+',
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
const messageHistory = new Map();      // For spam detection
const duplicateHistory = new Map();    // For duplicate detection
const joinHistory = [];                // For raid detection
const userWarnings = new Map();        // Warning tracking
let isRaidMode = false;

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
    'vietnam': ROLES.VIETNAM,
    'usa': ROLES.USA,
    'uk': ROLES.UK,
    'singapore': ROLES.SINGAPORE,
    'korea': ROLES.KOREA,
    'japan': ROLES.JAPAN,
    'china': ROLES.CHINA,
    'india': ROLES.INDIA,
    'other': ROLES.OTHER,
  };
  return map[value];
}

function getScoreRole(value) {
  const map = {
    'below_1000': ROLES.SCORE_BELOW_1000,
    '1000_1200': ROLES.SCORE_1000_1200,
    '1200_1400': ROLES.SCORE_1200_1400,
    '1400_1500': ROLES.SCORE_1400_1500,
    '1500_plus': ROLES.SCORE_1500_PLUS,
  };
  return map[value];
}

function getGradeRole(value) {
  const map = {
    'freshman': ROLES.FRESHMAN,
    'sophomore': ROLES.SOPHOMORE,
    'junior': ROLES.JUNIOR,
    'senior': ROLES.SENIOR,
    'gap_year': ROLES.GAP_YEAR,
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
function getWarningCount(userId) {
  const warnings = userWarnings.get(userId) || [];
  const now = Date.now();
  const validWarnings = warnings.filter(w => 
    now - w.timestamp < AUTOMOD_CONFIG.warnings.expireDays * 24 * 60 * 60 * 1000
  );
  userWarnings.set(userId, validWarnings);
  return validWarnings.length;
}

function addWarning(userId, reason) {
  const warnings = userWarnings.get(userId) || [];
  warnings.push({ timestamp: Date.now(), reason });
  userWarnings.set(userId, warnings);
  return warnings.length;
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
        await member.send(`🚫 **You have been banned for 7 days**\nReason: ${reason}\n\nThis is warning #${warningCount}.`).catch(() => {});
        await member.ban({ deleteMessageSeconds: 86400, reason: `${reason} (Warning #${warningCount})` });
        await logModAction(guild, 'Banned (7 days)', member.user, 'Auto-Mod', `${reason} (Warning #${warningCount})`, '#992D22');
        // Note: 7-day ban requires manual unban or a scheduled task
        break;
        
      case 'ban_permanent':
        await member.send(`🚫 **You have been permanently banned**\nReason: ${reason}\n\nThis was warning #${warningCount}.`).catch(() => {});
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

// Check for spam
function checkSpam(message) {
  if (!AUTOMOD_CONFIG.spam.enabled) return false;
  
  const userId = message.author.id;
  const now = Date.now();
  
  const history = messageHistory.get(userId) || [];
  history.push(now);
  
  // Keep only recent messages
  const recentMessages = history.filter(t => now - t < AUTOMOD_CONFIG.spam.timeWindow);
  messageHistory.set(userId, recentMessages);
  
  return recentMessages.length > AUTOMOD_CONFIG.spam.maxMessages;
}

// Check for duplicate messages
function checkDuplicates(message) {
  if (!AUTOMOD_CONFIG.duplicates.enabled) return false;
  
  const userId = message.author.id;
  const content = message.content.toLowerCase().trim();
  const now = Date.now();
  
  if (content.length < 5) return false; // Ignore very short messages
  
  const history = duplicateHistory.get(userId) || [];
  history.push({ content, timestamp: now });
  
  // Keep only recent messages
  const recentMessages = history.filter(m => now - m.timestamp < AUTOMOD_CONFIG.duplicates.timeWindow);
  duplicateHistory.set(userId, recentMessages);
  
  // Count duplicates
  const duplicateCount = recentMessages.filter(m => m.content === content).length;
  return duplicateCount >= AUTOMOD_CONFIG.duplicates.maxDuplicates;
}

// Check for mention spam
function checkMentionSpam(message) {
  if (!AUTOMOD_CONFIG.mentions.enabled) return false;
  
  const mentionCount = message.mentions.users.size + message.mentions.roles.size;
  return mentionCount > AUTOMOD_CONFIG.mentions.maxMentions;
}

// Check for banned words
function checkBannedWords(message) {
  if (!AUTOMOD_CONFIG.bannedWords.enabled) return false;
  
  const content = message.content.toLowerCase();
  
  // Check word list
  for (const word of AUTOMOD_CONFIG.bannedWords.words) {
    if (content.includes(word.toLowerCase())) return true;
  }
  
  // Check patterns
  for (const pattern of AUTOMOD_CONFIG.bannedWords.patterns) {
    if (pattern.test(content)) return true;
  }
  
  return false;
}

// Check for unapproved links
function checkLinks(message) {
  if (!AUTOMOD_CONFIG.links.enabled) return false;
  
  // URL regex
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
      // Invalid URL, might be suspicious
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
  
  // Log to mod channel
  const modLogChannel = await findChannel(guild, CHANNELS.MOD_LOGS);
  if (modLogChannel) {
    const embed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('🚨 RAID DETECTED - LOCKDOWN ENABLED')
      .setDescription(`Detected ${AUTOMOD_CONFIG.raid.joinThreshold}+ joins within ${AUTOMOD_CONFIG.raid.timeWindow / 1000} seconds.\n\nNew members will be automatically kicked for ${AUTOMOD_CONFIG.raid.lockdownMinutes} minutes.`)
      .setTimestamp();
    
    await modLogChannel.send({ content: '<@&' + (await findRole(guild, ROLES.MODERATOR))?.id + '>', embeds: [embed] });
  }
  
  // Auto-disable after timeout
  setTimeout(() => {
    isRaidMode = false;
    console.log('✅ Raid mode disabled');
    
    if (modLogChannel) {
      modLogChannel.send({
        embeds: [new EmbedBuilder()
          .setColor('#2ECC71')
          .setTitle('✅ Raid Mode Disabled')
          .setDescription('Lockdown has been lifted. New members can join normally.')
          .setTimestamp()
        ]
      });
    }
  }, AUTOMOD_CONFIG.raid.lockdownMinutes * 60 * 1000);
}

// ============================================
// ONBOARDING MESSAGES
// ============================================
function createWelcomeDM() {
  const embed = new EmbedBuilder()
    .setColor('#2ECC71')
    .setTitle('🌸 Welcome to Lumist.ai!')
    .setDescription(`
Hey there! Welcome to the **Lumist.ai** community!

We're so excited to have you here. Before you can access the full server, we need you to complete a quick onboarding process.

**What you'll need to do:**
1️⃣ Select your nationality
2️⃣ Tell us your current SAT score range
3️⃣ Select your grade level
4️⃣ Accept our community rules

This only takes about 30 seconds!

Click the button below to get started 👇
    `)
    .setThumbnail('https://i.imgur.com/AfFp7pu.png')
    .setFooter({ text: 'Lumist.ai • AI-Powered SAT Prep' });

  const button = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId('start_onboarding')
        .setLabel('🚀 Start Onboarding')
        .setStyle(ButtonStyle.Primary)
    );

  return { embeds: [embed], components: [button] };
}

function createNationalitySelect() {
  const embed = new EmbedBuilder()
    .setColor('#3498DB')
    .setTitle('Step 1 of 3: Where are you from?')
    .setDescription('Select your nationality from the dropdown below.');

  const select = new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('select_nationality')
        .setPlaceholder('🌍 Select your nationality')
        .addOptions([
          { label: 'Vietnam', value: 'vietnam', emoji: '🇻🇳' },
          { label: 'United States', value: 'usa', emoji: '🇺🇸' },
          { label: 'United Kingdom', value: 'uk', emoji: '🇬🇧' },
          { label: 'Singapore', value: 'singapore', emoji: '🇸🇬' },
          { label: 'South Korea', value: 'korea', emoji: '🇰🇷' },
          { label: 'Japan', value: 'japan', emoji: '🇯🇵' },
          { label: 'China', value: 'china', emoji: '🇨🇳' },
          { label: 'India', value: 'india', emoji: '🇮🇳' },
          { label: 'Other International', value: 'other', emoji: '🌏' },
        ])
    );

  return { embeds: [embed], components: [select] };
}

function createScoreSelect() {
  const embed = new EmbedBuilder()
    .setColor('#3498DB')
    .setTitle('Step 2 of 3: What\'s your current SAT score range?')
    .setDescription('Select your current or most recent practice test score range.\n\n*Don\'t worry, this is just to connect you with peers at a similar level!*');

  const select = new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('select_score')
        .setPlaceholder('📊 Select your score range')
        .addOptions([
          { label: 'Below 1000', value: 'below_1000', description: 'Just getting started' },
          { label: '1000 - 1200', value: '1000_1200', description: 'Building foundations' },
          { label: '1200 - 1400', value: '1200_1400', description: 'Making progress' },
          { label: '1400 - 1500', value: '1400_1500', description: 'Strong scorer' },
          { label: '1500+', value: '1500_plus', description: 'Top performer' },
        ])
    );

  return { embeds: [embed], components: [select] };
}

function createGradeSelect() {
  const embed = new EmbedBuilder()
    .setColor('#3498DB')
    .setTitle('Step 3 of 3: What grade are you in?')
    .setDescription('Select your current grade level.');

  const select = new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('select_grade')
        .setPlaceholder('🎒 Select your grade level')
        .addOptions([
          { label: 'Freshman (Grade 9)', value: 'freshman' },
          { label: 'Sophomore (Grade 10)', value: 'sophomore' },
          { label: 'Junior (Grade 11)', value: 'junior' },
          { label: 'Senior (Grade 12)', value: 'senior' },
          { label: 'Gap Year / Other', value: 'gap_year' },
        ])
    );

  return { embeds: [embed], components: [select] };
}

function createRulesAcceptance() {
  const embed = new EmbedBuilder()
    .setColor('#E74C3C')
    .setTitle('📜 Almost done! Accept the rules')
    .setDescription(`
Please read and accept our community rules:

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
    .setTitle('🎉 Onboarding Complete!')
    .setDescription(`
Welcome to the **Lumist.ai** community!

You now have access to all community channels. Here's what to do next:

📝 **Introduce yourself** in #introductions
📚 **Check out** the study channels
🔗 **Link your Lumist.ai account** in #verify to appear on leaderboards
💬 **Say hi** in #general

See you around! 🚀
    `);

  return { embeds: [embed], components: [] };
}

// ============================================
// EVENT: BOT READY
// ============================================
client.once(Events.ClientReady, () => {
  console.log('═══════════════════════════════════════════════════════');
  console.log(`🤖 Lumist Bot is online!`);
  console.log(`   Logged in as: ${client.user.tag}`);
  console.log(`   Serving guild: ${GUILD_ID}`);
  console.log(`   Started at: ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════════════');
  console.log('');
  console.log('📋 Active features:');
  console.log('   • Onboarding system');
  console.log('   • Auto-moderation');
  console.log('   • Spam protection');
  console.log('   • Link filtering');
  console.log('   • Raid protection');
  console.log('   • Warning system');
  console.log('');
});

// ============================================
// EVENT: NEW MEMBER JOINS
// ============================================
client.on(Events.GuildMemberAdd, async (member) => {
  console.log(`👋 New member joined: ${member.user.tag}`);
  
  // Track for raid detection
  joinHistory.push(Date.now());
  
  // Clean old entries
  const now = Date.now();
  while (joinHistory.length > 0 && now - joinHistory[0] > AUTOMOD_CONFIG.raid.timeWindow) {
    joinHistory.shift();
  }
  
  // Check for raid
  if (checkForRaid()) {
    await enableRaidMode(member.guild);
  }
  
  // If raid mode, kick new joins
  if (isRaidMode) {
    try {
      await member.send('⚠️ The server is currently in lockdown mode due to a raid. Please try joining again later.');
      await member.kick('Raid protection - auto kicked during lockdown');
      console.log(`   🚫 Kicked ${member.user.tag} (raid protection)`);
      return;
    } catch (error) {
      console.error(`   ❌ Error kicking during raid: ${error.message}`);
    }
  }
  
  // Normal onboarding
  onboardingState.set(member.user.id, {
    nationality: null,
    score: null,
    grade: null,
    guildId: member.guild.id,
  });
  
  try {
    await member.send(createWelcomeDM());
    console.log(`   ✅ Sent welcome DM to ${member.user.tag}`);
  } catch (error) {
    console.log(`   ❌ Could not DM ${member.user.tag} (DMs might be disabled)`);
    
    const welcomeChannel = await findChannel(member.guild, CHANNELS.WELCOME);
    if (welcomeChannel) {
      const fallbackEmbed = new EmbedBuilder()
        .setColor('#FFA500')
        .setDescription(`Hey ${member}! I couldn't send you a DM. Please enable DMs from server members, or click the button below to start onboarding.`);
      
      const button = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('start_onboarding')
            .setLabel('🚀 Start Onboarding')
            .setStyle(ButtonStyle.Primary)
        );
      
      await welcomeChannel.send({ embeds: [fallbackEmbed], components: [button] });
    }
  }
});

// ============================================
// EVENT: MESSAGE CREATE (Auto-Mod)
// ============================================
client.on(Events.MessageCreate, async (message) => {
  // Ignore bots and DMs
  if (message.author.bot) return;
  if (!message.guild) return;
  
  // Ignore staff
  if (isStaff(message.member)) return;
  
  // Run auto-mod checks
  let violation = null;
  let reason = null;
  
  // Check banned words (highest priority)
  if (checkBannedWords(message)) {
    violation = 'banned_words';
    reason = 'Using prohibited language';
  }
  // Check unapproved links
  else if (checkLinks(message)) {
    violation = 'unapproved_link';
    reason = 'Posting unapproved links';
  }
  // Check mention spam
  else if (checkMentionSpam(message)) {
    violation = 'mention_spam';
    reason = 'Mention spam';
  }
  // Check spam
  else if (checkSpam(message)) {
    violation = 'spam';
    reason = 'Message spam';
  }
  // Check duplicates
  else if (checkDuplicates(message)) {
    violation = 'duplicate';
    reason = 'Duplicate messages';
  }
  
  // Handle violation
  if (violation) {
    try {
      // Delete the message
      await message.delete();
      console.log(`🗑️ Deleted message from ${message.author.tag}: ${violation}`);
      
      // Add warning and execute action
      const warningCount = addWarning(message.author.id, reason);
      await executeWarningAction(message.member, warningCount, reason, message.guild);
      
      // Send feedback to user
      const feedback = await message.channel.send({
        content: `⚠️ ${message.author}, your message was removed: **${reason}**`,
      });
      
      // Auto-delete feedback after 5 seconds
      setTimeout(() => feedback.delete().catch(() => {}), 5000);
      
    } catch (error) {
      console.error(`❌ Auto-mod error: ${error.message}`);
    }
  }
});

// ============================================
// EVENT: INTERACTIONS (Onboarding)
// ============================================
client.on(Events.InteractionCreate, async (interaction) => {
  // Handle buttons
  if (interaction.isButton()) {
    if (interaction.customId === 'start_onboarding') {
      console.log(`🚀 ${interaction.user.tag} started onboarding`);
      
      if (!onboardingState.has(interaction.user.id)) {
        onboardingState.set(interaction.user.id, {
          nationality: null,
          score: null,
          grade: null,
          guildId: GUILD_ID,
        });
      }
      
      await interaction.update(createNationalitySelect());
    }
    
    if (interaction.customId === 'accept_rules') {
      const state = onboardingState.get(interaction.user.id);
      
      if (!state) {
        await interaction.reply({ content: '❌ Something went wrong. Please try again from the beginning.', ephemeral: true });
        return;
      }
      
      console.log(`✅ ${interaction.user.tag} accepted rules, assigning roles...`);
      
      try {
        const guild = await client.guilds.fetch(state.guildId || GUILD_ID);
        const member = await guild.members.fetch(interaction.user.id);
        
        const rolesToAssign = [
          ROLES.MEMBER,
          getNationalityRole(state.nationality),
          getScoreRole(state.score),
          getGradeRole(state.grade),
        ];
        
        for (const roleName of rolesToAssign) {
          if (roleName) {
            const role = await findRole(guild, roleName);
            if (role) {
              await member.roles.add(role);
              console.log(`   ✅ Assigned role: ${roleName}`);
            } else {
              console.log(`   ⚠️ Role not found: ${roleName}`);
            }
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
        
        console.log(`🎉 ${interaction.user.tag} completed onboarding!`);
        onboardingState.delete(interaction.user.id);
        
      } catch (error) {
        console.error('❌ Error assigning roles:', error);
        await interaction.reply({ content: '❌ There was an error completing your onboarding. Please contact a moderator.', ephemeral: true });
      }
    }
  }
  
  // Handle select menus
  if (interaction.isStringSelectMenu()) {
    const state = onboardingState.get(interaction.user.id) || {
      nationality: null,
      score: null,
      grade: null,
      guildId: GUILD_ID,
    };
    
    if (interaction.customId === 'select_nationality') {
      state.nationality = interaction.values[0];
      onboardingState.set(interaction.user.id, state);
      console.log(`   📍 ${interaction.user.tag} selected nationality: ${state.nationality}`);
      await interaction.update(createScoreSelect());
    }
    
    if (interaction.customId === 'select_score') {
      state.score = interaction.values[0];
      onboardingState.set(interaction.user.id, state);
      console.log(`   📊 ${interaction.user.tag} selected score: ${state.score}`);
      await interaction.update(createGradeSelect());
    }
    
    if (interaction.customId === 'select_grade') {
      state.grade = interaction.values[0];
      onboardingState.set(interaction.user.id, state);
      console.log(`   🎒 ${interaction.user.tag} selected grade: ${state.grade}`);
      await interaction.update(createRulesAcceptance());
    }
  }
});

// ============================================
// ERROR HANDLING
// ============================================
client.on('error', (error) => {
  console.error('❌ Discord client error:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled promise rejection:', error);
});

process.on('SIGTERM', () => {
  console.log('🛑 Shutting down gracefully...');
  client.destroy();
  server.close();
  process.exit(0);
});

// ============================================
// LOGIN
// ============================================
console.log('🔄 Connecting to Discord...');
client.login(BOT_TOKEN);
