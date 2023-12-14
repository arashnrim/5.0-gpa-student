import dotenv from "dotenv";
import {
  ActivityType,
  Client,
  GatewayIntentBits,
  MessageType,
} from "discord.js";
import OpenAI from "openai";
import {
  ERROR_REACTION,
  IN_DEVELOPMENT_STRING,
  SUCCESS_REACTION,
  TEXT_GENERATION_ERROR_STRING,
} from "./constants";
import { JSONPreset } from "lowdb/node";
import { Database, MessageRole } from "./db";

dotenv.config();

if (process.env.BOT_TOKEN === undefined) {
  throw new Error("BOT_TOKEN must be provided. Please check your .env file.");
}

var DEVELOPMENT_SERVER_ID: undefined | string;
if (process.env.NODE_ENV !== "production") {
  if (process.env.DEVELOPMENT_SERVER_ID === undefined) {
    throw new Error(
      "DEVELOPMENT_SERVER_ID must be provided when not running in production mode. Please check your .env file."
    );
  }
  DEVELOPMENT_SERVER_ID = process.env.DEVELOPMENT_SERVER_ID;

  console.warn(
    "You are not running in production mode. In this mode, the bot will not respond to messages except for the ones whitelisted in the `DEVELOPMENT_SERVERS` variable."
  );
}

var openai: undefined | OpenAI;
if (process.env.OPENAI_API_KEY === undefined) {
  console.warn("OPENAI_API_KEY is not provided. Please check your .env file.");
  console.warn("You will not be able to use the completion feature.");
} else {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

const client = new Client({
  intents: [
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
});
const db = await JSONPreset<Database>("db.json", {
  conversations: [],
  lastUpdated: 0,
});

enum BotStatus {
  Ready,
  Thinking,
}

const setBotStatus = (status: BotStatus) => {
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
  }
};

client.on("ready", () => {
  if (client.user === null) {
    throw new Error(
      "`client.user` is null. This should never happen. Investigate immediately."
    );
  }

  setBotStatus(BotStatus.Ready);

  console.log(`Logged in as ${client.user.tag}! Listening for events...`);
});

client.on("messageCreate", async (message) => {
  if (client.user === null) {
    throw new Error(
      "`client.user` is null. This should never happen. Investigate immediately."
    );
  }

  if (message.author.bot) return;
  console.info(
    `Received message (${message.id}) from ${
      message.author.tag
    }: ${message.content.slice(0, 15)}...`
  );

  if (message.mentions.users.has(client.user.id)) {
    if (
      process.env.NODE_ENV !== "production" &&
      message.guild &&
      message.guild.id !== DEVELOPMENT_SERVER_ID
    ) {
      await message.react(ERROR_REACTION);
      await message.reply(IN_DEVELOPMENT_STRING);
      console.info(
        `Replied to ${message.id} from ${message.author.tag} with \`IN_DEVELOPMENT_STRING\`.`
      );
      return;
    }

    const thinkingPrompts = [
      "Hmm, lemme think for a moment...",
      "Gimme a sec, I'm thinking...",
      "Lemme wrap my head around that...",
      "Hollon, I'm processing...",
      "Just a moment, I'm brainstorming...",
      "Coming up with an answer...",
    ];
    const response = await message.reply(
      thinkingPrompts[Math.floor(Math.random() * thinkingPrompts.length)]
    );

    if (openai !== undefined) {
      var conversation;
      if (message.type === MessageType.Reply) {
        conversation = db.data.conversations.find((c) => {
          return c.messages.some((m) => {
            return m.id === message.reference?.messageId;
          });
        });
      }

      setBotStatus(BotStatus.Thinking);
      const completion = await openai.chat.completions.create({
        messages: [
          {
            role: "system",
            content:
              "Your main goal is to help a group of students to better understand content they're learning in school. When asked about something, give a concise yet specific answer to the prompt. Approach the problem with a personable and friendly tone, encouraging learning at every step of the way. Try to sound like how a teenager would interact, being informal, but do not overdo it. Because the medium you are communicating with them through is text, keep the content succinct and short for text.",
          },
          ...(conversation
            ? conversation.messages.map((conversationMessage) => ({
                role: conversationMessage.role,
                content: conversationMessage.content,
              }))
            : []),
          {
            role: "user",
            content: message.content,
          },
        ],
        model: "gpt-4-1106-preview",
        max_tokens: 410, // Discord has a limit of 2000 characters/message; 410 tokens ~ <2000 characters
      });

      var responseText = completion.choices[0].message.content;
      if (responseText === null) {
        console.warn(
          `Generated message is null; this is unexpected. Replied to ${message.id} from ${message.author.tag} with \`TEXT_GENERATION_ERROR_STRING\`.`
        );
        await response.edit(TEXT_GENERATION_ERROR_STRING);
        await message.react(ERROR_REACTION);
        setBotStatus(BotStatus.Ready);
        return;
      }
      responseText = responseText.substring(0, 2000); // Trims the response to 2000 characters if, for some reason, the generated response exceeds the limit

      try {
        await response.edit(responseText);
        await message.react(SUCCESS_REACTION);
        console.info(
          `Replied to ${message.id} from ${
            message.author.tag
          } with generated response: ${responseText.substring(0, 15)}...`
        );
      } catch (error) {
        console.error(error);
        await response.edit(TEXT_GENERATION_ERROR_STRING);
        await message.react(ERROR_REACTION);
        setBotStatus(BotStatus.Ready);
        return;
      }

      if (message.type !== MessageType.Reply) {
        db.data.conversations.push({
          messages: [
            {
              id: message.id,
              content: message.content,
              role: MessageRole.User,
            },
            {
              id: response.id,
              content: responseText,
              role: MessageRole.Assistant,
            },
          ],
          lastUpdated: Date.now(),
        });
      } else {
        const conversation = db.data.conversations.find((c) => {
          return c.messages.some((m) => {
            return m.id === message.reference?.messageId;
          });
        });

        if (conversation) {
          conversation.messages.push(
            ...[
              {
                id: message.id,
                content: message.content,
                role: MessageRole.User,
              },
              {
                id: response.id,
                content: responseText,
                role: MessageRole.Assistant,
              },
            ]
          );
          conversation.lastUpdated = Date.now();
        }
      }
      db.data.lastUpdated = Date.now();

      db.write();
      setBotStatus(BotStatus.Ready);
    }
  }
});

client.login(process.env.BOT_TOKEN);
