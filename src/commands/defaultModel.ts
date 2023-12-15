import { CommandInteraction, SlashCommandBuilder } from "discord.js";
import { Platform, db } from "../util/db";
import dotenv from "dotenv";

dotenv.config();

export const data = new SlashCommandBuilder()
  .setName("default-model")
  .setDescription("Sets the global default model the bot will use.")
  .addStringOption((option) =>
    option
      .setName("model")
      .setDescription("The model to use.")
      .setRequired(true)
      .addChoices(
        {
          name: "GPT-4 Turbo",
          value: "openai",
        },
        {
          name: "Gemini Pro",
          value: "google",
        }
      )
  );

export const execute = async (interaction: CommandInteraction) => {
  if (process.env.ADMIN_USER_ID === undefined) {
    throw new Error(
      "`ADMIN_USER_ID` must be provided. Please check your .env file."
    );
  } else if (interaction.user.id !== process.env.ADMIN_USER_ID) {
    throw new Error("Sorry! Looks like you don't have the perms to do that.");
  }

  db.read();

  const currentModel = db.data.defaultPlatform;
  const setModel = interaction.options.get("model")?.value as string;
  db.data.defaultPlatform = setModel as Platform;

  db.write();

  await interaction.reply({
    content: `Gotcha, the default model's set to ${setModel} from ${currentModel}.`,
    ephemeral: true,
  });
};
