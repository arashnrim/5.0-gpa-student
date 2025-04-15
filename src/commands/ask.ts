import { CommandInteraction, SlashCommandBuilder } from "discord.js";
import dotenv from "dotenv";
import { db, mapToPlatform, saveConversation } from "../util/db";
import { BotStatus, setBotStatus } from "../util/bot";
import {
  IN_DEVELOPMENT_STRING,
  TEXT_GENERATION_ERROR_STRING,
} from "../constants";
import { generateResponse } from "../util/response";

dotenv.config();

var DEVELOPMENT_SERVER_ID: undefined | string;
if (process.env.NODE_ENV !== "production") {
  DEVELOPMENT_SERVER_ID = process.env.DEVELOPMENT_SERVER_ID;
}

export const data = new SlashCommandBuilder()
  .setName("ask")
  .setDescription(
    "Ask the bot a question. Similar to pinging the bot, but has parameters."
  )
  .addStringOption((option) =>
    option
      .setName("model")
      .setDescription("The model to use.")
      .setRequired(true)
      .addChoices(
        {
          name: "GPT-4.1 (experimental)",
          value: "openai",
        },
        {
          name: "Gemini 2.5 Pro (experimental)",
          value: "google",
        }
      )
  )
  .addStringOption((option) =>
    option
      .setName("prompt")
      .setDescription("The prompt to use.")
      .setRequired(true)
  );

export const execute = async (interaction: CommandInteraction) => {
  db.read();

  console.info(
    `Received interaction (${interaction.id}) from ${interaction.user.tag}: ${interaction.commandName}`
  );

  if (
    process.env.NODE_ENV !== "production" &&
    interaction.guild &&
    interaction.guild.id !== DEVELOPMENT_SERVER_ID
  ) {
    await interaction.reply(IN_DEVELOPMENT_STRING);
    console.info(
      `Replied to ${interaction.id} from ${interaction.user.tag} with \`IN_DEVELOPMENT_STRING\`.`
    );
    return;
  }

  const model = interaction.options.get("model")?.value as string;

  const thinkingPrompts = [
    "Hmm, lemme think for a moment...",
    "Gimme a sec, I'm thinking...",
    "Lemme wrap my head around that...",
    "Hollon, I'm processing...",
    "Just a moment, I'm brainstorming...",
    "Coming up with an answer...",
  ];
  const responseMessage = await interaction.reply(
    thinkingPrompts[Math.floor(Math.random() * thinkingPrompts.length)]
  );

  setBotStatus(BotStatus.Thinking, interaction.client);
  var generatedResponse = await generateResponse(
    interaction,
    mapToPlatform(model)
  );
  if (generatedResponse === null || generatedResponse === undefined) {
    console.warn(
      `Generated message is null; this is unexpected. Replied to ${interaction.id} from ${interaction.user.tag} with \`TEXT_GENERATION_ERROR_STRING\`.`
    );
    await responseMessage.edit(TEXT_GENERATION_ERROR_STRING);
    setBotStatus(BotStatus.Ready, interaction.client);
    return;
  }
  var [responseText, platform] = generatedResponse;

  responseText = responseText.substring(0, 2000); // Trims the response to 2000 characters if, for some reason, the generated response exceeds the limit

  try {
    await responseMessage.edit(responseText);
    saveConversation({
      userMessage: interaction,
      responseMessage,
      responseText,
      platform,
    });
    console.info(
      `Replied to ${interaction.id} from ${
        interaction.user.tag
      } with generated response (using ${platform}): ${responseText.slice(
        0,
        15
      )}...`
    );
  } catch (error) {
    console.error(error);
    await responseMessage.edit(TEXT_GENERATION_ERROR_STRING);
    setBotStatus(BotStatus.Ready, interaction.client);
    return;
  }

  setBotStatus(BotStatus.Ready, interaction.client);
};
