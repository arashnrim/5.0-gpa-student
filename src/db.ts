export enum MessageRole {
  User = "user",
  Assistant = "assistant",
}

export const mapToConversationType = (type: string): MessageRole => {
  switch (type) {
    case "user":
      return MessageRole.User;
    case "assistant":
      return MessageRole.Assistant;
    default:
      throw new Error(`Unknown conversation type: ${type}`);
  }
};

export type Database = {
  conversations: {
    messages: {
      id: string;
      content: string;
      role: MessageRole;
    }[];
    lastUpdated: number;
  }[];
  lastUpdated: number;
};
