/**
 * MeetingHeader component tests.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/components/navigation/MeetingHeader.tsx
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MeetingHeader } from "./MeetingHeader";

describe("MeetingHeader", () => {
  beforeEach(() => {
    cleanup();
  });

  test("renders meeting title", () => {
    render(<MeetingHeader title="Team Standup" onBackRequested={mock(() => {})} />);

    expect(screen.getByText("Team Standup")).toBeDefined();
  });

  test("renders 'Untitled Meeting' when title is null", () => {
    render(<MeetingHeader title={null} onBackRequested={mock(() => {})} />);

    expect(screen.getByText("Untitled Meeting")).toBeDefined();
  });

  test("renders back button", () => {
    render(<MeetingHeader title="Team Standup" onBackRequested={mock(() => {})} />);

    expect(screen.getByRole("button", { name: /back/i })).toBeDefined();
  });

  test("calls onBackRequested when back button is clicked", () => {
    const onBackRequested = mock(() => {});

    render(<MeetingHeader title="Team Standup" onBackRequested={onBackRequested} />);

    fireEvent.click(screen.getByRole("button", { name: /back/i }));

    expect(onBackRequested).toHaveBeenCalledTimes(1);
  });

  describe("click-to-edit title", () => {
    test("enters edit mode when title is clicked", () => {
      const onUpdateTitle = mock(() => {});

      render(
        <MeetingHeader
          title="Team Standup"
          onBackRequested={mock(() => {})}
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
          onBackRequested={mock(() => {})}
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
          onBackRequested={mock(() => {})}
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
          onBackRequested={mock(() => {})}
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
          onBackRequested={mock(() => {})}
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
          onBackRequested={mock(() => {})}
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
      render(<MeetingHeader title="Team Standup" onBackRequested={mock(() => {})} />);

      fireEvent.click(screen.getByText("Team Standup"));

      expect(screen.queryByRole("textbox")).toBeNull();
    });
  });
});
