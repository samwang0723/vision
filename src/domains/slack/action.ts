import { SlackActionMiddlewareArgs, BlockButtonAction } from "@slack/bolt";

export const actionHandler = async ({ body, ack, respond }: SlackActionMiddlewareArgs<BlockButtonAction>): Promise<void> => {
  // Acknowledge the action
  await ack();
  await respond(`<@${body.user.id}> clicked the button`);
}