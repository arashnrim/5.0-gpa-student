import { Client, ActivityType } from "discord.js";

export enum BotStatus {
  Ready,
  Thinking,
  InDevelopment,
}

export const setBotStatus = (status: BotStatus, client: Client) => {
  if (client.user === null) {
    throw new Error(
      "`client.user` is null. This should never happen. Investigate immediately."
    );
  }

  switch (status) {
    case BotStatus.Ready:
      client.user.setActivity({
        type: ActivityType.Custom,
        name: "👀 Watching for pings",
      });
      break;
    case BotStatus.Thinking:
      client.user.setActivity({
        type: ActivityType.Custom,
        name: "🤔 Thinking...",
      });
      break;
    case BotStatus.InDevelopment:
      client.user.setActivity({
        type: ActivityType.Custom,
        name: "🛠️ In development",
      });
  }
};
