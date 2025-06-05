import config from '@config/index';
import logger from '@utils/logger';
import { initMemoryTools } from './tools/memory/command';
import { initPlaywrightTools } from './tools/playwright/command';
import { initBookingTools } from './tools/booking/command';
import { Bot } from 'grammy';
import { messageHandler } from './domains/anthropic/handler';
import { initTimeTools } from './tools/time/command';

const bot = new Bot(config.telegram.botToken);

(async (): Promise<void> => {
  try {
    // Run initialization functions concurrently
    await Promise.all([
      initMemoryTools(),
      initBookingTools(),
      initTimeTools(),
      // initPlaywrightTools(),
    ]);

    // Register listeners to handle messages
    bot.on('message:text', async ctx => {
      logger.info(`Received message from user ID: ${ctx.from.id}`);
      logger.info(`Received message: ${ctx.message.text}`);

      // ctx.reply('Echo: ' + ctx.message.text);
      // return;

      const updateInterval = 500; // Update every 500ms to avoid rate limits
      let messageCounter = 0;

      try {
        await messageHandler({
          data: ctx.message.text,
          userId: ctx.from.id.toString(),
          onNewClaude: async () => {
            messageCounter++;

            // Create a new message for each Claude call
            const initialText =
              messageCounter === 1
                ? '🤔 Thinking...'
                : `🔧 Processing step ${messageCounter}...`;

            const newMessage = await ctx.reply(initialText);

            let messageLastSent = initialText;
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
