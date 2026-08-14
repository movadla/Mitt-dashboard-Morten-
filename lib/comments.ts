import { randomUUID } from "crypto";
import { hdel, hgetJSON, hgetallJSON, hsetJSON } from "./kv";

export type CommentTargetType =
  | "contract"
  | "expiry-tenant"
  | "guarantee"
  | "receivable"
  | "reminder"
  | "calendar-event"
  | "life-event";

export interface Comment {
  id: string;
  tekst: string;
  opprettet: string; // ISO datetime
  ikkeRelevant?: boolean;
}

const HASH_KEY = "jobb:kommentarer";

function fieldKey(targetType: CommentTargetType, targetId: string): string {
  return `${targetType}:${targetId}`;
}

export async function getAllComments(): Promise<Record<string, Comment[]>> {
  return hgetallJSON<Comment[]>(HASH_KEY);
}

export async function getComments(targetType: CommentTargetType, targetId: string): Promise<Comment[]> {
  const list = await hgetJSON<Comment[]>(HASH_KEY, fieldKey(targetType, targetId));
  return list ?? [];
}

export async function addComment(targetType: CommentTargetType, targetId: string, tekst: string): Promise<Comment> {
  if (!tekst?.trim()) throw new Error("Kommentar mangler tekst");
  const comment: Comment = {
    id: randomUUID(),
    tekst: tekst.trim(),
    opprettet: new Date().toISOString(),
  };
  const existing = await getComments(targetType, targetId);
  await hsetJSON(HASH_KEY, fieldKey(targetType, targetId), [...existing, comment]);
  return comment;
}

export async function deleteComment(targetType: CommentTargetType, targetId: string, commentId: string): Promise<void> {
  const existing = await getComments(targetType, targetId);
  const next = existing.filter((c) => c.id !== commentId);
  if (next.length === 0) {
    await hdel(HASH_KEY, fieldKey(targetType, targetId));
  } else {
    await hsetJSON(HASH_KEY, fieldKey(targetType, targetId), next);
  }
}

export async function setCommentRelevance(
  targetType: CommentTargetType,
  targetId: string,
  commentId: string,
  ikkeRelevant: boolean,
): Promise<void> {
  const existing = await getComments(targetType, targetId);
  const next = existing.map((c) => (c.id === commentId ? { ...c, ikkeRelevant } : c));
  await hsetJSON(HASH_KEY, fieldKey(targetType, targetId), next);
}
