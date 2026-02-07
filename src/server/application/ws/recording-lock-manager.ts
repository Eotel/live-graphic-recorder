export interface RecordingLockManager {
  isLockedByAnother(meetingId: string, sessionId: string): boolean;
  acquire(meetingId: string, sessionId: string): boolean;
  release(meetingId: string, sessionId: string): void;
}

export function createRecordingLockManager(): RecordingLockManager {
  const activeRecorderByMeeting = new Map<string, string>();

  function isLockedByAnother(meetingId: string, sessionId: string): boolean {
    const activeSessionId = activeRecorderByMeeting.get(meetingId);
    return Boolean(activeSessionId && activeSessionId !== sessionId);
  }

  function acquire(meetingId: string, sessionId: string): boolean {
    if (isLockedByAnother(meetingId, sessionId)) {
      return false;
    }
    activeRecorderByMeeting.set(meetingId, sessionId);
    return true;
  }

  function release(meetingId: string, sessionId: string): void {
    const activeSessionId = activeRecorderByMeeting.get(meetingId);
    if (activeSessionId === sessionId) {
      activeRecorderByMeeting.delete(meetingId);
    }
  }

  return {
    isLockedByAnother,
    acquire,
    release,
  };
}
