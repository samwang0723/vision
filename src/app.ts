import config from '@config/index';
import logger from '@utils/logger';
import { initMemoryTools } from './tools/memory/command';
import { initPlaywrightTools } from './tools/playwright/command';
import { initBookingTools } from './tools/booking/command';
import { Bot, Keyboard } from 'grammy';
import { messageHandler } from './domains/anthropic/handler';
import { initTimeTools } from './tools/time/command';
import {
  formatLocation,
  getCompleteUserInfo,
  getUserContact,
  getUserEmail,
} from '@utils/location';
import { createPersonalizedSystemPrompt } from './domains/anthropic/service';

const bot = new Bot(config.telegram.botToken);

// Store user locations (in production, use a database)
const userLocations = new Map<
  string,
  { latitude: number; longitude: number; address?: string }
>();

// Store user profiles (in production, use a database)
const userProfiles = new Map<string, any>();

// Store user contacts (in production, use a database)
const userContacts = new Map<
  string,
  {
    phone_number: string;
    first_name: string;
    last_name?: string;
    user_id?: number;
  }
>();

// Store user emails (in production, use a database)
const userEmails = new Map<string, string>();

// Track users waiting to provide email
const waitingForEmail = new Set<string>();

// Helper function to extract and store user profile information
const getUserProfile = (ctx: any) => {
  if (!ctx.from) return null;

  const userProfile = {
    id: ctx.from.id,
    is_bot: ctx.from.is_bot || false,
    first_name: ctx.from.first_name || '',
    last_name: ctx.from.last_name || '',
    username: ctx.from.username || '',
    language_code: ctx.from.language_code || '',
    is_premium: ctx.from.is_premium || false,
    full_name: `${ctx.from.first_name || ''} ${
      ctx.from.last_name || ''
    }`.trim(),
  };

  // Store/update user profile
  userProfiles.set(ctx.from.id.toString(), userProfile);

  return userProfile;
};

// Helper function to validate email
const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

