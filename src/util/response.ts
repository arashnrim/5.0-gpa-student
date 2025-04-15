import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleGenAI } from "@google/genai";
import { CommandInteraction, Message, MessageType } from "discord.js";
import OpenAI from "openai";
import { PROMPT, addContextToPrompt } from "../constants";
import { GoogleMessageRole, OpenAIMessageRole, Platform, db } from "./db";

var openai: undefined | OpenAI;
if (process.env.OPENAI_API_KEY === undefined) {
  console.warn("OPENAI_API_KEY is not provided. Please check your .env file.");
  console.warn(
    "You will not be able to use the completion feature using OpenAI's GPT models."
  );
} else {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    organization: process.env.OPENAI_ORG_ID
      ? process.env.OPENAI_ORG_ID
      : undefined,
  });
}
var google: undefined | GoogleGenerativeAI;
var googleGenAI: undefined | GoogleGenAI;
if (process.env.GOOGLE_API_KEY === undefined) {
  console.warn("GOOGLE_API_KEY is not provided. Please check your .env file.");
  console.warn(
    "You will not be able to use the completion feature using Google's Gemini models."
  );
} else {
  google = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  googleGenAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
}

const OPENAI_MODEL = "gpt-4.1-2025-04-14";
const GOOGLE_MODEL = "gemini-2.5-pro-exp-03-25";

if (process.env.BOT_TOKEN === undefined) {
  throw new Error("BOT_TOKEN must be provided. Please check your .env file.");
}

export const generateResponse = async (
  userMessage: Message | CommandInteraction,
  platform?: Platform
): Promise<[string, Platform] | null | undefined> => {
  db.read();

  var conversation;
  if (
    userMessage instanceof Message &&
    userMessage.type === MessageType.Reply
  ) {
    conversation = db.data.conversations.find((c) => {
      return c.messages.some((m) => {
        return m.id === userMessage.reference?.messageId;
      });
    });
  }

  var content;
  if (userMessage instanceof Message) {
    content = userMessage.content;
  } else if (userMessage instanceof CommandInteraction) {
    const prompt = userMessage.options.get("prompt");
    if (prompt === undefined || prompt === null) {
      throw new Error("Prompt is undefined.");
    }
    content = prompt.value as string;
  } else {
    throw new Error(
      "User message is neither a Message nor a CommandInteraction."
    );
  }

  // Strips out the bot mention from the message content
  content = content.replaceAll(`@${userMessage.client.user.id}`, "");

  if (
    (conversation?.platform === Platform.Google ||
      (conversation?.platform === undefined &&
        db.data.defaultPlatform === Platform.Google) ||
      platform === Platform.Google) &&
    google !== undefined
  ) {
    const model = google.getGenerativeModel({ model: GOOGLE_MODEL });
    const chat = model.startChat({
      history: [
        {
          role: GoogleMessageRole.User,
          parts: [
            {
              text: userMessage.member
                ? addContextToPrompt(userMessage.member.user.id)
                : PROMPT,
            },
          ],
        },
        {
          role: GoogleMessageRole.Model,
          parts: [
            { text: "Understood. I will abide by the prompt given to me." },
          ],
        },
        ...(conversation
          ? conversation.messages.map((conversationMessage) => ({
              role: conversationMessage.role as GoogleMessageRole,
              parts: [{ text: conversationMessage.content }],
            }))
          : []),
      ],
      generationConfig: {
        maxOutputTokens: 410, // Discord has a limit of 2000 characters/message; 410 tokens ~ <2000 characters
      },
    });

    const completion = await chat.sendMessage(content);
    const response = await completion.response;

    const newChat = await googleGenAI?.chats.create({
      model: GOOGLE_MODEL,
      history: [
        {
          role: GoogleMessageRole.User,
          parts: [
            {
              text: userMessage.member
                ? addContextToPrompt(userMessage.member.user.id)
                : PROMPT,
            },
          ],
        },
        {
          role: GoogleMessageRole.Model,
          parts: [
            { text: "Understood. I will abide by the prompt given to me." },
          ],
        },
        ...(conversation
          ? conversation.messages.map((conversationMessage) => ({
              role: conversationMessage.role as GoogleMessageRole,
              parts: [{ text: conversationMessage.content }],
            }))
          : []),
      ],
      config: {
        maxOutputTokens: 410, // Discord has a limit of 2000 characters/message; 410 tokens ~ <2000 characters
      },
    });
    const newResponse = await newChat?.sendMessage({ message: content });

    return [newResponse?.text ?? "", Platform.Google];
  } else if (
    (conversation?.platform === Platform.OpenAI ||
      (conversation?.platform === undefined &&
        db.data.defaultPlatform === Platform.OpenAI) ||
      platform === Platform.OpenAI) &&
    openai !== undefined
  ) {
    const completion = await openai.chat.completions.create({
      messages: [
        {
          role: "system",
          content: userMessage.member
            ? addContextToPrompt(userMessage.member.user.id)
            : PROMPT,
        },
        ...(conversation
          ? conversation.messages.map((conversationMessage) => ({
              role: conversationMessage.role as OpenAIMessageRole,
              content: conversationMessage.content,
            }))
          : []),
        {
          role: "user",
          content,
        },
      ],
      model: OPENAI_MODEL,
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
