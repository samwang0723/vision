import { App } from '@slack/bolt';
import logger from '@utils/logger';
import { createSearchMessageBlocks } from './utils';

// Constants for message size limits
const MAX_BLOCK_TEXT_LENGTH = 2900; // Slack's block text limit with some buffer
const MAX_MESSAGE_LENGTH = 15000; // Setting a much lower limit to be safe
const VERY_LONG_MESSAGE_THRESHOLD = 30000; // Threshold for uploading as a file instead

// Helper function to split long messages into multiple blocks
const createMessageBlocks = (text: string, query: string) => {
  // If text is short enough, use the standard search message blocks
  if (text.length <= MAX_BLOCK_TEXT_LENGTH) {
    return createSearchMessageBlocks({
      text,
      query,
    });
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

  // Add the query context block
  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `🔍 Search query: "${query}"`,
      },
    ],
  });

  // Create a preview text that's not too long
  const previewText =
    text.length > 1000
      ? text.substring(0, 1000) + '... (truncated for preview)'
      : text;

  return {
    blocks,
    text: previewText,
  };
};

export class MessageUpdater {
  private accumulatedText = '';
  private updatePending = false;
  private lastUpdateTime = performance.now();
  private readonly UPDATE_INTERVAL = 800;
  private isLongMessage = false;
  private followUpMessageTs: string | null = null;
  private isMessageDeleted = false;

  constructor(
    private readonly app: App,
    private readonly channelId: string,
    private readonly messageTs: string,
    private readonly token: string,
    private readonly query: string
  ) {}

