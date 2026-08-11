import { del, getJSON, setJSON } from "./kv";

export interface StoredChatMessage {
  role: "user" | "assistant";
  content: string;
}

const KEY = "privat:chat:history";
const MAX_MESSAGES = 40;
const TTL_SECONDS = 60 * 60 * 24 * 30; // 30 dager — en gammel samtale er ikke nyttig kontekst uansett

export async function getChatHistory(): Promise<StoredChatMessage[]> {
  return (await getJSON<StoredChatMessage[]>(KEY)) ?? [];
}

export async function appendChatMessages(newMessages: StoredChatMessage[]): Promise<void> {
  const current = await getChatHistory();
  const next = [...current, ...newMessages].slice(-MAX_MESSAGES);
  await setJSON(KEY, next, TTL_SECONDS);
}

export async function clearChatHistory(): Promise<void> {
  await del(KEY);
}
