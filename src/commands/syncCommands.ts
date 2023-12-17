import { CommandInteraction, SlashCommandBuilder } from "discord.js";
import dotenv from "dotenv";
import { db } from "../util/db";
import { syncSlashCommands } from "../util/slashCommands";

dotenv.config();

export const data = new SlashCommandBuilder()
  .setName("sync")
  .setDescription("Syncs the bot's slash commands with Discord.");

export const execute = async (interaction: CommandInteraction) => {
  if (process.env.ADMIN_USER_ID === undefined) {
    await interaction.reply({
      content: "`ADMIN_USER_ID` must be provided. Please check your .env file.",
      ephemeral: true,
    });
    throw new Error(
      "`ADMIN_USER_ID` must be provided. Please check your .env file."
    );
  } else if (interaction.user.id !== process.env.ADMIN_USER_ID) {
    throw new Error("Sorry! Looks like you don't have the perms to do that.");
  }

  db.read();

  await syncSlashCommands(interaction.client);

  interaction.reply({ content: "Synced slash commands!", ephemeral: true });
};
