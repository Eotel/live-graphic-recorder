/**
 * Persistence service facade for managing meetings, sessions, and related data.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/services/server/db/index.ts
 */

import type { Database } from "bun:sqlite";
import type { TranscriptSegment, AnalysisResult, CameraFrame } from "@/types/messages";
import { DB_CONFIG } from "@/config/constants";
import { getDatabase, closeDatabase } from "./db/database";
import { runMigrations } from "./db/migrations";
import {
  createMeeting as createMeetingRepo,
  findMeetingById,
  findAllMeetings,
  updateMeeting,
  type Meeting,
} from "./db/repository/meeting";
import {
  createSession as createSessionRepo,
  findSessionById,
  findSessionsByMeetingId,
  updateSession,
  type PersistedSession,
} from "./db/repository/session";
import {
  createTranscriptSegment,
  findTranscriptSegmentsBySessionId,
  markLastSegmentAsUtteranceEnd,
  type PersistedTranscriptSegment,
} from "./db/repository/transcript";
import {
  createAnalysis,
  findAnalysesBySessionId,
  findLatestAnalysisBySessionId,
  type PersistedAnalysis,
} from "./db/repository/analysis";
import {
  createGeneratedImage,
  findGeneratedImagesBySessionId,
  findGeneratedImageByIdAndMeetingId,
  type PersistedGeneratedImage,
} from "./db/repository/image";
import {
  createCameraCapture,
  findCameraCapturesBySessionId,
  findCameraCapturByIdAndMeetingId,
  type PersistedCameraCapture,
} from "./db/repository/capture";
import {
  createMetaSummary,
  findMetaSummariesByMeetingId,
  findLatestMetaSummaryByMeetingId,
  type PersistedMetaSummary,
} from "./db/repository/meta-summary";
import { FileStorageService } from "./db/storage/file-storage";

// Keep sessionId format consistent with FileStorageService.
const VALID_SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

function assertValidSessionId(sessionId: string): void {
  if (!sessionId || !VALID_SESSION_ID_PATTERN.test(sessionId)) {
    throw new Error(`Invalid sessionId format: ${sessionId}`);
  }
}

export interface ImageData {
  base64: string;
  prompt: string;
  timestamp: number;
}

export interface MetaSummaryInput {
  startTime: number;
  endTime: number;
  summary: string[];
  themes: string[];
  representativeImageId: string | null;
}

export type {
  PersistedMetaSummary,
  PersistedAnalysis,
  PersistedGeneratedImage,
  PersistedCameraCapture,
};

export class PersistenceService {
  private readonly db: Database;
  private readonly storage: FileStorageService;

  constructor(
    dbPath: string = DB_CONFIG.defaultPath,
    mediaPath: string = DB_CONFIG.defaultMediaPath,
  ) {
    this.db = getDatabase(dbPath);
    runMigrations(this.db);
    this.storage = new FileStorageService(mediaPath);
  }

  // ============================================================================
  // Meeting Operations
  // ============================================================================

  createMeeting(title?: string): Meeting {
    return createMeetingRepo(this.db, { title });
  }

  getMeeting(meetingId: string): Meeting | null {
    return findMeetingById(this.db, meetingId);
  }

  listMeetings(limit?: number): Meeting[] {
    return findAllMeetings(this.db, limit);
  }

  endMeeting(meetingId: string): void {
    updateMeeting(this.db, meetingId, { endedAt: Date.now() });
  }

  updateMeetingTitle(meetingId: string, title: string): void {
    updateMeeting(this.db, meetingId, { title });
  }

  // ============================================================================
  // Session Operations
  // ============================================================================

  createSession(meetingId: string, sessionId: string): PersistedSession {
    return createSessionRepo(this.db, { meetingId, id: sessionId });
  }

  getSession(sessionId: string): PersistedSession | null {
    return findSessionById(this.db, sessionId);
  }

  getSessionsByMeeting(meetingId: string): PersistedSession[] {
    return findSessionsByMeetingId(this.db, meetingId);
  }

  startSession(sessionId: string): void {
    updateSession(this.db, sessionId, {
      status: "recording",
      startedAt: Date.now(),
    });
  }

  stopSession(sessionId: string): void {
    updateSession(this.db, sessionId, {
      status: "idle",
      endedAt: Date.now(),
    });
  }

  // ============================================================================
  // Transcript Operations
  // ============================================================================

  persistTranscript(sessionId: string, segment: TranscriptSegment): void {
    createTranscriptSegment(this.db, {
      sessionId,
      text: segment.text,
      timestamp: segment.timestamp,
      isFinal: segment.isFinal,
      speaker: segment.speaker,
      startTime: segment.startTime,
      isUtteranceEnd: segment.isUtteranceEnd,
    });
  }

  loadTranscripts(sessionId: string): PersistedTranscriptSegment[] {
    return findTranscriptSegmentsBySessionId(this.db, sessionId);
  }

  loadMeetingTranscript(meetingId: string): PersistedTranscriptSegment[] {
    const sessions = findSessionsByMeetingId(this.db, meetingId);
    const allTranscripts: PersistedTranscriptSegment[] = [];

    for (const session of sessions) {
      const transcripts = findTranscriptSegmentsBySessionId(this.db, session.id);
      allTranscripts.push(...transcripts);
    }

    // Sort by timestamp
    return allTranscripts.sort((a, b) => a.timestamp - b.timestamp);
  }

  markUtteranceEnd(sessionId: string): boolean {
    assertValidSessionId(sessionId);
    return markLastSegmentAsUtteranceEnd(this.db, sessionId);
  }

