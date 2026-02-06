export function imageToUrl(meetingId: string, imageId: number): string {
  return `/api/meetings/${meetingId}/images/${imageId}`;
}

export function captureToUrl(meetingId: string, captureId: number): string {
  return `/api/meetings/${meetingId}/captures/${captureId}`;
}
