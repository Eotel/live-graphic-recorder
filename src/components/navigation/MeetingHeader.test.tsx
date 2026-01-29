/**
 * MeetingHeader component tests.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/components/navigation/MeetingHeader.tsx
 */

import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MeetingHeader } from "./MeetingHeader";

describe("MeetingHeader", () => {
  let originalConfirm: typeof globalThis.confirm;

  beforeEach(() => {
    cleanup();
    originalConfirm = globalThis.confirm;
  });

  afterEach(() => {
    globalThis.confirm = originalConfirm;
  });

  test("renders meeting title", () => {
    render(
      <MeetingHeader
        title="Team Standup"
        onBack={mock(() => {})}
        isRecording={false}
      />,
    );

    expect(screen.getByText("Team Standup")).toBeDefined();
  });

  test("renders 'Untitled Meeting' when title is null", () => {
    render(
      <MeetingHeader
        title={null}
        onBack={mock(() => {})}
        isRecording={false}
      />,
    );

    expect(screen.getByText("Untitled Meeting")).toBeDefined();
  });

  test("renders back button", () => {
    render(
      <MeetingHeader
        title="Team Standup"
        onBack={mock(() => {})}
        isRecording={false}
      />,
    );

    expect(screen.getByRole("button", { name: /back/i })).toBeDefined();
  });

  test("calls onBack when back button is clicked (not recording)", () => {
    const onBack = mock(() => {});

    render(
      <MeetingHeader
        title="Team Standup"
        onBack={onBack}
        isRecording={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /back/i }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  test("shows confirmation dialog when recording and back is clicked", () => {
    const onBack = mock(() => {});
    const confirmMock = mock(() => false);
    globalThis.confirm = confirmMock;

    render(
      <MeetingHeader
        title="Team Standup"
        onBack={onBack}
        isRecording={true}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /back/i }));

    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(onBack).not.toHaveBeenCalled();
  });

  test("calls onBack when confirmation is accepted during recording", () => {
    const onBack = mock(() => {});
    const confirmMock = mock(() => true);
    globalThis.confirm = confirmMock;

    render(
      <MeetingHeader
        title="Team Standup"
        onBack={onBack}
        isRecording={true}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /back/i }));

    expect(confirmMock).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  test("does not crash when confirm is unavailable (recording)", () => {
    const onBack = mock(() => {});
    globalThis.confirm = undefined as unknown as typeof globalThis.confirm;

    render(
      <MeetingHeader
        title="Team Standup"
        onBack={onBack}
        isRecording={true}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /back/i }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
