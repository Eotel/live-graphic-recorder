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

  describe("click-to-edit title", () => {
    test("enters edit mode when title is clicked", () => {
      const onUpdateTitle = mock(() => {});

      render(
        <MeetingHeader
          title="Team Standup"
          onBack={mock(() => {})}
          isRecording={false}
          onUpdateTitle={onUpdateTitle}
        />,
      );

      fireEvent.click(screen.getByText("Team Standup"));

      const input = screen.getByRole("textbox");
      expect(input).toBeDefined();
      expect((input as HTMLInputElement).value).toBe("Team Standup");
    });

    test("calls onUpdateTitle when edit is confirmed with Enter", () => {
      const onUpdateTitle = mock(() => {});

      render(
        <MeetingHeader
          title="Team Standup"
          onBack={mock(() => {})}
          isRecording={false}
          onUpdateTitle={onUpdateTitle}
        />,
      );

      fireEvent.click(screen.getByText("Team Standup"));
      const input = screen.getByRole("textbox");
      fireEvent.change(input, { target: { value: "New Title" } });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(onUpdateTitle).toHaveBeenCalledWith("New Title");
    });

    test("calls onUpdateTitle when input loses focus", () => {
      const onUpdateTitle = mock(() => {});

      render(
        <MeetingHeader
          title="Team Standup"
          onBack={mock(() => {})}
          isRecording={false}
          onUpdateTitle={onUpdateTitle}
        />,
      );

      fireEvent.click(screen.getByText("Team Standup"));
      const input = screen.getByRole("textbox");
      fireEvent.change(input, { target: { value: "Blur Title" } });
      fireEvent.blur(input);

      expect(onUpdateTitle).toHaveBeenCalledWith("Blur Title");
    });

    test("cancels edit on Escape key", () => {
      const onUpdateTitle = mock(() => {});

      render(
        <MeetingHeader
          title="Team Standup"
          onBack={mock(() => {})}
          isRecording={false}
          onUpdateTitle={onUpdateTitle}
        />,
      );

      fireEvent.click(screen.getByText("Team Standup"));
      const input = screen.getByRole("textbox");
      fireEvent.change(input, { target: { value: "Should Not Save" } });
      fireEvent.keyDown(input, { key: "Escape" });

      expect(onUpdateTitle).not.toHaveBeenCalled();
      expect(screen.getByText("Team Standup")).toBeDefined();
    });

    test("does not call onUpdateTitle when title is unchanged", () => {
      const onUpdateTitle = mock(() => {});

      render(
        <MeetingHeader
          title="Team Standup"
          onBack={mock(() => {})}
          isRecording={false}
          onUpdateTitle={onUpdateTitle}
        />,
      );

      fireEvent.click(screen.getByText("Team Standup"));
      const input = screen.getByRole("textbox");
      fireEvent.keyDown(input, { key: "Enter" });

      expect(onUpdateTitle).not.toHaveBeenCalled();
    });

    test("sets 'Untitled Meeting' when empty title is submitted", () => {
      const onUpdateTitle = mock(() => {});

      render(
        <MeetingHeader
          title="Team Standup"
          onBack={mock(() => {})}
          isRecording={false}
          onUpdateTitle={onUpdateTitle}
        />,
      );

      fireEvent.click(screen.getByText("Team Standup"));
      const input = screen.getByRole("textbox");
      fireEvent.change(input, { target: { value: "" } });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(onUpdateTitle).toHaveBeenCalledWith("Untitled Meeting");
    });

    test("does not enter edit mode when onUpdateTitle is not provided", () => {
      render(
        <MeetingHeader
          title="Team Standup"
          onBack={mock(() => {})}
          isRecording={false}
        />,
      );

      fireEvent.click(screen.getByText("Team Standup"));

      // Should not have an input
      expect(screen.queryByRole("textbox")).toBeNull();
    });
  });
});
