import { GoogleGenerativeAI } from "@google/generative-ai";
import {
  ActivityType,
  Client,
  Collection,
  GatewayIntentBits,
  Message,
  MessageType,
} from "discord.js";
import dotenv from "dotenv";
import OpenAI from "openai";
import {
  ERROR_REACTION,
  IN_DEVELOPMENT_STRING,
  PROMPT,
  SUCCESS_REACTION,
  TEXT_GENERATION_ERROR_STRING,
} from "./constants";
import { GoogleMessageRole, OpenAIMessageRole, Platform, db } from "./util/db";
import { getSlashCommands } from "./util/slashCommands";

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
  console.warn(
    "You will not be able to use the completion feature using OpenAI's GPT models."
  );
} else {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}
var google: undefined | GoogleGenerativeAI;
if (process.env.GOOGLE_API_KEY === undefined) {
  console.warn("GOOGLE_API_KEY is not provided. Please check your .env file.");
  console.warn(
    "You will not be able to use the completion feature using Google's Gemini models."
  );
} else {
  google = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
}

const client = new Client({
  intents: [
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
});
const commands = await getSlashCommands();

enum BotStatus {
  Ready,
  Thinking,
  InDevelopment,
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
    case BotStatus.InDevelopment:
      client.user.setActivity({
        type: ActivityType.Custom,
        name: "🛠️ In development",
      });
  }
};

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  console.info(
    `Received interaction (${interaction.id}) from ${interaction.user.tag}: ${interaction.commandName}`
  );

  const command = (commands as Collection<string, any>).get(
    interaction.commandName
  );
  if (!command) {
    console.warn(
      `Received interaction (${interaction.id}) from ${interaction.user.tag} for unknown command ${interaction.commandName}.`
    );
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: error as string,
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: error as string,
        ephemeral: true,
      });
    }
  }
});

client.on("ready", async () => {
  if (client.user === null) {
    throw new Error(
      "`client.user` is null. This should never happen. Investigate immediately."
    );
  }

  setBotStatus(
    process.env.NODE_ENV !== "production"
      ? BotStatus.InDevelopment
      : BotStatus.Ready
  );

  console.log(`Logged in as ${client.user.tag}! Listening for events...`);
});

client.on("messageCreate", async (message) => {
  db.read();

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
    const responseMessage = await message.reply(
      thinkingPrompts[Math.floor(Math.random() * thinkingPrompts.length)]
    );

    setBotStatus(BotStatus.Thinking);
    var generatedResponse = await generateResponse(message);
    if (generatedResponse === null || generatedResponse === undefined) {
      console.warn(
        `Generated message is null; this is unexpected. Replied to ${message.id} from ${message.author.tag} with \`TEXT_GENERATION_ERROR_STRING\`.`
      );
      await responseMessage.edit(TEXT_GENERATION_ERROR_STRING);
      await message.react(ERROR_REACTION);
      setBotStatus(BotStatus.Ready);
      return;
    }
    var [responseText, platform] = generatedResponse;

    responseText = responseText.substring(0, 2000); // Trims the response to 2000 characters if, for some reason, the generated response exceeds the limit

    try {
      await responseMessage.edit(responseText);
      await message.react(SUCCESS_REACTION);
      console.info(
        `Replied to ${message.id} from ${
          message.author.tag
        } with generated response (using ${platform}): ${responseText.slice(
          0,
          15
        )}...`
      );
    } catch (error) {
      console.error(error);
      await responseMessage.edit(TEXT_GENERATION_ERROR_STRING);
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
            role:
              platform === Platform.OpenAI
                ? OpenAIMessageRole.User
                : GoogleMessageRole.User,
          },
          {
            id: responseMessage.id,
            content: responseText,
            role:
              platform === Platform.OpenAI
                ? OpenAIMessageRole.Assistant
                : GoogleMessageRole.Model,
          },
        ],
        platform,
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
              role:
                platform === Platform.OpenAI
                  ? OpenAIMessageRole.User
                  : GoogleMessageRole.User,
            },
            {
              id: responseMessage.id,
              content: responseText,
              role:
                platform === Platform.OpenAI
                  ? OpenAIMessageRole.Assistant
                  : GoogleMessageRole.Model,
            },
          ]
        );
        conversation.platform = platform;
        conversation.lastUpdated = Date.now();
      }
    }
    db.data.lastUpdated = Date.now();
    db.write();

    setBotStatus(BotStatus.Ready);
  }
});

const generateResponse = async (
  responseMessage: Message
): Promise<[string, Platform] | null | undefined> => {
  var conversation;
  if (responseMessage.type === MessageType.Reply) {
    conversation = db.data.conversations.find((c) => {
      return c.messages.some((m) => {
        return m.id === responseMessage.reference?.messageId;
      });
    });
  }

  if (
    (conversation?.platform === Platform.Google ||
      (conversation?.platform === undefined &&
        db.data.defaultPlatform === Platform.Google)) &&
    google !== undefined
  ) {
    const model = google.getGenerativeModel({ model: "gemini-pro" });
    const chat = model.startChat({
      history: [
        ...(conversation
          ? conversation.messages.map((conversationMessage) => ({
              role: conversationMessage.role as GoogleMessageRole,
              parts: conversationMessage.content,
            }))
          : []),
      ],
      generationConfig: {
        maxOutputTokens: 410, // Discord has a limit of 2000 characters/message; 410 tokens ~ <2000 characters
      },
    });

    const completion = await chat.sendMessage(responseMessage.content);
    const response = await completion.response;
    return [response.text(), Platform.Google];
  } else if (
    (conversation?.platform === Platform.OpenAI ||
      (conversation?.platform === undefined &&
        db.data.defaultPlatform === Platform.OpenAI)) &&
    openai !== undefined
  ) {
    const completion = await openai.chat.completions.create({
      messages: [
        {
          role: "system",
          content: PROMPT,
        },
        ...(conversation
          ? conversation.messages.map((conversationMessage) => ({
              role: conversationMessage.role as OpenAIMessageRole,
              content: conversationMessage.content,
            }))
          : []),
        {
          role: "user",
          content: responseMessage.content,
        },
      ],
      model: "gpt-4-1106-preview",
      max_tokens: 410, // Discord has a limit of 2000 characters/message; 410 tokens ~ <2000 characters
    });

    const responseText = completion.choices[0].message.content;
    if (responseText === null) {
      return null;
    } else {
      return [responseText, Platform.OpenAI];
    }
  }
};

client.login(process.env.BOT_TOKEN);
