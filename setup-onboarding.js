/**
 * Discord Native Onboarding Setup Script
 *
 * This script configures Discord's native Server Onboarding feature
 * to replace the bot's custom DM-based onboarding.
 *
 * Usage: BOT_TOKEN=your_token node setup-onboarding.js
 *
 * Requirements:
 * - Bot must have MANAGE_GUILD and MANAGE_ROLES permissions
 * - Server must have Community features enabled
 */

const { REST, Routes } = require('discord.js');

// Configuration
const BOT_TOKEN = process.env.BOT_TOKEN;
const GUILD_ID = process.env.GUILD_ID || '1456886174600794291';

if (!BOT_TOKEN) {
  console.error('Error: BOT_TOKEN environment variable is required');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);

// Helper to generate snowflake-like IDs for onboarding prompts/options
let idCounter = 0;
function generateSnowflake() {
  const timestamp = BigInt(Date.now() - 1420070400000) << 22n; // Discord epoch
  const increment = BigInt(idCounter++);
  return (timestamp | increment).toString();
}

// Country roles for onboarding (Discord limits to ~10 options per prompt)
// Additional country roles exist in server - users can request via mods
const COUNTRY_ROLES_FOR_ONBOARDING = [
  { name: '🇺🇸 United States', emoji: '🇺🇸' },
  { name: '🇻🇳 Vietnam', emoji: '🇻🇳' },
  { name: '🇬🇧 United Kingdom', emoji: '🇬🇧' },
  { name: '🇮🇳 India', emoji: '🇮🇳' },
  { name: '🇨🇳 China', emoji: '🇨🇳' },
  { name: '🇯🇵 Japan', emoji: '🇯🇵' },
  { name: '🇰🇷 South Korea', emoji: '🇰🇷' },
  { name: '🇸🇬 Singapore', emoji: '🇸🇬' },
  { name: '🌏 Other International', emoji: '🌏', displayTitle: 'Other' },  // Catch-all
];

// Grade roles
const GRADE_ROLES = [
  { name: '🎒 Freshman', emoji: '📗', label: 'Freshman (Grade 9)' },
  { name: '🎒 Sophomore', emoji: '📘', label: 'Sophomore (Grade 10)' },
  { name: '🎒 Junior', emoji: '📙', label: 'Junior (Grade 11)' },
  { name: '🎒 Senior', emoji: '📕', label: 'Senior (Grade 12)' },
  { name: '🎒 Gap Year', emoji: '📓', label: 'Gap Year / College' },
];

// Required channels for onboarding (need at least 7 default channels)
// The script will try these in order and use whichever exist
const REQUIRED_CHANNELS = [
  'welcome',
  'rules',
  'general',        // or 'general-chat'
  'introductions',
  'sat-math',
  'sat-reading',
];

// Optional channels (will be added if they exist)
const OPTIONAL_CHANNELS = [
  'ask-lumi',
  'general-chat',   // fallback if 'general' doesn't exist
  'college-apps',
  'announcements',
];

// Optional interest channels
const INTEREST_CHANNELS = {
  'sat-math': { emoji: '📐', title: 'SAT Math' },
  'sat-reading': { emoji: '📖', title: 'SAT Reading & Writing' },
  'college-apps': { emoji: '🎓', title: 'College Applications' },
};

