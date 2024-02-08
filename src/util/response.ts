import { GoogleGenerativeAI } from "@google/generative-ai";
import { CommandInteraction, Message, MessageType } from "discord.js";
import OpenAI from "openai";
import { PROMPT } from "../constants";
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
if (process.env.GOOGLE_API_KEY === undefined) {
  console.warn("GOOGLE_API_KEY is not provided. Please check your .env file.");
  console.warn(
    "You will not be able to use the completion feature using Google's Gemini models."
  );
} else {
  google = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
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

  if (
    (conversation?.platform === Platform.Google ||
      (conversation?.platform === undefined &&
        db.data.defaultPlatform === Platform.Google) ||
      platform === Platform.Google) &&
    google !== undefined
  ) {
    const model = google.getGenerativeModel({ model: "gemini-pro" });
    const chat = model.startChat({
      history: [
        { role: GoogleMessageRole.User, parts: PROMPT },
        {
          role: GoogleMessageRole.Model,
          parts: "Understood. I will abide by the prompt given to me.",
        },
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

    const completion = await chat.sendMessage(content);
    const response = await completion.response;
    return [response.text(), Platform.Google];
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
          content,
        },
      ],
      model: "gpt-4-0125-preview",
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
