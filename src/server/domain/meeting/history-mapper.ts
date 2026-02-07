import type {
  PersistedAnalysis,
  PersistedCameraCapture,
  PersistedGeneratedImage,
  PersistedMetaSummary,
  PersistedSpeakerAlias,
} from "@/services/server/persistence";
import type { PersistedTranscriptSegment } from "@/services/server/db/repository/transcript";
import type {
  MeetingHistoryMessage,
  MeetingHistoryDeltaMessage,
  MeetingHistoryAnalyses,
  MeetingHistoryCaptures,
  MeetingHistoryImages,
  MeetingHistoryMetaSummaries,
  MeetingHistoryTranscripts,
} from "@/types/messages";
import { captureToUrl, imageToUrl } from "./media-url";
import { speakerAliasArrayToMap } from "./speaker-alias";

interface MeetingHistoryData {
  transcripts: PersistedTranscriptSegment[];
  analyses: PersistedAnalysis[];
  images: PersistedGeneratedImage[];
  captures: PersistedCameraCapture[];
  metaSummaries: PersistedMetaSummary[];
  speakerAliases: PersistedSpeakerAlias[];
}

export interface MeetingHistoryPayload {
  transcripts: MeetingHistoryTranscripts;
  analyses: MeetingHistoryAnalyses;
  images: MeetingHistoryImages;
  captures: MeetingHistoryCaptures;
  metaSummaries: MeetingHistoryMetaSummaries;
  speakerAliases: Record<string, string>;
}

export function buildMeetingHistoryPayload(
  meetingId: string,
  data: MeetingHistoryData,
): MeetingHistoryPayload {
  return {
    transcripts: data.transcripts.map((t) => ({
      text: t.text,
      timestamp: t.timestamp,
      isFinal: t.isFinal,
      speaker: t.speaker ?? undefined,
      startTime: t.startTime ?? undefined,
      isUtteranceEnd: t.isUtteranceEnd ?? undefined,
    })),
    analyses: data.analyses.map((a) => ({
      summary: a.summary,
      topics: a.topics,
      tags: a.tags,
      flow: a.flow,
      heat: a.heat,
      timestamp: a.timestamp,
    })),
    images: data.images.map((img) => ({
      url: imageToUrl(meetingId, img.id),
      prompt: img.prompt,
      timestamp: img.timestamp,
    })),
    captures: data.captures.map((cap) => ({
      url: captureToUrl(meetingId, cap.id),
      timestamp: cap.timestamp,
    })),
    metaSummaries: data.metaSummaries.map((ms) => ({
      summary: ms.summary,
      themes: ms.themes,
      startTime: ms.startTime,
      endTime: ms.endTime,
    })),
    speakerAliases: speakerAliasArrayToMap(data.speakerAliases),
  };
}

export function buildMeetingHistoryMessage(
  meetingId: string,
  data: MeetingHistoryData,
): MeetingHistoryMessage {
  return {
    type: "meeting:history",
    data: buildMeetingHistoryPayload(meetingId, data),
  };
}

export function buildMeetingHistoryDeltaMessage(
  meetingId: string,
  data: MeetingHistoryData,
): MeetingHistoryDeltaMessage {
  return {
    type: "meeting:history:delta",
    data: buildMeetingHistoryPayload(meetingId, data),
  };
}
