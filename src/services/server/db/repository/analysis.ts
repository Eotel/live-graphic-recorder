/**
 * Analysis repository for database operations.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/services/server/db/repository/session.ts, src/types/messages.ts
 */

import type { Database } from "bun:sqlite";

export interface PersistedAnalysis {
  id: number;
  sessionId: string;
  summary: string[];
  topics: string[];
  tags: string[];
  flow: number;
  heat: number;
  imagePrompt: string;
  timestamp: number;
}

interface AnalysisRow {
  id: number;
  session_id: string;
  summary_json: string;
  topics_json: string;
  tags_json: string;
  flow: number;
  heat: number;
  image_prompt: string;
  timestamp: number;
}

function rowToAnalysis(row: AnalysisRow): PersistedAnalysis {
  try {
    return {
      id: row.id,
      sessionId: row.session_id,
      summary: JSON.parse(row.summary_json) as string[],
      topics: JSON.parse(row.topics_json) as string[],
      tags: JSON.parse(row.tags_json) as string[],
      flow: row.flow,
      heat: row.heat,
      imagePrompt: row.image_prompt,
      timestamp: row.timestamp,
    };
  } catch (error) {
    console.error(`[AnalysisRepository] Failed to parse JSON for analysis ${row.id}:`, error);
    throw new Error(`Corrupted analysis data for ID ${row.id}`);
  }
}

export interface CreateAnalysisInput {
  sessionId: string;
  summary: string[];
  topics: string[];
  tags: string[];
  flow: number;
  heat: number;
  imagePrompt: string;
  timestamp: number;
}

export function createAnalysis(db: Database, input: CreateAnalysisInput): PersistedAnalysis {
  const result = db.run(
    `INSERT INTO analyses
     (session_id, summary_json, topics_json, tags_json, flow, heat, image_prompt, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.sessionId,
      JSON.stringify(input.summary),
      JSON.stringify(input.topics),
      JSON.stringify(input.tags),
      input.flow,
      input.heat,
      input.imagePrompt,
      input.timestamp,
    ],
  );

  const row = db
    .query("SELECT * FROM analyses WHERE id = ?")
    .get(result.lastInsertRowid) as AnalysisRow;
  return rowToAnalysis(row);
}

export function findAnalysesBySessionId(db: Database, sessionId: string): PersistedAnalysis[] {
  const rows = db
    .query("SELECT * FROM analyses WHERE session_id = ? ORDER BY timestamp")
    .all(sessionId) as AnalysisRow[];
  return rows.map(rowToAnalysis);
}

export function findLatestAnalysisBySessionId(
  db: Database,
  sessionId: string,
): PersistedAnalysis | null {
  const row = db
    .query("SELECT * FROM analyses WHERE session_id = ? ORDER BY timestamp DESC LIMIT 1")
    .get(sessionId) as AnalysisRow | null;
  return row ? rowToAnalysis(row) : null;
}
