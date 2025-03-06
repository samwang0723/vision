import { AllMiddlewareArgs, SlackEventMiddlewareArgs } from '@slack/bolt';
import { SlackMessage, SlackMessageResponse } from './types';
import { callClaude, processResponse } from '@domains/anthropic/service';
import { createSearchMessageBlocks } from './utils';
import { MessageUpdater } from './MessageUpdater';
import config from '@/config';
import logger from '@utils/logger';
import { app } from '@/app';
import { ToolUseBlock } from '@anthropic-ai/sdk/resources/messages';

type MessageArgs = SlackEventMiddlewareArgs<'message'> & AllMiddlewareArgs;

export const messageHandler = async ({
  message,
  say,
}: MessageArgs): Promise<void> => {
  try {
    const msg = message as SlackMessage;
    // Ignore messages from bots to prevent potential loops
    if (msg.text === undefined || msg.subtype) {
      return;
    }

    // Send initial "thinking" message
    const initialResponse = await say(
      createSearchMessageBlocks({
        text: 'Thinking...',
        query: msg.text,
        isSearching: true,
      })
    );

    if (!initialResponse.ts) {
      throw new Error('Failed to get message timestamp');
    }

    // Track if the initial message has been deleted
    let initialMessageDeleted = false;

    // Initialize message updater
    const messageUpdater = new MessageUpdater(
      app,
      message.channel,
      initialResponse.ts,
      config.slack.botToken,
      msg.text
    );

    // Process with Claude
    const response = await callClaude(msg.text, msg.user, text => {
      // Only update if the initial message hasn't been deleted
      if (!initialMessageDeleted) {
        messageUpdater.update(text);
      }
    });

    // Check if response is a tool use
    const toolUseBlocks = response?.content.filter(
      (content): content is ToolUseBlock => content.type === 'tool_use'
    );

    // Show final results
    const textContent = response?.content
      .filter(content => content.type === 'text')
      .map(content => content.text)
      .join('\n');

    if (toolUseBlocks.length) {
      const firstToolUse = toolUseBlocks[0];
      // making button a new message to avoid previous message upading
      await app.client.chat.postMessage({
        token: config.slack.botToken,
        channel: message.channel,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: 'Please grant permission to execute',
            },
            accessory: {
              type: 'button',
              text: {
                type: 'plain_text',
                text: firstToolUse.name,
              },
              action_id: firstToolUse.name,
              value: msg.text,
            },
          },
        ],
        text: 'Please grant permission to execute',
      });
    } else {
      // Check if the response is too long for a single message
      const MAX_MESSAGE_LENGTH = 15000; // Setting a much lower limit to be safe
      const VERY_LONG_MESSAGE_THRESHOLD = 30000; // Threshold for uploading as a file instead

      if (textContent && textContent.length > VERY_LONG_MESSAGE_THRESHOLD) {
        // For very long messages, upload as a text snippet instead
        try {
          logger.info('Message is very long, uploading as a text snippet');

          // Delete the initial "thinking" message
          try {
            await app.client.chat.delete({
              token: config.slack.botToken,
              channel: message.channel,
              ts: initialResponse.ts,
            });
            initialMessageDeleted = true;
          } catch (deleteError) {
            const errorMessage =
              deleteError instanceof Error
                ? deleteError.message
                : String(deleteError);
            logger.warn(`Failed to delete initial message: ${errorMessage}`);
            // Continue anyway
          }

          // Upload the text as a snippet
          try {
            logger.info(
              'Attempting to upload text as a file using files.uploadV2'
            );
            const result = await app.client.files.uploadV2({
              token: config.slack.botToken,
              channel_id: message.channel,
              content: textContent,
              filename: 'response.txt',
              title: 'AI Response',
              initial_comment:
                'Here is the complete response (uploaded as a file due to length):',
            });

            logger.info(
              `Successfully uploaded text snippet with file ID: ${
                (result as any).file_id || 'unknown'
              }`
            );
          } catch (uploadError) {
            const errorMessage =
              uploadError instanceof Error
                ? uploadError.message
                : String(uploadError);
            logger.error(`Failed to upload text snippet: ${errorMessage}`);

            // Try with a smaller chunk of text
            try {
              logger.info('Attempting to upload a smaller portion of the text');
              const truncatedText = textContent.substring(0, 50000); // Try with a smaller chunk

              await app.client.files.uploadV2({
                token: config.slack.botToken,
                channel_id: message.channel,
                content: truncatedText,
                filename: 'response_truncated.txt',
                title: 'AI Response (Truncated)',
                initial_comment:
                  'Here is a truncated version of the response (the full response was too large):',
              });

              logger.info('Successfully uploaded truncated text snippet');
            } catch (truncatedUploadError) {
              logger.error('Failed to upload even a truncated text snippet');

              // Fall back to sending in chunks if file upload fails
              await sendLongMessageInChunks(textContent, message.channel);
            }
          }
        } catch (uploadError) {
          const errorMessage =
            uploadError instanceof Error
              ? uploadError.message
              : String(uploadError);
          logger.error(`Failed to upload text snippet: ${errorMessage}`);

          // Fall back to sending in chunks if file upload fails
          await sendLongMessageInChunks(textContent, message.channel);
        }
      } else if (textContent && textContent.length > MAX_MESSAGE_LENGTH) {
        // Delete the initial "thinking" message
        try {
          logger.info(
            'Message is too long, deleting initial message and sending in chunks'
          );
          await app.client.chat.delete({
            token: config.slack.botToken,
            channel: message.channel,
            ts: initialResponse.ts,
          });
          initialMessageDeleted = true;
        } catch (deleteError) {
          const errorMessage =
            deleteError instanceof Error
              ? deleteError.message
              : String(deleteError);
          logger.warn(`Failed to delete initial message: ${errorMessage}`);
          // Continue anyway, as we'll send the new messages regardless
        }

        // Split the content into multiple messages
        await sendLongMessageInChunks(textContent, message.channel);
      } else {
        try {
          // Only update if the initial message hasn't been deleted
          if (!initialMessageDeleted) {
            // Update the initial message with the response
            await app.client.chat.update({
              token: config.slack.botToken,
              channel: message.channel,
              ts: initialResponse.ts,
              blocks: createMessageBlocks(
                textContent || 'No response generated'
              ),
              text: textContent || 'No response generated',
            });
          } else {
            // If the initial message was deleted, send a new message
            await say(textContent || 'No response generated');
          }
        } catch (updateError) {
          const errorMessage =
            updateError instanceof Error
              ? updateError.message
              : String(updateError);

          logger.warn(`Failed to update message: ${errorMessage}`);

          // If we get a msg_too_long error, fall back to text snippet
          if (
            errorMessage.includes('msg_too_long') ||
            errorMessage.includes('invalid_blocks') ||
            errorMessage.includes('message_not_found')
          ) {
            logger.info('Received error, falling back to text snippet');

            // Only try to delete if the message hasn't been deleted yet
            if (!initialMessageDeleted) {
              try {
                // Try to delete the initial message
                await app.client.chat.delete({
                  token: config.slack.botToken,
                  channel: message.channel,
                  ts: initialResponse.ts,
                });
                initialMessageDeleted = true;
              } catch (deleteError) {
                const deleteErrorMessage =
                  deleteError instanceof Error
                    ? deleteError.message
                    : String(deleteError);
                logger.warn(
                  `Failed to delete message after error: ${deleteErrorMessage}`
                );
              }
            }

            // Try to upload as a text snippet
            try {
              logger.info(
                'Attempting to upload text as a file using files.uploadV2'
              );
              await app.client.files.uploadV2({
                token: config.slack.botToken,
                channel_id: message.channel,
                content: textContent || 'No response generated',
                filename: 'response.txt',
                title: 'AI Response',
                initial_comment:
                  'Here is the complete response (uploaded as a file due to formatting issues):',
              });

              logger.info('Successfully uploaded text snippet as fallback');
            } catch (uploadError) {
              const uploadErrorMessage =
                uploadError instanceof Error
                  ? uploadError.message
                  : String(uploadError);
              logger.error(
                `Failed to upload text snippet as fallback: ${uploadErrorMessage}`
              );

              // Try with a smaller chunk of text
              try {
                logger.info(
                  'Attempting to upload a smaller portion of the text'
                );
                const truncatedText = (
                  textContent || 'No response generated'
                ).substring(0, 50000); // Try with a smaller chunk

                await app.client.files.uploadV2({
                  token: config.slack.botToken,
                  channel_id: message.channel,
                  content: truncatedText,
                  filename: 'response_truncated.txt',
                  title: 'AI Response (Truncated)',
                  initial_comment:
                    'Here is a truncated version of the response (the full response was too large):',
                });

                logger.info('Successfully uploaded truncated text snippet');
              } catch (truncatedUploadError) {
                const truncatedErrorMessage =
                  truncatedUploadError instanceof Error
                    ? truncatedUploadError.message
                    : String(truncatedUploadError);
                logger.error(
                  `Failed to upload truncated text snippet: ${truncatedErrorMessage}`
                );

                // As a last resort, send a new message
                await say(
                  `I couldn't update my previous message. Here's my response:\n\n${
                    textContent?.substring(0, 3000) || 'No response generated'
                  }`
                );
              }
            }
          } else {
            // For other errors, just send a new message
            await say(
              `I couldn't update my previous message. Here's my response:\n\n${
                textContent || 'No response generated'
              }`
            );
          }
        }
      }
    }
  } catch (error) {
    logger.error('Failed to process message:', error);
    await say(`Sorry, I encountered an error: ${error}`);
  }
};

