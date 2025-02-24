import { App } from '@slack/bolt';
import logger from '@utils/logger';
import { createSearchMessageBlocks } from './utils';

export class MessageUpdater {
  private accumulatedText = '';
  private updatePending = false;
  private lastUpdateTime = performance.now();
  private readonly UPDATE_INTERVAL = 800;

  constructor(
    private readonly app: App,
    private readonly channelId: string,
    private readonly messageTs: string,
    private readonly token: string,
    private readonly query: string
  ) {}

  async update(text: string): Promise<void> {
    this.accumulatedText += text;
    this.scheduleUpdate();
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
    try {
      const blocks = createSearchMessageBlocks({
        text: this.accumulatedText,
        query: this.query,
      });

      await this.app.client.chat.update({
        token: this.token,
        channel: this.channelId,
        ts: this.messageTs,
        ...blocks,
      });

      this.lastUpdateTime = performance.now();
    } catch (error) {
      logger.error('Failed to update Slack message:', error);
    } finally {
      this.updatePending = false;
    }
  }
}
