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

  const addComment = useCallback(async (targetType: CommentTargetType, targetId: string, tekst: string) => {
    const res = await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetType, targetId, tekst }),
    });
    if (res.ok) {
      const created: Comment = await res.json();
      const key = commentKey(targetType, targetId);
      setComments((prev) => ({ ...prev, [key]: [...(prev[key] ?? []), created] }));
    }
  }, []);

  const removeComment = useCallback(async (targetType: CommentTargetType, targetId: string, commentId: string) => {
    const key = commentKey(targetType, targetId);
    setComments((prev) => ({ ...prev, [key]: (prev[key] ?? []).filter((c) => c.id !== commentId) }));
    await fetch(`/api/comments/${targetType}/${targetId}/${commentId}`, { method: "DELETE" });
  }, []);

  return { comments, loaded, addComment, removeComment, confirmDelete };
}