// Helper function to send a long message in multiple chunks
const sendLongMessageInChunks = async (text: string, channel: string) => {
  const MAX_CHUNK_SIZE = 15000; // Setting a much lower limit to be safe
  const MAX_BLOCK_TEXT_SIZE = 2900; // Slack's block text limit with some buffer
  let remainingText = text;
  let messageCount = 0;
  const totalMessages = Math.ceil(text.length / MAX_CHUNK_SIZE);

  logger.info(`Splitting long message into ${totalMessages} chunks`);

  while (remainingText.length > 0) {
    messageCount++;

    // Find a good breaking point (preferably at a newline or space)
    let cutPoint = Math.min(MAX_CHUNK_SIZE, remainingText.length);
    if (cutPoint < remainingText.length) {
      // Try to find a newline to break at
      const newlineIndex = remainingText.lastIndexOf('\n', MAX_CHUNK_SIZE);
      if (newlineIndex > MAX_CHUNK_SIZE / 2) {
        cutPoint = newlineIndex + 1; // Include the newline
      } else {
        // Try to find a space to break at
        const spaceIndex = remainingText.lastIndexOf(' ', MAX_CHUNK_SIZE);
        if (spaceIndex > MAX_CHUNK_SIZE / 2) {
          cutPoint = spaceIndex + 1; // Include the space
        }
      }
    }

    const chunkText = remainingText.substring(0, cutPoint);
    remainingText = remainingText.substring(cutPoint);

    // Add a header to indicate this is part of a multi-message response
    const header =
      totalMessages > 1 ? `*Part ${messageCount} of ${totalMessages}*\n\n` : '';

    // Try to send the message with retries
    let retryCount = 0;
    const maxRetries = 3;
    let success = false;

    while (!success && retryCount < maxRetries) {
      try {
        // Send this chunk as a separate message
        logger.info(
          `Sending message chunk ${messageCount} of ${totalMessages} (${
            chunkText.length
          } characters), attempt ${retryCount + 1}`
        );

        // Split the chunk into multiple blocks if needed
        const blocks = [];

        // Add the header as a separate block if it exists
        if (header) {
          blocks.push({
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: header,
            },
          });
        }

        // Split the chunk text into multiple blocks to stay under the block text limit
        let chunkRemaining = chunkText;
        while (chunkRemaining.length > 0) {
          const blockSize = Math.min(
            MAX_BLOCK_TEXT_SIZE,
            chunkRemaining.length
          );
          let blockCutPoint = blockSize;

          // Find a good breaking point for the block
          if (blockSize < chunkRemaining.length) {
            const blockNewlineIndex = chunkRemaining.lastIndexOf(
              '\n',
              MAX_BLOCK_TEXT_SIZE
            );
            if (blockNewlineIndex > MAX_BLOCK_TEXT_SIZE / 2) {
              blockCutPoint = blockNewlineIndex + 1;
            } else {
              const blockSpaceIndex = chunkRemaining.lastIndexOf(
                ' ',
                MAX_BLOCK_TEXT_SIZE
              );
              if (blockSpaceIndex > MAX_BLOCK_TEXT_SIZE / 2) {
                blockCutPoint = blockSpaceIndex + 1;
              }
            }
          }

          const blockText = chunkRemaining.substring(0, blockCutPoint);
          blocks.push({
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: blockText,
            },
          });

          chunkRemaining = chunkRemaining.substring(blockCutPoint);
        }

        // Send the message with multiple blocks
        await app.client.chat.postMessage({
          token: config.slack.botToken,
          channel,
          blocks,
          text:
            header +
            (chunkText.length > 1000
              ? chunkText.substring(0, 1000) + '...'
              : chunkText),
        });

        success = true;
        logger.info(`Successfully sent chunk ${messageCount}`);
      } catch (error) {
        retryCount++;
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.error(
          `Failed to send message chunk ${messageCount} (attempt ${retryCount}): ${errorMessage}`
        );

        // If we hit a rate limit or other error, wait longer before trying again
        const waitTime = retryCount * 1000 + 500; // Increasing backoff
        logger.info(`Waiting ${waitTime}ms before retry ${retryCount + 1}`);
        await new Promise(resolve => setTimeout(resolve, waitTime));

        // If this was our last retry and we still failed, log it but continue with the next chunk
        if (retryCount === maxRetries) {
          logger.error(
            `Failed to send chunk ${messageCount} after ${maxRetries} attempts, moving to next chunk`
          );
        }
      }
    }

    // Add a small delay between messages to avoid rate limiting
    if (remainingText.length > 0) {
      const delayTime = 500 + (messageCount % 5 === 0 ? 1000 : 0); // Extra delay every 5 messages
      await new Promise(resolve => setTimeout(resolve, delayTime));
    }
  }

  logger.info(`Finished sending all ${totalMessages} message chunks`);
};

