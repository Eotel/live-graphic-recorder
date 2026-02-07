/**
 * Tests for CloudSaveButton component.
 *
 * Related: src/components/recording/CloudSaveButton.tsx
 */

import { describe, test, expect, mock, afterEach } from "bun:test";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CloudSaveButton, type CloudSaveButtonProps } from "./CloudSaveButton";

describe("CloudSaveButton", () => {
  afterEach(() => {
    cleanup();
  });

  const defaultProps: CloudSaveButtonProps = {
    meetingId: "meeting-1",
    isRecording: false,
    isUploading: false,
    progress: 0,
    error: null,
    pendingCount: 1,
    onUpload: () => {},
    onCancel: () => {},
  };

  test("should return null when there is no local recording and idle", () => {
    const { container } = render(<CloudSaveButton {...defaultProps} pendingCount={0} />);

    expect(container.innerHTML).toBe("");
  });

  test("should render an enabled upload button when upload is available", () => {
    render(<CloudSaveButton {...defaultProps} />);

    const button = screen.getByRole("button", { name: "Save to Cloud" });
    expect(button).toBeTruthy();
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });

  test("should call onUpload with meetingId when clicked", () => {
    const onUpload = mock(() => {});
    render(<CloudSaveButton {...defaultProps} onUpload={onUpload} />);

    fireEvent.click(screen.getByRole("button", { name: "Save to Cloud" }));
    expect(onUpload).toHaveBeenCalledWith("meeting-1");
  });

  test("should show uploading state with progress bar and allow cancel", () => {
    const onCancel = mock(() => {});
    const { container } = render(
      <CloudSaveButton {...defaultProps} isUploading={true} progress={42} onCancel={onCancel} />,
    );

    expect(screen.getByText("Uploading... 42%")).toBeTruthy();

    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBe(2);

    fireEvent.click(buttons[1]!);
    expect(onCancel).toHaveBeenCalledTimes(1);

    const progressFill = container.querySelector("[style*='width: 42%']");
    expect(progressFill).toBeTruthy();
  });

  test("should call onCancel when main button is clicked during upload", () => {
    const onCancel = mock(() => {});
    render(
      <CloudSaveButton {...defaultProps} isUploading={true} progress={10} onCancel={onCancel} />,
    );

    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]!);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  test("should render error message and disable upload when error exists", () => {
    render(
      <CloudSaveButton {...defaultProps} pendingCount={0} error="Upload failed" meetingId={null} />,
    );

    expect(screen.getByText("Upload failed")).toBeTruthy();

    const button = screen.getByRole("button", { name: "Save to Cloud" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  test("should not render button after upload completion when no local recording remains", () => {
    render(
      <CloudSaveButton
        {...defaultProps}
        pendingCount={0}
        meetingId={null}
        progress={100}
        isUploading={false}
        error={null}
      />,
    );

    expect(screen.queryByRole("button", { name: "Saved" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save to Cloud" })).toBeNull();
  });

  test("shows pending count when multiple recordings are queued", () => {
    render(<CloudSaveButton {...defaultProps} pendingCount={3} />);

    expect(screen.getByRole("button", { name: "Save to Cloud (3)" })).toBeTruthy();
  });
});
