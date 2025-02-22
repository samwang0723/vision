import { SlackCommandMiddlewareArgs } from "@slack/bolt";

export const analysisHandler = async ({ command, ack, respond }: SlackCommandMiddlewareArgs): Promise<void> => {
  // Acknowledge command request
  await ack();
  await respond(`${command.text}`);
}