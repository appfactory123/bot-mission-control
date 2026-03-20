export const bots = [
  {
    id: "henry",
    name: "Henry",
    role: "Mission lead",
    model: "Claude Code",
    device: "Mission control",
    status: "Coordinating",
  },
  {
    id: "charlie",
    name: "Charlie",
    role: "Engineer",
    model: "Qwen local",
    device: "Mac Studio",
    status: "Building",
  },
  {
    id: "violet",
    name: "Violet",
    role: "Research + memory",
    model: "GPT",
    device: "Cloud",
    status: "Tagging recall",
  },
  {
    id: "scout",
    name: "Scout",
    role: "Ops runner",
    model: "Claude",
    device: "Cloud",
    status: "Monitoring",
  },
] as const;

export type BotProfile = (typeof bots)[number];
export type BotId = BotProfile["id"];

export function isBotId(value: string): value is BotId {
  return bots.some((bot) => bot.id === value);
}

export function getBotById(botId: string) {
  return bots.find((bot) => bot.id === botId);
}