// Helper function to split long messages into multiple blocks
const createMessageBlocks = (text: string) => {
  const MAX_BLOCK_TEXT_LENGTH = 2900; // Slack's limit with some buffer

  // If text is short enough, return a single block
  if (text.length <= MAX_BLOCK_TEXT_LENGTH) {
    return [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text,
        },
      },
    ];
  }

  // Otherwise, split into multiple blocks
  const blocks = [];
  let remainingText = text;

  while (remainingText.length > 0) {
    // Find a good breaking point (preferably at a newline or space)
    let cutPoint = MAX_BLOCK_TEXT_LENGTH;
    if (cutPoint < remainingText.length) {
      // Try to find a newline to break at
      const newlineIndex = remainingText.lastIndexOf(
        '\n',
        MAX_BLOCK_TEXT_LENGTH
      );
      if (newlineIndex > MAX_BLOCK_TEXT_LENGTH / 2) {
        cutPoint = newlineIndex + 1; // Include the newline
      } else {
        // Try to find a space to break at
        const spaceIndex = remainingText.lastIndexOf(
          ' ',
          MAX_BLOCK_TEXT_LENGTH
        );
        if (spaceIndex > MAX_BLOCK_TEXT_LENGTH / 2) {
          cutPoint = spaceIndex + 1; // Include the space
        }
      }
    }

    const blockText = remainingText.substring(0, cutPoint);
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: blockText,
      },
    });

    remainingText = remainingText.substring(cutPoint);
  }

  return blocks;
};
