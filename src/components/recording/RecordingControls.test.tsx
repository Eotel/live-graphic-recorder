import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";

import { RecordingControls } from "./RecordingControls";

describe("RecordingControls", () => {
  afterEach(() => {
    cleanup();
  });

  const baseProps: ComponentProps<typeof RecordingControls> = {
    sessionStatus: "idle",
    isRecording: false,
    hasPermission: true,
    isLoading: false,
    error: null,
    sourceType: "camera",
    elapsedTime: undefined,
    hasMeeting: true,
    onResumeMeeting: mock(() => {}),
    onRequestPermission: mock(() => {}),
    onStart: mock(() => {}),
    onStop: mock(() => {}),
  };

  test("shows stop button and elapsed time in the same horizontal row while recording", () => {
    render(
      <RecordingControls
        {...baseProps}
        isRecording={true}
        hasPermission={true}
        elapsedTime="12:34"
      />,
    );

    const row = screen.getByTestId("recording-control-row");
    const stopButton = screen.getByRole("button", { name: "Stop Recording" });
    const elapsedTime = screen.getByText("12:34");

    expect(row.contains(stopButton)).toBe(true);
    expect(row.contains(elapsedTime)).toBe(true);
    expect(row.className).toContain("items-center");
    expect(row.className).toContain("gap-3");
    expect(elapsedTime.className).toContain("font-mono");
    expect(elapsedTime.className).toContain("tabular-nums");
  });

  test("does not show elapsed time in grant state", () => {
    render(<RecordingControls {...baseProps} hasPermission={false} elapsedTime="00:42" />);

    expect(screen.getByRole("button", { name: "Grant Camera & Mic Access" })).toBeTruthy();
    expect(screen.queryByText("00:42")).toBeNull();
  });

  test("does not show elapsed time in start state", () => {
    render(
      <RecordingControls
        {...baseProps}
        hasPermission={true}
        isRecording={false}
        elapsedTime="00:42"
      />,
    );

    expect(screen.getByRole("button", { name: "Start Recording" })).toBeTruthy();
    expect(screen.queryByText("00:42")).toBeNull();
  });

  test("shows resume meeting button instead of grant button in read-only mode", () => {
    const onResumeMeeting = mock(() => {});
    render(
      <RecordingControls
        {...baseProps}
        readOnly={true}
        hasPermission={false}
        onResumeMeeting={onResumeMeeting}
      />,
    );

    const button = screen.getByRole("button", { name: "Resume Meeting" });
    expect(button).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Grant Camera & Mic Access" })).toBeNull();

    fireEvent.click(button);
    expect(onResumeMeeting).toHaveBeenCalledTimes(1);
  });

  test("shows STT reconnect warning while recording", () => {
    render(
      <RecordingControls
        {...baseProps}
        isRecording={true}
        sttStatus={{ state: "reconnecting", retryAttempt: 2 }}
      />,
    );

    expect(screen.getByText("Speech-to-text reconnecting (attempt 2)...")).toBeTruthy();
  });
});