  // ============================================================================
  // Analysis Operations
  // ============================================================================

  async persistAnalysis(sessionId: string, analysis: AnalysisResult): Promise<void> {
    await this.persistAnalysisWithTimestamp(sessionId, analysis, Date.now());
  }

  async persistAnalysisWithTimestamp(
    sessionId: string,
    analysis: AnalysisResult,
    timestamp: number,
  ): Promise<void> {
    createAnalysis(this.db, {
      sessionId,
      summary: analysis.summary,
      topics: analysis.topics,
      tags: analysis.tags,
      flow: analysis.flow,
      heat: analysis.heat,
      imagePrompt: analysis.imagePrompt,
      timestamp,
    });
  }

  loadAnalyses(sessionId: string): PersistedAnalysis[] {
    return findAnalysesBySessionId(this.db, sessionId);
  }

  getLatestAnalysis(sessionId: string): PersistedAnalysis | null {
    return findLatestAnalysisBySessionId(this.db, sessionId);
  }

  // ============================================================================
  // Image Operations
  // ============================================================================

  async persistImage(sessionId: string, image: ImageData): Promise<void> {
    const { filePath } = await this.storage.saveImage(sessionId, image.base64, "png");
    createGeneratedImage(this.db, {
      sessionId,
      filePath,
      prompt: image.prompt,
      timestamp: image.timestamp,
    });
  }

  loadImages(sessionId: string): PersistedGeneratedImage[] {
    return findGeneratedImagesBySessionId(this.db, sessionId);
  }

  async loadImageBase64(filePath: string): Promise<string> {
    return this.storage.loadImage(filePath);
  }

  /**
   * Get an image by ID with meeting ownership validation.
   * Returns null if the image doesn't exist or doesn't belong to the meeting.
   */
  getImageByIdAndMeetingId(imageId: number, meetingId: string): PersistedGeneratedImage | null {
    return findGeneratedImageByIdAndMeetingId(this.db, imageId, meetingId);
  }

  // ============================================================================
  // Camera Frame Operations
  // ============================================================================

  async persistCameraFrame(sessionId: string, frame: CameraFrame): Promise<void> {
    const { filePath } = await this.storage.saveCapture(sessionId, frame.base64);
    createCameraCapture(this.db, {
      sessionId,
      filePath,
      timestamp: frame.timestamp,
    });
  }

  loadCaptures(sessionId: string): PersistedCameraCapture[] {
    return findCameraCapturesBySessionId(this.db, sessionId);
  }

  /**
   * Get a capture by ID with meeting ownership validation.
   * Returns null if the capture doesn't exist or doesn't belong to the meeting.
   */
  getCaptureByIdAndMeetingId(captureId: number, meetingId: string): PersistedCameraCapture | null {
    return findCameraCapturByIdAndMeetingId(this.db, captureId, meetingId);
  }

  // ============================================================================
  // Meta-Summary Operations
  // ============================================================================

  persistMetaSummary(meetingId: string, input: MetaSummaryInput): PersistedMetaSummary {
    return createMetaSummary(this.db, {
      meetingId,
      startTime: input.startTime,
      endTime: input.endTime,
      summary: input.summary,
      themes: input.themes,
      representativeImageId: input.representativeImageId,
    });
  }

  loadMetaSummaries(meetingId: string): PersistedMetaSummary[] {
    return findMetaSummariesByMeetingId(this.db, meetingId);
  }

  getLatestMetaSummary(meetingId: string): PersistedMetaSummary | null {
    return findLatestMetaSummaryByMeetingId(this.db, meetingId);
  }

  // ============================================================================
  // Meeting-Level Data Aggregation
  // ============================================================================

  loadMeetingAnalyses(meetingId: string): PersistedAnalysis[] {
    const sessions = findSessionsByMeetingId(this.db, meetingId);
    const allAnalyses: PersistedAnalysis[] = [];

    for (const session of sessions) {
      const analyses = findAnalysesBySessionId(this.db, session.id);
      allAnalyses.push(...analyses);
    }

    return allAnalyses.sort((a, b) => a.timestamp - b.timestamp);
  }

  loadRecentMeetingAnalyses(meetingId: string, limit: number): PersistedAnalysis[] {
    const allAnalyses = this.loadMeetingAnalyses(meetingId);
    return allAnalyses.slice(-limit);
  }

  loadMeetingImages(meetingId: string): PersistedGeneratedImage[] {
    const sessions = findSessionsByMeetingId(this.db, meetingId);
    const allImages: PersistedGeneratedImage[] = [];

    for (const session of sessions) {
      const images = findGeneratedImagesBySessionId(this.db, session.id);
      allImages.push(...images);
    }

    return allImages.sort((a, b) => a.timestamp - b.timestamp);
  }

  loadRecentMeetingImages(meetingId: string, limit: number): PersistedGeneratedImage[] {
    const allImages = this.loadMeetingImages(meetingId);
    return allImages.slice(-limit);
  }

  loadMeetingCaptures(meetingId: string): PersistedCameraCapture[] {
    const sessions = findSessionsByMeetingId(this.db, meetingId);
    const allCaptures: PersistedCameraCapture[] = [];

    for (const session of sessions) {
      const captures = findCameraCapturesBySessionId(this.db, session.id);
      allCaptures.push(...captures);
    }

    return allCaptures.sort((a, b) => a.timestamp - b.timestamp);
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  close(): void {
    closeDatabase();
  }
}
