import config from '@config/index';
import logger from '@utils/logger';
import { initMemoryTools } from './tools/memory/command';
import { initPlaywrightTools } from './tools/playwright/command';
import { initBookingTools } from './tools/booking/command';
import { Bot, Keyboard } from 'grammy';
import { messageHandler } from './domains/anthropic/handler';
import { initTimeTools } from './tools/time/command';
import { formatLocation } from '@utils/location';

const bot = new Bot(config.telegram.botToken);

// Store user locations (in production, use a database)
const userLocations = new Map<
  string,
  { latitude: number; longitude: number; address?: string }
>();

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

    // Command to check stored location
    bot.command('mylocation', async ctx => {
      if (!ctx.from) return;

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

    // Register listeners to handle messages
    bot.on('message:text', async ctx => {
      if (!ctx.from) return;

      logger.info(`Received message from user ID: ${ctx.from.id}`);
      logger.info(`Received message: ${ctx.message.text}`);

      const updateInterval = 500; // Update every 500ms to avoid rate limits
      let messageCounter = 0;
      let lastProcessingMessage: any = null;

      try {
        // Get user's location if available and include it in the message context
        const userId = ctx.from.id.toString();
        const userLocation = userLocations.get(userId);

        let messageWithLocation = ctx.message.text;
        if (userLocation) {
          messageWithLocation += `\n\n[User's current location: Latitude ${userLocation.latitude}, Longitude ${userLocation.longitude}]`;
        }

        await messageHandler({
          data: messageWithLocation,
          userId: ctx.from.id.toString(),
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
export { userLocations };
