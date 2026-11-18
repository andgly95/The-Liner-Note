// The AI tools' saved results: one per person, per collection (a Discogs
// username — yours or a friend's), per tool. Replaced by the next run.
import { getDb } from "./db";

export interface Saved<T = unknown> { result: T; createdAt: number }

const subjectKey = (s: string) => s.trim().toLowerCase();

export function savedAnalysis<T>(userId: number, subject: string, type: string): Saved<T> | null {
  const r = getDb()
    .prepare("SELECT result, created_at FROM analyses WHERE user_id = ? AND subject = ? AND type = ?")
    .get(userId, subjectKey(subject), type) as { result: string; created_at: number } | undefined;
  if (!r) return null;
  try {
    return { result: JSON.parse(r.result) as T, createdAt: r.created_at };
  } catch {
    return null;
  }
}

export function saveAnalysis(userId: number, subject: string, type: string, result: unknown): number {
  const now = Date.now();
  getDb()
    .prepare(
      `INSERT INTO analyses (user_id, subject, type, result, created_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (user_id, subject, type) DO UPDATE SET result = excluded.result, created_at = excluded.created_at`
    )
    .run(userId, subjectKey(subject), type, JSON.stringify(result), now);
  return now;
}
