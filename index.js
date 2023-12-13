import dotenv from "dotenv";
import { Client, GatewayIntentBits } from "discord.js";

dotenv.config();

if (process.env.BOT_TOKEN === undefined) {
  throw new Error("BOT_TOKEN must be provided. Please check your .env file.");
}

const client = new Client({
  intents: [
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
});

client.on("ready", () => {
  console.log(`Logged in as ${client.user.tag}! Listening for events...`);
});

client.on("messageCreate", (message) => {
  if (message.author.bot) return;
});

client.login(process.env.BOT_TOKEN);