(async (): Promise<void> => {
  try {
    // Run initialization functions concurrently
    await Promise.all([
      initMemoryTools(),
      initBookingTools(),
      initTimeTools(),
      // initPlaywrightTools(),
    ]);

    // Handle location sharing
    bot.on('message:location', async ctx => {
      if (!ctx.from) return;

      // Get and store user profile
      const userProfile = getUserProfile(ctx);

      const location = ctx.message.location;
      const userId = ctx.from.id.toString();

      // Store the user's location
      userLocations.set(userId, {
        latitude: location.latitude,
        longitude: location.longitude,
      });

      logger.info(
        `Received location from user ${userId}: ${location.latitude}, ${location.longitude}`
      );

      await ctx.reply(
        `📍 Location received! Latitude: ${location.latitude}, Longitude: ${location.longitude}\n\nI'll remember this location for restaurant searches and other location-based services.`
      );
    });

    // Handle contact sharing
    bot.on('message:contact', async ctx => {
      if (!ctx.from) return;

      // Get and store user profile
      const userProfile = getUserProfile(ctx);

      const contact = ctx.message.contact;
      const userId = ctx.from.id.toString();

      // Store the contact information
      userContacts.set(userId, {
        phone_number: contact.phone_number,
        first_name: contact.first_name,
        last_name: contact.last_name,
        user_id: contact.user_id,
      });

      logger.info(
        `Received contact from user ${userId}: ${contact.phone_number} (${contact.first_name})`
      );

      await ctx.reply(
        `📞 Contact received! Phone: ${contact.phone_number}\nName: ${
          contact.first_name
        } ${
          contact.last_name || ''
        }\n\nI'll remember this contact information for restaurant reservations.`
      );
    });

    // Command to request location
    bot.command('location', async ctx => {
      const keyboard = new Keyboard()
        .requestLocation('📍 Share My Location')
        .resized();

      await ctx.reply(
        '📍 Please share your location so I can help you find nearby restaurants and services.',
        {
          reply_markup: keyboard,
        }
      );
    });

    // Command to request contact
    bot.command('contact', async ctx => {
      const keyboard = new Keyboard()
        .requestContact('📞 Share My Contact')
        .resized();

      await ctx.reply(
        '📞 Please share your contact information so I can make restaurant reservations for you.',
        {
          reply_markup: keyboard,
        }
      );
    });

    // Command to check stored location
    bot.command('mylocation', async ctx => {
      if (!ctx.from) return;

      // Get and store user profile
      const userProfile = getUserProfile(ctx);

      const userId = ctx.from.id.toString();
      const location = userLocations.get(userId);

      if (location) {
        await ctx.reply(`Your stored location:\n${formatLocation(location)}`);
      } else {
        await ctx.reply(
          '📍 No location stored. Use /location to share your location with me.'
        );
      }
    });

    // Command to show user profile
    bot.command('myprofile', async ctx => {
      if (!ctx.from) return;

      const userProfile = getUserProfile(ctx);
      if (!userProfile) {
        await ctx.reply('❌ Unable to retrieve your profile information.');
        return;
      }

      const profileText = `
👤 **Your Profile Information:**
• Name: ${userProfile.full_name || 'Not provided'}
• Username: ${userProfile.username ? '@' + userProfile.username : 'Not set'}
• User ID: ${userProfile.id}
• Language: ${userProfile.language_code || 'Not detected'}
• Premium User: ${userProfile.is_premium ? '✅ Yes' : '❌ No'}
      `.trim();

      await ctx.reply(profileText, { parse_mode: 'Markdown' });
    });

    // Command to show personalized system prompt (for testing)
    bot.command('systempromptest', async ctx => {
      if (!ctx.from) return;

      const fullUserProfile = getUserProfile(ctx);
      const userContact = getUserContact(ctx.from.id.toString());
      const userEmail = getUserEmail(ctx.from.id.toString());

      const userProfileForHandler = fullUserProfile
        ? {
            full_name: fullUserProfile.full_name,
            first_name: fullUserProfile.first_name,
            username: fullUserProfile.username,
            language_code: fullUserProfile.language_code,
            email: userEmail,
            phone: userContact?.phone_number,
          }
        : undefined;

      const personalizedPrompt = createPersonalizedSystemPrompt(
        userProfileForHandler
      );

      await ctx.reply(
        `🤖 **Your Personalized System Prompt:**\n\n\`\`\`\n${personalizedPrompt}\n\`\`\``,
        {
          parse_mode: 'Markdown',
        }
      );
    });

    // Command to check stored contact
    bot.command('mycontact', async ctx => {
      if (!ctx.from) return;

      const userId = ctx.from.id.toString();
      const contact = userContacts.get(userId);

      if (contact) {
        await ctx.reply(
          `📞 Your stored contact:\nPhone: ${contact.phone_number}\nName: ${
            contact.first_name
          } ${contact.last_name || ''}`
        );
      } else {
        await ctx.reply(
          '📞 No contact stored. Use /contact to share your contact information with me.'
        );
      }
    });

    // Command to request email
    bot.command('email', async ctx => {
      if (!ctx.from) return;

      const userId = ctx.from.id.toString();
      waitingForEmail.add(userId);

      await ctx.reply(
        '📧 Please send me your email address so I can use it for restaurant reservations.\n\nJust type your email address in the next message.'
      );
    });

    // Command to check stored email
    bot.command('myemail', async ctx => {
      if (!ctx.from) return;

      const userId = ctx.from.id.toString();
      const email = userEmails.get(userId);

      if (email) {
        await ctx.reply(`📧 Your stored email: ${email}`);
      } else {
        await ctx.reply(
          '📧 No email stored. Use /email to provide your email address.'
        );
      }
    });

    // Command to show all user information
    bot.command('myinfo', async ctx => {
      if (!ctx.from) return;

      const userId = ctx.from.id.toString();
      const userInfo = getCompleteUserInfo(userId);

      let infoText = '👤 **Your Complete Information:**\n\n';

      // Profile information
      if (userInfo.profile) {
        infoText += `**Profile:**\n`;
        infoText += `• Name: ${userInfo.profile.full_name || 'Not provided'}\n`;
        infoText += `• Username: ${
          userInfo.profile.username
            ? '@' + userInfo.profile.username
            : 'Not set'
        }\n`;
        infoText += `• Language: ${
          userInfo.profile.language_code || 'Not detected'
        }\n`;
        infoText += `• Premium: ${
          userInfo.profile.is_premium ? '✅ Yes' : '❌ No'
        }\n\n`;
      }

      // Contact information
      if (userInfo.contact) {
        infoText += `**Contact:**\n`;
        infoText += `• Phone: ${userInfo.contact.phone_number}\n`;
        infoText += `• Name: ${userInfo.contact.first_name} ${
          userInfo.contact.last_name || ''
        }\n\n`;
      } else {
        infoText += `**Contact:** Not provided (use /contact)\n\n`;
      }

      // Email information
      if (userInfo.email) {
        infoText += `**Email:** ${userInfo.email}\n\n`;
      } else {
        infoText += `**Email:** Not provided (use /email)\n\n`;
      }

      // Location information
      if (userInfo.location) {
        infoText += `**Location:**\n${formatLocation(userInfo.location)}\n\n`;
      } else {
        infoText += `**Location:** Not provided (use /location)\n\n`;
      }

      infoText += `Use the respective commands (/contact, /email, /location) to update your information.`;

      await ctx.reply(infoText, { parse_mode: 'Markdown' });
    });

    // Command to show what information Claude has access to
    bot.command('claudeinfo', async ctx => {
      if (!ctx.from) return;

      const userId = ctx.from.id.toString();
      const fullUserProfile = getUserProfile(ctx);
      const userContact = getUserContact(userId);
      const userEmail = getUserEmail(userId);
      const userLocation = userLocations.get(userId);

      let claudeInfoText = '🤖 **Information Available to Claude:**\n\n';

      if (fullUserProfile) {
        claudeInfoText += `✅ **Name:** ${
          fullUserProfile.full_name ||
          fullUserProfile.first_name ||
          'Not available'
        }\n`;
        if (fullUserProfile.language_code) {
          claudeInfoText += `✅ **Language:** ${fullUserProfile.language_code}\n`;
        }
      } else {
        claudeInfoText += `❌ **Name:** Not available\n`;
      }

      if (userEmail) {
        claudeInfoText += `✅ **Email:** ${userEmail}\n`;
      } else {
        claudeInfoText += `❌ **Email:** Not available (use /email)\n`;
      }

      if (userContact) {
        claudeInfoText += `✅ **Phone:** ${userContact.phone_number}\n`;
      } else {
        claudeInfoText += `❌ **Phone:** Not available (use /contact)\n`;
      }

      if (userLocation) {
        claudeInfoText += `✅ **Location:** Available for restaurant searches\n`;
      } else {
        claudeInfoText += `❌ **Location:** Not available (use /location)\n`;
      }

      claudeInfoText += '\n📝 **What this means:**\n';
      claudeInfoText += '• Claude will address you by name in conversations\n';

      if (userEmail || userContact) {
        claudeInfoText +=
          '• Claude can make restaurant reservations using your contact info\n';
      } else {
        claudeInfoText +=
          '• Provide contact info for automatic restaurant reservations\n';
      }

      if (userLocation) {
        claudeInfoText +=
          '• Claude can find nearby restaurants automatically\n';
      } else {
        claudeInfoText +=
          '• Share location for nearby restaurant recommendations\n';
      }

      await ctx.reply(claudeInfoText, { parse_mode: 'Markdown' });
    });

    // Register listeners to handle messages
    bot.on('message:text', async ctx => {
      if (!ctx.from) return;

      // Get and store user profile
      const userProfile = getUserProfile(ctx);

      const userId = ctx.from.id.toString();

      // Check if user is providing email
      if (waitingForEmail.has(userId)) {
        const email = ctx.message.text.trim();

        if (isValidEmail(email)) {
          userEmails.set(userId, email);
          waitingForEmail.delete(userId);
          await ctx.reply(
            `📧 Email saved: ${email}\n\nI'll use this for restaurant reservations.`
          );
          return;
        } else {
          await ctx.reply(
            '❌ Invalid email format. Please provide a valid email address (e.g., user@example.com).'
          );
          return;
        }
      }

      logger.info(`Received message from user ID: ${ctx.from.id}`);
      logger.info(`Received message: ${ctx.message.text}`);

      const updateInterval = 500; // Update every 500ms to avoid rate limits
      let messageCounter = 0;
      let lastProcessingMessage: any = null;

      try {
        // Get user's location if available and include it in the message context
        const userLocation = userLocations.get(userId);
        const fullUserProfile = getUserProfile(ctx);
        const userContact = getUserContact(userId);
        const userEmail = getUserEmail(userId);

        // Create simplified profile for handler with all available information
        const userProfileForHandler = fullUserProfile
          ? {
              full_name: fullUserProfile.full_name,
              first_name: fullUserProfile.first_name,
              username: fullUserProfile.username,
              language_code: fullUserProfile.language_code,
              email: userEmail,
              phone: userContact?.phone_number,
            }
          : undefined;

        let messageWithLocation = ctx.message.text;
        if (userLocation) {
          messageWithLocation += `\n\n[User's current location: Latitude ${userLocation.latitude}, Longitude ${userLocation.longitude}]`;
        }

        await messageHandler({
          data: messageWithLocation,
          userId: ctx.from.id.toString(),
          userProfile: userProfileForHandler,
          onNewClaude: async () => {
            messageCounter++;

            let newMessage: any;

            if (messageCounter === 1) {
              // First call - create initial "Thinking..." message
              const initialText = '🤔 Thinking...';
              newMessage = await ctx.reply(initialText);
            } else {
              // Subsequent calls - delete previous processing message if it exists
              if (lastProcessingMessage) {
                try {
                  await bot.api.deleteMessage(
                    ctx.chat.id,
                    lastProcessingMessage.message_id
                  );
                } catch (err: any) {
                  logger.error(
                    'Failed to delete previous processing message:',
                    err
                  );
                }
              }

              // Create new processing message
              const processingText = `🔧 Processing step ${messageCounter} ...`;
              newMessage = await ctx.reply(processingText);
              lastProcessingMessage = newMessage;
            }

            let messageLastSent =
              messageCounter === 1
                ? '🤔 Thinking...'
                : `🔧 Processing step ${messageCounter} ...`;
            let messageStreamedText = '';
            let lastUpdateTime = 0;

            return {
              updateMessage: async (text: string) => {
                messageStreamedText += text;
                const now = Date.now();

                // Throttle updates to avoid hitting Telegram rate limits
                if (now - lastUpdateTime > updateInterval) {
                  lastUpdateTime = now;

                  // Edit the message with streaming text (max 4096 chars for Telegram)
                  const displayText =
                    messageStreamedText.length > 4000
                      ? messageStreamedText.substring(0, 4000) + '...'
                      : messageStreamedText;

                  // Only update if the content has actually changed
                  if (displayText && displayText !== messageLastSent) {
                    try {
                      await bot.api.editMessageText(
                        ctx.chat.id,
                        newMessage.message_id,
                        displayText
                      );
                      messageLastSent = displayText;
                    } catch (err: any) {
                      // Ignore specific edit errors
                      if (!err.message.includes('message is not modified')) {
                        logger.error(
                          `Failed to edit message ${messageCounter}:`,
                          err
                        );
                      }
                    }
                  }
                }
              },
              flushMessages: async (text: string) => {
                if (messageLastSent !== text && text.trim()) {
                  try {
                    await bot.api.editMessageText(
                      ctx.chat.id,
                      newMessage.message_id,
                      text
                    );
                    messageLastSent = text;
                  } catch (err: any) {
                    if (!err.message.includes('message is not modified')) {
                      logger.error(
                        `Failed to flush message ${messageCounter}:`,
                        err
                      );
                    }
                  }
                }
              },
            };
          },
        });
      } catch (error) {
        logger.error('Error in message handling:', error);
        await ctx.reply(
          '❌ Sorry, I encountered an error while processing your message.'
        );
      }
    });

    // Start the bot (using long polling)
    bot.start();

    logger.info('⚡️ Telegram bot is running!');
  } catch (error) {
    logger.error('Failed to start app:', error);
    process.exit(1);
  }
})();

// Export the userLocations map so other modules can access it
export { userLocations, userProfiles, userContacts, userEmails };
