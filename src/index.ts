import dotenv from "dotenv";
import { Client, GatewayIntentBits } from "discord.js";
import OpenAI from "openai";
import {
  ERROR_REACTION,
  IN_DEVELOPMENT_STRING,
  SUCCESS_REACTION,
  TEXT_GENERATION_ERROR_STRING,
} from "./constants";

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

client.on("ready", () => {
  if (client.user === null) {
    throw new Error(
      "`client.user` is null. This should never happen. Investigate immediately."
    );
  }

  console.log(`Logged in as ${client.user.tag}! Listening for events...`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  if (
    process.env.NODE_ENV !== "production" &&
    message.guild &&
    message.guild.id !== DEVELOPMENT_SERVER_ID
  ) {
    await message.react(ERROR_REACTION);
    await message.reply(IN_DEVELOPMENT_STRING);
    return;
  }

  if (client.user === null) {
    throw new Error(
      "`client.user` is null. This should never happen. Investigate immediately."
    );
  }
  if (message.mentions.users.has(client.user.id)) {
    const thinkingPrompts = [
      "Let me think...",
      "Got it, give me a sec...",
      "Let me see...",
    ];
    const response = await message.reply(
      thinkingPrompts[Math.floor(Math.random() * thinkingPrompts.length)]
    );

    if (openai !== undefined) {
      const typingInterval = setInterval(() => {
        message.channel.sendTyping();
      }, 9000);
      const completion = await openai.chat.completions.create({
        messages: [
          {
            role: "system",
            content:
              "Your main goal is to help a group of students to better understand content they're learning in school. When asked about something, give a concise yet specific answer to the prompt. Approach the problem with a personable and friendly tone, encouraging learning at every step of the way. Try to sound like how a teenager would interact, being informal, but do not overdo it. Only write less than 434 tokens, which is 2000 characters.",
          },
          {
            role: "user",
            content: message.content,
          },
        ],
        model: "gpt-4-1106-preview",
        max_tokens: 415, // 415 ~ <2000 characters, which is the limit for Discord messages.
      });

      // Discord has a limit of 2000 characters per message, so we need to split the response into multiple messages if it's too long.
      const responseText = completion.choices[0].message.content;
      if (responseText === null) {
        await response.edit(TEXT_GENERATION_ERROR_STRING);
        await message.react(ERROR_REACTION);
        clearInterval(typingInterval);
        return;
      }

      const responseMessages = responseText.match(/[\s\S]{1,2000}/g);
      if (responseMessages === null) {
        await response.edit(TEXT_GENERATION_ERROR_STRING);
        await message.react(ERROR_REACTION);
        clearInterval(typingInterval);
        return;
      }

      if (responseMessages.length > 1) {
        await response.delete();
        for (const responseMessage of responseMessages) {
          if (responseMessage === responseMessages[0]) {
            await message.reply(responseMessage);
          } else {
            await message.channel.send(responseMessage);
          }
        }
      } else {
        await response.edit(responseText);
      }

      await message.react(SUCCESS_REACTION);
      clearInterval(typingInterval);
    }
  }
});

client.login(process.env.BOT_TOKEN);