  async update(text: string): Promise<void> {
    // If the message has been deleted, don't try to update it
    if (this.isMessageDeleted) {
      logger.info('Message has been deleted, not updating');
      return;
    }

    this.accumulatedText += text;

    // Check if we're approaching the message size limit
    if (
      this.accumulatedText.length > VERY_LONG_MESSAGE_THRESHOLD &&
      !this.isLongMessage
    ) {
      this.isLongMessage = true;
      logger.info(
        `Message exceeds size threshold (${this.accumulatedText.length} chars), switching to file upload`
      );

      try {
        // Update the original message to indicate we're switching to a file upload
        await this.app.client.chat.update({
          token: this.token,
          channel: this.channelId,
          ts: this.messageTs,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '*Response is too long for a message. Uploading as a file...*',
              },
            },
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: `🔍 Search query: "${this.query}"`,
                },
              ],
            },
          ],
          text: 'Response is too long for a message. Uploading as a file...',
        });

        // Upload the accumulated text as a file
        try {
          logger.info(
            `Attempting to upload text (${this.accumulatedText.length} chars) as a file using files.uploadV2`
          );
          const result = await this.app.client.files.uploadV2({
            token: this.token,
            channel_id: this.channelId,
            content: this.accumulatedText,
            filename: 'search_results.txt',
            title: `Search Results: "${this.query}"`,
            initial_comment:
              'Here are the complete search results (uploaded as a file due to length):',
          });

          logger.info(
            `Successfully uploaded text as a file with ID: ${
              (result as any).file_id || 'unknown'
            }`
          );

          // Clear the accumulated text since we've uploaded it
          this.accumulatedText = '';
          logger.info('Successfully uploaded text as a file');
        } catch (uploadError) {
          const errorMessage =
            uploadError instanceof Error
              ? uploadError.message
              : String(uploadError);
          logger.error(`Failed to upload text as a file: ${errorMessage}`);

          // Try with a smaller chunk of text
          try {
            logger.info('Attempting to upload a smaller portion of the text');
            const truncatedText = this.accumulatedText.substring(0, 50000); // Try with a smaller chunk

            await this.app.client.files.uploadV2({
              token: this.token,
              channel_id: this.channelId,
              content: truncatedText,
              filename: 'search_results_truncated.txt',
              title: `Search Results (Truncated): "${this.query}"`,
              initial_comment:
                'Here is a truncated version of the search results (the full results were too large):',
            });

            logger.info('Successfully uploaded truncated text as a file');
            this.accumulatedText = ''; // Clear the text since we've uploaded a truncated version
          } catch (truncatedError) {
            logger.error('Failed to upload even a truncated text file');

            // Fall back to threaded mode if file upload fails
            try {
              await this.app.client.chat.update({
                token: this.token,
                channel: this.channelId,
                ts: this.messageTs,
                blocks: [
                  {
                    type: 'section',
                    text: {
                      type: 'mrkdwn',
                      text: '*Response is too long for a single message. Continuing in thread...*',
                    },
                  },
                  {
                    type: 'context',
                    elements: [
                      {
                        type: 'mrkdwn',
                        text: `🔍 Search query: "${this.query}"`,
                      },
                    ],
                  },
                ],
                text: 'Response is too long for a single message. Continuing in thread...',
              });

              // Post the first part of the response in a thread
              const firstChunkSize = Math.min(
                MAX_MESSAGE_LENGTH,
                this.accumulatedText.length
              );
              const firstChunk = this.accumulatedText.substring(
                0,
                firstChunkSize
              );

              logger.info(
                `Posting first chunk of ${firstChunkSize} chars in thread`
              );
              const response = await this.app.client.chat.postMessage({
                token: this.token,
                channel: this.channelId,
                thread_ts: this.messageTs,
                blocks: this.createBlocksFromText(firstChunk),
                text:
                  firstChunk.length > 1000
                    ? firstChunk.substring(0, 1000) + '...'
                    : firstChunk,
              });

              if (response.ts) {
                this.followUpMessageTs = response.ts;
              }
              this.accumulatedText =
                this.accumulatedText.substring(firstChunkSize);
              logger.info(
                `Remaining text: ${this.accumulatedText.length} chars`
              );
            } catch (fallbackError) {
              const fallbackErrorMessage =
                fallbackError instanceof Error
                  ? fallbackError.message
                  : String(fallbackError);
              logger.error(
                `Failed to fall back to threaded mode: ${fallbackErrorMessage}`
              );

              // Check if the message was deleted
              if (fallbackErrorMessage.includes('message_not_found')) {
                this.isMessageDeleted = true;
                logger.info('Message has been deleted, stopping updates');
              }
            }
          }
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.error(`Failed to upload text as a file: ${errorMessage}`);

        // Check if the message was deleted
        if (errorMessage.includes('message_not_found')) {
          this.isMessageDeleted = true;
          logger.info('Message has been deleted, stopping updates');
          return;
        }

        // Fall back to threaded mode if file upload fails
        try {
          await this.app.client.chat.update({
            token: this.token,
            channel: this.channelId,
            ts: this.messageTs,
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: '*Response is too long for a single message. Continuing in thread...*',
                },
              },
              {
                type: 'context',
                elements: [
                  {
                    type: 'mrkdwn',
                    text: `🔍 Search query: "${this.query}"`,
                  },
                ],
              },
            ],
            text: 'Response is too long for a single message. Continuing in thread...',
          });

          // Post the first part of the response in a thread
          const firstChunkSize = Math.min(
            MAX_MESSAGE_LENGTH,
            this.accumulatedText.length
          );
          const firstChunk = this.accumulatedText.substring(0, firstChunkSize);

          logger.info(
            `Posting first chunk of ${firstChunkSize} chars in thread`
          );
          const response = await this.app.client.chat.postMessage({
            token: this.token,
            channel: this.channelId,
            thread_ts: this.messageTs,
            blocks: this.createBlocksFromText(firstChunk),
            text:
              firstChunk.length > 1000
                ? firstChunk.substring(0, 1000) + '...'
                : firstChunk,
          });

          if (response.ts) {
            this.followUpMessageTs = response.ts;
          }
          this.accumulatedText = this.accumulatedText.substring(firstChunkSize);
          logger.info(`Remaining text: ${this.accumulatedText.length} chars`);
        } catch (fallbackError) {
          const fallbackErrorMessage =
            fallbackError instanceof Error
              ? fallbackError.message
              : String(fallbackError);
          logger.error(
            `Failed to fall back to threaded mode: ${fallbackErrorMessage}`
          );

          // Check if the message was deleted
          if (fallbackErrorMessage.includes('message_not_found')) {
            this.isMessageDeleted = true;
            logger.info('Message has been deleted, stopping updates');
          }
        }
      }
    } else if (
      this.accumulatedText.length > MAX_MESSAGE_LENGTH &&
      !this.isLongMessage
    ) {
      this.isLongMessage = true;
      logger.info(
        `Message exceeds size limit (${this.accumulatedText.length} chars), switching to threaded mode`
      );

      // Update the original message to indicate we're switching to a multi-message format
      try {
        await this.app.client.chat.update({
          token: this.token,
          channel: this.channelId,
          ts: this.messageTs,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '*Response is too long for a single message. Continuing in thread...*',
              },
            },
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: `🔍 Search query: "${this.query}"`,
                },
              ],
            },
          ],
          text: 'Response is too long for a single message. Continuing in thread...',
        });

        // Post the first part of the response in a thread
        const firstChunkSize = Math.min(
          MAX_MESSAGE_LENGTH,
          this.accumulatedText.length
        );
        const firstChunk = this.accumulatedText.substring(0, firstChunkSize);

        logger.info(`Posting first chunk of ${firstChunkSize} chars in thread`);
        const response = await this.app.client.chat.postMessage({
          token: this.token,
          channel: this.channelId,
          thread_ts: this.messageTs,
          blocks: this.createBlocksFromText(firstChunk),
          text:
            firstChunk.length > 1000
              ? firstChunk.substring(0, 1000) + '...'
              : firstChunk,
        });

        if (response.ts) {
          this.followUpMessageTs = response.ts;
        }
        this.accumulatedText = this.accumulatedText.substring(firstChunkSize);
        logger.info(`Remaining text: ${this.accumulatedText.length} chars`);
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.error(
          `Failed to switch to multi-message format: ${errorMessage}`
        );

        // Check if the message was deleted
        if (errorMessage.includes('message_not_found')) {
          this.isMessageDeleted = true;
          logger.info('Message has been deleted, stopping updates');
        }
      }
    }

    this.scheduleUpdate();
  }

  // Helper method to create blocks from text
  private createBlocksFromText(text: string): Array<any> {
    const blocks = [];
    let remainingText = text;

    while (remainingText.length > 0) {
      const blockSize = Math.min(MAX_BLOCK_TEXT_LENGTH, remainingText.length);
      let blockCutPoint = blockSize;

      // Find a good breaking point for the block
      if (blockSize < remainingText.length) {
        const blockNewlineIndex = remainingText.lastIndexOf(
          '\n',
          MAX_BLOCK_TEXT_LENGTH
        );
        if (blockNewlineIndex > MAX_BLOCK_TEXT_LENGTH / 2) {
          blockCutPoint = blockNewlineIndex + 1;
        } else {
          const blockSpaceIndex = remainingText.lastIndexOf(
            ' ',
            MAX_BLOCK_TEXT_LENGTH
          );
          if (blockSpaceIndex > MAX_BLOCK_TEXT_LENGTH / 2) {
            blockCutPoint = blockSpaceIndex + 1;
          }
        }
      }

      const blockText = remainingText.substring(0, blockCutPoint);
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: blockText,
        },
      });

      remainingText = remainingText.substring(blockCutPoint);
    }

    return blocks;
  }

  private scheduleUpdate(): void {
    if (this.updatePending) return;

    const timeUntilNextUpdate = Math.max(
      0,
      this.UPDATE_INTERVAL - (performance.now() - this.lastUpdateTime)
    );

    this.updatePending = true;
    if (timeUntilNextUpdate === 0) {
      this.performUpdate();
    } else {
      setTimeout(() => this.performUpdate(), timeUntilNextUpdate);
    }
  }

  private async performUpdate(): Promise<void> {
    // If the message has been deleted, don't try to update it
    if (this.isMessageDeleted) {
      logger.info('Message has been deleted, not performing update');
      this.updatePending = false;
      return;
    }

    try {
      if (this.isLongMessage) {
        // For long messages, we're posting updates in the thread
        if (this.accumulatedText.length > 0) {
          logger.info(
            `Updating threaded message with ${this.accumulatedText.length} chars`
          );

          // Check if we need to split this update into multiple messages
          if (this.accumulatedText.length > MAX_MESSAGE_LENGTH) {
            logger.info(
              `Accumulated text exceeds limit, checking if we should upload as a file`
            );

            // If the text is very long, upload as a file instead
            if (this.accumulatedText.length > VERY_LONG_MESSAGE_THRESHOLD) {
              logger.info(
                `Text is very long (${this.accumulatedText.length} chars), uploading as a file`
              );

              try {
                // Upload the accumulated text as a file
                await this.app.client.files.uploadV2({
                  token: this.token,
                  channel_id: this.channelId,
                  content: this.accumulatedText,
                  filename: 'search_results.txt',
                  title: `Search Results: "${this.query}"`,
                  initial_comment:
                    'Here are the complete search results (uploaded as a file due to length):',
                });

                // Clear the accumulated text since we've uploaded it
                this.accumulatedText = '';
                logger.info('Successfully uploaded text as a file');
                this.updatePending = false;
                return;
              } catch (uploadError) {
                const errorMessage =
                  uploadError instanceof Error
                    ? uploadError.message
                    : String(uploadError);
                logger.error(
                  `Failed to upload text as a file: ${errorMessage}`
                );
                // Continue with the normal flow if file upload fails
              }
            }

            // Post a new message with the current accumulated text
            const chunkSize = Math.min(
              MAX_MESSAGE_LENGTH,
              this.accumulatedText.length
            );
            const chunk = this.accumulatedText.substring(0, chunkSize);

            // Try to send with retries
            let retryCount = 0;
            const maxRetries = 3;
            let success = false;
            let finalChunkSize = chunkSize;

            while (!success && retryCount < maxRetries) {
              try {
                const finalChunk = this.accumulatedText.substring(
                  0,
                  finalChunkSize
                );
                logger.info(
                  `Sending chunk of ${finalChunk.length} chars (attempt ${
                    retryCount + 1
                  })`
                );

                // Split the chunk into multiple blocks to stay under the block text limit
                const blocks = this.createBlocksFromText(finalChunk);

                const response = await this.app.client.chat.postMessage({
                  token: this.token,
                  channel: this.channelId,
                  thread_ts: this.messageTs,
                  blocks,
                  text:
                    finalChunk.length > 1000
                      ? finalChunk.substring(0, 1000) + '...'
                      : finalChunk,
                });

                if (response.ts) {
                  this.followUpMessageTs = response.ts;
                }

                this.accumulatedText =
                  this.accumulatedText.substring(finalChunkSize);
                logger.info(
                  `Posted new chunk, remaining: ${this.accumulatedText.length} chars`
                );
                success = true;
              } catch (error) {
                retryCount++;
                const errorMessage =
                  error instanceof Error ? error.message : String(error);
                logger.error(
                  `Failed to send message chunk (attempt ${retryCount}): ${errorMessage}`
                );

                // Check if the message was deleted
                if (errorMessage.includes('message_not_found')) {
                  this.isMessageDeleted = true;
                  logger.info('Message has been deleted, stopping updates');
                  this.updatePending = false;
                  return;
                }

                if (
                  errorMessage.includes('invalid_blocks') ||
                  errorMessage.includes('msg_too_long')
                ) {
                  // If we hit a message size limit, reduce the chunk size for the next attempt
                  finalChunkSize = Math.floor(finalChunkSize * 0.7); // Reduce by 30%
                  logger.info(
                    `Reducing chunk size to ${finalChunkSize} characters for next attempt`
                  );
                }

                // Wait before retrying
                const waitTime = retryCount * 1000 + 500;
                logger.info(
                  `Waiting ${waitTime}ms before retry ${retryCount + 1}`
                );
                await new Promise(resolve => setTimeout(resolve, waitTime));

                // If this was our last retry and we still failed, try to upload as a file
                if (retryCount === maxRetries) {
                  logger.error(
                    `Failed to send chunk after ${maxRetries} attempts, trying to upload as a file`
                  );

                  try {
                    // Upload the accumulated text as a file
                    await this.app.client.files.uploadV2({
                      token: this.token,
                      channel_id: this.channelId,
                      content: this.accumulatedText,
                      filename: 'search_results.txt',
                      title: `Search Results: "${this.query}"`,
                      initial_comment:
                        'Here are the complete search results (uploaded as a file due to message size limits):',
                    });

                    // Clear the accumulated text since we've uploaded it
                    this.accumulatedText = '';
                    logger.info(
                      'Successfully uploaded text as a file after failed message attempts'
                    );
                    this.updatePending = false;
                    return;
                  } catch (uploadError) {
                    const uploadErrorMessage =
                      uploadError instanceof Error
                        ? uploadError.message
                        : String(uploadError);
                    logger.error(
                      `Failed to upload text as a file: ${uploadErrorMessage}`
                    );
                    this.accumulatedText = ''; // Clear the text to avoid retrying forever
                    this.updatePending = false;
                    return;
                  }
                }
              }
            }

            // If we still have more text, schedule another update
            if (this.accumulatedText.length > 0) {
              this.scheduleUpdate();
            }
          } else {
            // If we have a follow-up message, update it
            if (this.followUpMessageTs) {
              try {
                // Split the text into multiple blocks to stay under the block text limit
                const blocks = this.createBlocksFromText(this.accumulatedText);

                await this.app.client.chat.update({
                  token: this.token,
                  channel: this.channelId,
                  ts: this.followUpMessageTs,
                  blocks,
                  text:
                    this.accumulatedText.length > 1000
                      ? this.accumulatedText.substring(0, 1000) + '...'
                      : this.accumulatedText,
                });
              } catch (error) {
                const errorMessage =
                  error instanceof Error ? error.message : String(error);
                logger.error(
                  `Failed to update threaded message: ${errorMessage}`
                );

                // Check if the message was deleted
                if (errorMessage.includes('message_not_found')) {
                  this.isMessageDeleted = true;
                  logger.info('Message has been deleted, stopping updates');
                  this.updatePending = false;
                  return;
                }

                if (
                  errorMessage.includes('invalid_blocks') ||
                  errorMessage.includes('msg_too_long')
                ) {
                  // If the update is too long, post as a new message instead
                  logger.info(
                    'Message too long for update, posting as new message'
                  );
                  try {
                    // Split the text into multiple blocks
                    const blocks = this.createBlocksFromText(
                      this.accumulatedText
                    );

                    const response = await this.app.client.chat.postMessage({
                      token: this.token,
                      channel: this.channelId,
                      thread_ts: this.messageTs,
                      blocks,
                      text:
                        this.accumulatedText.length > 1000
                          ? this.accumulatedText.substring(0, 1000) + '...'
                          : this.accumulatedText,
                    });

                    if (response.ts) {
                      this.followUpMessageTs = response.ts;
                    }
                  } catch (postError) {
                    const postErrorMessage =
                      postError instanceof Error
                        ? postError.message
                        : String(postError);
                    logger.error(
                      `Failed to post new message after update failure: ${postErrorMessage}`
                    );

                    // Check if the message was deleted
                    if (postErrorMessage.includes('message_not_found')) {
                      this.isMessageDeleted = true;
                      logger.info('Message has been deleted, stopping updates');
                      this.updatePending = false;
                      return;
                    }

                    // Try to upload as a file as a last resort
                    try {
                      await this.app.client.files.uploadV2({
                        token: this.token,
                        channel_id: this.channelId,
                        content: this.accumulatedText,
                        filename: 'search_results.txt',
                        title: `Search Results: "${this.query}"`,
                        initial_comment:
                          'Here are the complete search results (uploaded as a file due to message size limits):',
                      });

                      // Clear the accumulated text since we've uploaded it
                      this.accumulatedText = '';
                      logger.info(
                        'Successfully uploaded text as a file after failed message attempts'
                      );
                    } catch (uploadError) {
                      logger.error(
                        'Failed to upload text as a file after all other attempts failed'
                      );
                    }
                  }
                }
              }
            } else {
              // Otherwise post a new message in the thread
              try {
                // Split the text into multiple blocks
                const blocks = this.createBlocksFromText(this.accumulatedText);

                const response = await this.app.client.chat.postMessage({
                  token: this.token,
                  channel: this.channelId,
                  thread_ts: this.messageTs,
                  blocks,
                  text:
                    this.accumulatedText.length > 1000
                      ? this.accumulatedText.substring(0, 1000) + '...'
                      : this.accumulatedText,
                });

                if (response.ts) {
                  this.followUpMessageTs = response.ts;
                }
              } catch (error) {
                const errorMessage =
                  error instanceof Error ? error.message : String(error);
                logger.error(
                  `Failed to post new threaded message: ${errorMessage}`
                );

                // Check if the message was deleted
                if (errorMessage.includes('message_not_found')) {
                  this.isMessageDeleted = true;
                  logger.info('Message has been deleted, stopping updates');
                  this.updatePending = false;
                  return;
                }

                if (
                  errorMessage.includes('invalid_blocks') ||
                  errorMessage.includes('msg_too_long')
                ) {
                  // If the message is too long, try to upload as a file
                  logger.info('Message too long, trying to upload as a file');

                  try {
                    await this.app.client.files.uploadV2({
                      token: this.token,
                      channel_id: this.channelId,
                      content: this.accumulatedText,
                      filename: 'search_results.txt',
                      title: `Search Results: "${this.query}"`,
                      initial_comment:
                        'Here are the complete search results (uploaded as a file due to message size limits):',
                    });

                    // Clear the accumulated text since we've uploaded it
                    this.accumulatedText = '';
                    logger.info(
                      'Successfully uploaded text as a file after failed message attempt'
                    );
                  } catch (uploadError) {
                    logger.error(
                      'Failed to upload text as a file after message attempt failed'
                    );
                    this.accumulatedText = this.accumulatedText.substring(
                      0,
                      MAX_MESSAGE_LENGTH / 2
                    );
                    this.scheduleUpdate(); // Try again with shorter text
                  }
                }
              }
            }
          }
        }
      } else {
        // For normal-sized messages, update the original message
        const messageContent = createMessageBlocks(
          this.accumulatedText,
          this.query
        );

        await this.app.client.chat.update({
          token: this.token,
          channel: this.channelId,
          ts: this.messageTs,
          ...messageContent,
        });
      }

      this.lastUpdateTime = performance.now();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`Failed to update Slack message: ${errorMessage}`);

      // Check if the message was deleted
      if (errorMessage.includes('message_not_found')) {
        this.isMessageDeleted = true;
        logger.info('Message has been deleted, stopping updates');
        this.updatePending = false;
        return;
      }

      // If we get a msg_too_long error, switch to multi-message mode
      if (
        !this.isLongMessage &&
        (errorMessage.includes('msg_too_long') ||
          errorMessage.includes('invalid_blocks'))
      ) {
        logger.info('Received error, switching to threaded mode');
        this.isLongMessage = true;
        this.scheduleUpdate(); // Try again with the new approach
      }
    } finally {
      this.updatePending = false;
    }
  }
}
