import type { Low } from "lowdb";
import { JSONPreset } from "lowdb/node";

export enum OpenAIMessageRole {
  User = "user",
  Assistant = "assistant",
}

export enum GoogleMessageRole {
  User = "user",
  Model = "model",
}

export enum Platform {
  OpenAI = "openai",
  Google = "google",
}

type Database = {
  conversations: {
    messages: {
      id: string;
      content: string;
      role: OpenAIMessageRole | GoogleMessageRole;
    }[];
    lastUpdated: number;
    platform?: Platform;
  }[];
  lastUpdated: number;
  defaultPlatform: Platform;
};

export const mapToConversationType = (
  type: string,
  platform: Platform
): OpenAIMessageRole | GoogleMessageRole => {
  switch (type) {
    case "user":
      if (platform === Platform.OpenAI) {
        return OpenAIMessageRole.User;
      } else if (platform === Platform.Google) {
        return GoogleMessageRole.User;
      }
    case "assistant":
      return OpenAIMessageRole.Assistant;
    case "model":
      return GoogleMessageRole.Model;
    default:
      throw new Error(`Unknown conversation type: ${type}`);
  }
};

export const db: Low<Database> = await JSONPreset<Database>("db.json", {
  conversations: [],
  lastUpdated: 0,
  defaultPlatform: Platform.OpenAI,
});

db.write();
