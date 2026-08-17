"use client";

import { useCallback, useEffect, useState } from "react";
import { useConfirmDelete } from "./CardShell";
import type { Comment, CommentTargetType } from "@/lib/comments";

export function commentKey(targetType: CommentTargetType, targetId: string): string {
  return `${targetType}:${targetId}`;
}

export interface PendingCommentDelete {
  targetType: CommentTargetType;
  targetId: string;
  commentId: string;
  preview: string;
}

export function useComments() {
  const [comments, setComments] = useState<Record<string, Comment[]>>({});
  const [loaded, setLoaded] = useState(false);
  const confirmDelete = useConfirmDelete<PendingCommentDelete>();

  useEffect(() => {
    fetch("/api/comments")
      .then((r) => r.json())
      .then((data) => {
        setComments((data.comments ?? {}) as Record<string, Comment[]>);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  const addComment = useCallback(async (targetType: CommentTargetType, targetId: string, tekst: string): Promise<boolean> => {
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType, targetId, tekst }),
      });
      if (!res.ok) return false;
      const created: Comment = await res.json();
      const key = commentKey(targetType, targetId);
      setComments((prev) => ({ ...prev, [key]: [...(prev[key] ?? []), created] }));
      return true;
    } catch {
      return false;
    }
  }, []);

  const removeComment = useCallback(async (targetType: CommentTargetType, targetId: string, commentId: string): Promise<boolean> => {
    const key = commentKey(targetType, targetId);
    let prevList: Comment[] = [];
    setComments((prev) => {
      prevList = prev[key] ?? [];
      return { ...prev, [key]: prevList.filter((c) => c.id !== commentId) };
    });
    try {
      const res = await fetch(`/api/comments/${targetType}/${targetId}/${commentId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      return true;
    } catch {
      setComments((prev) => ({ ...prev, [key]: prevList }));
      return false;
    }
  }, []);

  const toggleRelevance = useCallback(
    async (targetType: CommentTargetType, targetId: string, commentId: string, ikkeRelevant: boolean): Promise<boolean> => {
      const key = commentKey(targetType, targetId);
      let prevList: Comment[] = [];
      setComments((prev) => {
        prevList = prev[key] ?? [];
        return { ...prev, [key]: prevList.map((c) => (c.id === commentId ? { ...c, ikkeRelevant } : c)) };
      });
      try {
        const res = await fetch(`/api/comments/${targetType}/${targetId}/${commentId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ikkeRelevant }),
        });
        if (!res.ok) throw new Error("update failed");
        return true;
      } catch {
        setComments((prev) => ({ ...prev, [key]: prevList }));
        return false;
      }
    },
    [],
  );

  return { comments, loaded, addComment, removeComment, toggleRelevance, confirmDelete };
}