async function main() {
  console.log('='.repeat(60));
  console.log('Discord Native Onboarding Setup');
  console.log('='.repeat(60));
  console.log(`Guild ID: ${GUILD_ID}`);
  console.log('');

  try {
    // Step 1: Fetch existing roles and channels
    console.log('Step 1: Fetching existing roles and channels...');
    const [existingRoles, existingChannels] = await Promise.all([
      rest.get(Routes.guildRoles(GUILD_ID)),
      rest.get(Routes.guildChannels(GUILD_ID)),
    ]);

    const roleMap = new Map(existingRoles.map(r => [r.name, r]));
    const channelMap = new Map(existingChannels.map(c => [c.name, c]));

    console.log(`   Found ${existingRoles.length} roles, ${existingChannels.length} channels`);

    // Step 2: Create missing country roles
    console.log('\nStep 2: Creating missing country roles...');
    const countryRoleIds = {};

    for (const country of COUNTRY_ROLES_FOR_ONBOARDING) {
      if (roleMap.has(country.name)) {
        countryRoleIds[country.name] = roleMap.get(country.name).id;
        console.log(`   [EXISTS] ${country.name}`);
      } else {
        try {
          const newRole = await rest.post(Routes.guildRoles(GUILD_ID), {
            body: { name: country.name, mentionable: false, hoist: false }
          });
          countryRoleIds[country.name] = newRole.id;
          roleMap.set(country.name, newRole);
          console.log(`   [CREATED] ${country.name} (${newRole.id})`);
        } catch (error) {
          console.error(`   [ERROR] Failed to create ${country.name}: ${error.message}`);
        }
      }
    }

    // Step 3: Verify grade roles exist
    console.log('\nStep 3: Verifying grade roles...');
    const gradeRoleIds = {};

    for (const grade of GRADE_ROLES) {
      if (roleMap.has(grade.name)) {
        gradeRoleIds[grade.name] = roleMap.get(grade.name).id;
        console.log(`   [EXISTS] ${grade.name}`);
      } else {
        try {
          const newRole = await rest.post(Routes.guildRoles(GUILD_ID), {
            body: { name: grade.name, mentionable: false, hoist: false }
          });
          gradeRoleIds[grade.name] = newRole.id;
          roleMap.set(grade.name, newRole);
          console.log(`   [CREATED] ${grade.name} (${newRole.id})`);
        } catch (error) {
          console.error(`   [ERROR] Failed to create ${grade.name}: ${error.message}`);
        }
      }
    }

    // Step 4: Verify Member role exists
    console.log('\nStep 4: Verifying Member role...');
    let memberRoleId;
    const memberRoleName = '🌱 Member';

    if (roleMap.has(memberRoleName)) {
      memberRoleId = roleMap.get(memberRoleName).id;
      console.log(`   [EXISTS] ${memberRoleName} (${memberRoleId})`);
    } else {
      try {
        const newRole = await rest.post(Routes.guildRoles(GUILD_ID), {
          body: { name: memberRoleName, color: 0x95A5A6, mentionable: false, hoist: false }
        });
        memberRoleId = newRole.id;
        console.log(`   [CREATED] ${memberRoleName} (${newRole.id})`);
      } catch (error) {
        console.error(`   [ERROR] Failed to create Member role: ${error.message}`);
        process.exit(1);
      }
    }

    // Step 5: Verify required channels exist
    console.log('\nStep 5: Verifying required channels...');
    const defaultChannelIds = [];

    for (const channelName of REQUIRED_CHANNELS) {
      if (channelMap.has(channelName)) {
        const channel = channelMap.get(channelName);
        defaultChannelIds.push(channel.id);
        console.log(`   [EXISTS] #${channelName} (${channel.id})`);
      } else {
        console.warn(`   [MISSING] #${channelName} - Please create this channel manually`);
      }
    }

    // Add optional channels if they exist (to reach 7 minimum)
    console.log('\n   Checking optional channels...');
    for (const channelName of OPTIONAL_CHANNELS) {
      if (channelMap.has(channelName)) {
        const channel = channelMap.get(channelName);
        if (!defaultChannelIds.includes(channel.id)) {
          defaultChannelIds.push(channel.id);
          console.log(`   [ADDED] #${channelName} (${channel.id})`);
        }
      }
    }

    if (defaultChannelIds.length < 7) {
      console.error(`\nError: Need at least 7 default channels for onboarding (found ${defaultChannelIds.length})`);
      console.error('Please create more channels and run this script again.');
      process.exit(1);
    }

    // Step 5b: Update channel permissions for @everyone
    console.log('\nStep 5b: Updating channel permissions for @everyone...');
    const channelsToUpdate = ['welcome', 'general', 'introductions', 'sat-math', 'sat-reading', 'college-apps'];

    for (const channelName of channelsToUpdate) {
      if (channelMap.has(channelName)) {
        const channel = channelMap.get(channelName);
        try {
          // Set @everyone (role ID = guild ID) to have VIEW_CHANNEL and SEND_MESSAGES
          await rest.put(
            Routes.channelPermission(channel.id, GUILD_ID),
            {
              body: {
                id: GUILD_ID,
                type: 0, // Role type
                allow: (1n << 10n | 1n << 11n).toString(), // VIEW_CHANNEL (1<<10) + SEND_MESSAGES (1<<11)
                deny: '0',
              },
            }
          );
          console.log(`   [UPDATED] #${channelName} - @everyone can view & send`);
        } catch (error) {
          console.warn(`   [SKIP] #${channelName} - ${error.message}`);
        }
      }
    }

    // Step 6: Get interest channel IDs
    console.log('\nStep 6: Getting interest channel IDs...');
    const interestChannelIds = {};

    for (const [channelName, config] of Object.entries(INTEREST_CHANNELS)) {
      if (channelMap.has(channelName)) {
        interestChannelIds[channelName] = channelMap.get(channelName).id;
        console.log(`   [EXISTS] #${channelName} (${interestChannelIds[channelName]})`);
      } else {
        console.warn(`   [MISSING] #${channelName} - Interest option will be skipped`);
      }
    }

    // Step 7: Build onboarding configuration
    console.log('\nStep 7: Building onboarding configuration...');

    // Prompt 1: Country selection
    const countryOptions = COUNTRY_ROLES_FOR_ONBOARDING.map(country => ({
      id: generateSnowflake(),
      title: country.displayTitle || country.name.replace(/^.{1,2}\s/, ''), // Use displayTitle or remove emoji prefix
      emoji: { name: country.emoji },
      role_ids: [countryRoleIds[country.name]],
      channel_ids: [],
    })).filter(opt => opt.role_ids[0]); // Only include if role was created

    // Prompt 2: Grade selection (also assigns Member role)
    const gradeOptions = GRADE_ROLES.map(grade => ({
      id: generateSnowflake(),
      title: grade.label,
      emoji: { name: grade.emoji },
      role_ids: [gradeRoleIds[grade.name], memberRoleId].filter(Boolean),
      channel_ids: [],
    })).filter(opt => opt.role_ids.length > 0);

    // Prompt 3: Interests (optional)
    const interestOptions = [];
    if (interestChannelIds['sat-math']) {
      interestOptions.push({
        id: generateSnowflake(),
        title: 'SAT Math',
        emoji: { name: '📐' },
        role_ids: [],
        channel_ids: [interestChannelIds['sat-math']],
      });
    }
    if (interestChannelIds['sat-reading']) {
      interestOptions.push({
        id: generateSnowflake(),
        title: 'SAT Reading & Writing',
        emoji: { name: '📖' },
        role_ids: [],
        channel_ids: [interestChannelIds['sat-reading']],
      });
    }
    if (interestChannelIds['college-apps']) {
      interestOptions.push({
        id: generateSnowflake(),
        title: 'College Applications',
        emoji: { name: '🎓' },
        role_ids: [],
        channel_ids: [interestChannelIds['college-apps']],
      });
    }

    // Build prompts array
    const prompts = [
      {
        id: generateSnowflake(),
        type: 0, // MULTIPLE_CHOICE
        title: 'Where are you from?',
        single_select: true,
        required: true,
        in_onboarding: true,
        options: countryOptions,
      },
      {
        id: generateSnowflake(),
        type: 0, // MULTIPLE_CHOICE
        title: 'What grade are you in?',
        single_select: true,
        required: true,
        in_onboarding: true,
        options: gradeOptions,
      },
    ];

    // Only add interests prompt if we have options
    if (interestOptions.length > 0) {
      prompts.push({
        id: generateSnowflake(),
        type: 0, // MULTIPLE_CHOICE
        title: 'What are you interested in?',
        single_select: false,
        required: false,
        in_onboarding: true,
        options: interestOptions,
      });
    }

    const onboardingConfig = {
      prompts,
      default_channel_ids: defaultChannelIds,
      enabled: true,
      mode: 0, // ONBOARDING_DEFAULT
    };

    console.log(`   Country options: ${countryOptions.length}`);
    console.log(`   Grade options: ${gradeOptions.length}`);
    console.log(`   Interest options: ${interestOptions.length}`);
    console.log(`   Default channels: ${defaultChannelIds.length}`);

    // Step 8: Apply onboarding configuration
    console.log('\nStep 8: Applying onboarding configuration...');

    try {
      await rest.put(Routes.guildOnboarding(GUILD_ID), {
        body: onboardingConfig,
      });
      console.log('   [SUCCESS] Onboarding configuration applied!');
    } catch (error) {
      console.error(`   [ERROR] Failed to apply onboarding: ${error.message}`);
      if (error.rawError?.errors) {
        console.error('   Details:', JSON.stringify(error.rawError.errors, null, 2));
      }
      process.exit(1);
    }

    // Done!
    console.log('\n' + '='.repeat(60));
    console.log('SETUP COMPLETE!');
    console.log('='.repeat(60));
    console.log('\nNext steps:');
    console.log('1. Go to Server Settings > Onboarding to review the configuration');
    console.log('2. Optionally customize the Server Guide in Discord settings');
    console.log('3. Test by joining the server with an alt account');
    console.log('4. Update your bot to remove the old DM-based onboarding code');
    console.log('');

  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

main();
