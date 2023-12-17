import { Client, Collection, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";

import {
  ERROR_REACTION,
  IN_DEVELOPMENT_STRING,
  SUCCESS_REACTION,
  TEXT_GENERATION_ERROR_STRING,
} from "./constants";
import { db, saveConversation } from "./util/db";
import { generateResponse } from "./util/response";
import { getSlashCommands } from "./util/slashCommands";
import { BotStatus, setBotStatus } from "./util/bot";

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

const client = new Client({
  intents: [
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
});
const commands = await getSlashCommands();

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
      : BotStatus.Ready,
    client
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

  if (message.mentions.users.has(client.user.id)) {
    console.info(
      `Received message (${message.id}) from ${
        message.author.tag
      }: ${message.content.slice(0, 15)}...`
    );

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

    setBotStatus(BotStatus.Thinking, client);
    var generatedResponse = await generateResponse(message);
    if (generatedResponse === null || generatedResponse === undefined) {
      console.warn(
        `Generated message is null; this is unexpected. Replied to ${message.id} from ${message.author.tag} with \`TEXT_GENERATION_ERROR_STRING\`.`
      );
      await responseMessage.edit(TEXT_GENERATION_ERROR_STRING);
      await message.react(ERROR_REACTION);
      setBotStatus(BotStatus.Ready, client);
      return;
    }
    var [responseText, platform] = generatedResponse;

    responseText = responseText.substring(0, 2000); // Trims the response to 2000 characters if, for some reason, the generated response exceeds the limit

    try {
      await responseMessage.edit(responseText);
      await message.react(SUCCESS_REACTION);
      saveConversation({
        userMessage: message,
        responseMessage,
        responseText,
        platform,
      });
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
      setBotStatus(BotStatus.Ready, client);
      return;
    }

    setBotStatus(BotStatus.Ready, client);
  }
});

client.login(process.env.BOT_TOKEN);
