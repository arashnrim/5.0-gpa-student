import { Client, Collection, REST, Routes } from "discord.js";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

export const getSlashCommands = async (returnAsJson: boolean = false) => {
  let slashCommands: any[] | Collection<string, any>;

  if (returnAsJson) {
    slashCommands = [];
  } else {
    slashCommands = new Collection<string, any>();
  }

  const foldersPath = path.join(import.meta.dir, "..", "commands");
  const commandFiles = fs
    .readdirSync(foldersPath)
    .filter((file) => file.endsWith(".ts"));

  for (const file of commandFiles) {
    const filePath = path.join(foldersPath, file);
    const command = await import(filePath);

    if ("data" in command && "execute" in command) {
      if (returnAsJson) {
        (slashCommands as any[]).push(command.data.toJSON());
      } else {
        (slashCommands as Collection<string, any>).set(
          command.data.name,
          command
        );
      }
    } else {
      console.warn(
        `The command at ${filePath} is missing a required "data" or "execute" property.`
      );
    }
  }

  return slashCommands;
};

export const syncSlashCommands = async (client: Client) => {
  if (
    process.env.BOT_TOKEN === undefined ||
    process.env.APPLICATION_ID === undefined
  ) {
    throw new Error(
      "BOT_TOKEN and APPLICATION_ID must be provided. Please check your .env file."
    );
  }

  const slashCommands = await getSlashCommands(true);

  const rest = new REST().setToken(process.env.BOT_TOKEN as string);
  (async () => {
    try {
      console.info(
        `Attempting to refresh ${
          (slashCommands as any[]).length
        } slash commands...`
      );

      if (client.user === null) {
        throw new Error(
          "`client.user` is null. This should never happen. Investigate immediately."
        );
      }
      await rest.put(
        Routes.applicationCommands(process.env.APPLICATION_ID as string),
        {
          body: slashCommands,
        }
      );

      console.info("Successfully refreshed slash commands.");
    } catch (error) {
      console.error(error);
    }
  })();
};

// const client = new Client({
//   intents: [
//     GatewayIntentBits.GuildMembers,
//     GatewayIntentBits.Guilds,
//     GatewayIntentBits.GuildMessages,
//   ],
// });
// await client.login(process.env.BOT_TOKEN as string);

// syncSlashCommands(client);
