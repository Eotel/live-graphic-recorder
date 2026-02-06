export interface PendingAudioLimits {
  maxPendingAudioChunks: number;
  maxPendingAudioChunkBytes: number;
  maxPendingAudioTotalBytes: number;
}

export type PendingAudioRejectReason =
  | "chunk-count-limit"
  | "chunk-size-limit"
  | "total-size-limit";

interface CanBufferPendingAudioInput {
  incomingBytes: number;
  pendingChunks: number;
  pendingBytes: number;
  limits: PendingAudioLimits;
}

interface CanBufferPendingAudioResult {
  canBuffer: boolean;
  reason?: PendingAudioRejectReason;
}

export function canBufferPendingAudio(
  input: CanBufferPendingAudioInput,
): CanBufferPendingAudioResult {
  const { incomingBytes, pendingChunks, pendingBytes, limits } = input;

  if (pendingChunks >= limits.maxPendingAudioChunks) {
    return { canBuffer: false, reason: "chunk-count-limit" };
  }

  if (incomingBytes > limits.maxPendingAudioChunkBytes) {
    return { canBuffer: false, reason: "chunk-size-limit" };
  }

  if (pendingBytes + incomingBytes > limits.maxPendingAudioTotalBytes) {
    return { canBuffer: false, reason: "total-size-limit" };
  }

  return { canBuffer: true };
}
