import {
  CommandInteraction,
  InteractionResponse,
  Message,
  MessageType,
} from "discord.js";
import type { Low } from "lowdb";
import { JSONFilePreset } from "lowdb/node";

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

export const mapToPlatform = (platform: string): Platform => {
  switch (platform) {
    case "openai":
      return Platform.OpenAI;
    case "google":
      return Platform.Google;
    default:
      throw new Error(`Unknown platform: ${platform}`);
  }
};

export const saveConversation = (data: {
  userMessage: Message | CommandInteraction;
  responseMessage: Message | InteractionResponse;
  responseText: string;
  platform: Platform;
}) => {
  if (data.userMessage.type !== MessageType.Reply) {
    db.data.conversations.push({
      messages: [
        {
          id: data.userMessage.id,
          content:
            data.userMessage instanceof Message
              ? data.userMessage.content
              : (data.userMessage.options.get("prompt")?.value as string),
          role:
            data.platform === Platform.OpenAI
              ? OpenAIMessageRole.User
              : GoogleMessageRole.User,
        },
        {
          id: data.responseMessage.id,
          content: data.responseText,
          role:
            data.platform === Platform.OpenAI
              ? OpenAIMessageRole.Assistant
              : GoogleMessageRole.Model,
        },
      ],
      platform: data.platform,
      lastUpdated: Date.now(),
    });
  } else {
    const conversation = db.data.conversations.find((c) => {
      return c.messages.some((m) => {
        if (data.userMessage instanceof Message) {
          return m.id === data.userMessage.reference?.messageId;
        } else if (data.userMessage instanceof CommandInteraction) {
          return m.id === data.userMessage.id;
        }
      });
    });

    if (conversation) {
      conversation.messages.push(
        ...[
          {
            id: data.userMessage.id,
            content: data.userMessage.content,
            role:
              data.platform === Platform.OpenAI
                ? OpenAIMessageRole.User
                : GoogleMessageRole.User,
          },
          {
            id: data.responseMessage.id,
            content: data.responseText,
            role:
              data.platform === Platform.OpenAI
                ? OpenAIMessageRole.Assistant
                : GoogleMessageRole.Model,
          },
        ]
      );
      conversation.platform = data.platform;
      conversation.lastUpdated = Date.now();
    }
  }
  db.data.lastUpdated = Date.now();
  db.write();
};

export const db: Low<Database> = await JSONFilePreset<Database>("db.json", {
  conversations: [],
  lastUpdated: 0,
  defaultPlatform: Platform.OpenAI,
});

db.write();
