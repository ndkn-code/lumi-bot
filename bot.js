/**
 * Lumist.ai Discord Bot - Onboarding System
 * 
 * Features:
 * - Welcome DM when new members join
 * - Interactive onboarding questionnaire
 * - Auto role assignment
 * - Welcome message in #introductions
 * - HTTP server for health check pings (keeps Render free tier alive)
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
} = require('discord.js');

const http = require('http');

// ============================================
// CONFIGURATION (from environment variables)
// ============================================
const BOT_TOKEN = process.env.BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID || '1456886174600794291';
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN) {
  console.error('❌ Error: BOT_TOKEN environment variable is not set');
  console.error('Please set it in your Render dashboard under Environment');
  process.exit(1);
}

// ============================================
// HTTP SERVER (for health check pings)
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
// ROLE CONFIGURATION
// ============================================
const ROLES = {
  MEMBER: '🌱 Member',
  VERIFIED: '✅ Verified',
  PREMIUM: '💎 Premium',
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

// Channel names
const CHANNELS = {
  INTRODUCTIONS: 'introductions',
  WELCOME: 'welcome',
  RULES: 'rules',
};

// ============================================
// BOT CLIENT SETUP
// ============================================
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
});

// Store for tracking onboarding state
const onboardingState = new Map();

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
  console.log('📋 Bot is now listening for:');
  console.log('   • New member joins');
  console.log('   • Onboarding button clicks');
  console.log('   • Select menu interactions');
  console.log('');
});

// ============================================
// EVENT: NEW MEMBER JOINS
// ============================================
client.on(Events.GuildMemberAdd, async (member) => {
  console.log(`👋 New member joined: ${member.user.tag}`);
  
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
    
    const guild = member.guild;
    const welcomeChannel = await findChannel(guild, CHANNELS.WELCOME);
    
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
// EVENT: INTERACTIONS
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
  console.log('🛑 Received SIGTERM, shutting down gracefully...');
  client.destroy();
  server.close();
  process.exit(0);
});

// ============================================
// LOGIN
// ============================================
console.log('🔄 Connecting to Discord...');
client.login(BOT_TOKEN);
