import { Client, Collection } from "discord.js";

export default class CustomClient extends Client {
  slashCommands: Collection<string, any> = new Collection();
}
