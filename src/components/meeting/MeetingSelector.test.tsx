/**
 * MeetingSelector component tests.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/components/meeting/MeetingSelector.tsx
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MeetingSelector } from "./MeetingSelector";
import type { MeetingInfo } from "@/types/messages";

describe("MeetingSelector", () => {
  beforeEach(() => {
    cleanup();
  });

  const mockMeetings: MeetingInfo[] = [
    {
      id: "meeting-1",
      title: "Team Standup",
      startedAt: Date.now() - 86400000, // 1 day ago
      endedAt: null,
      createdAt: Date.now() - 86400000,
    },
    {
      id: "meeting-2",
      title: "Project Review",
      startedAt: Date.now() - 172800000, // 2 days ago
      endedAt: Date.now() - 172800000 + 3600000,
      createdAt: Date.now() - 172800000,
    },
  ];

  test("renders new meeting button", () => {
    render(
      <MeetingSelector
        meetings={[]}
        activeMeetingId={null}
        onNewMeeting={mock(() => {})}
        onJoinMeeting={mock(() => {})}
        onRefresh={mock(() => {})}
        disabled={false}
      />,
    );

    expect(screen.getByRole("button", { name: /new meeting/i })).toBeDefined();
  });

  test("renders meeting list", () => {
    render(
      <MeetingSelector
        meetings={mockMeetings}
        activeMeetingId={null}
        onNewMeeting={mock(() => {})}
        onJoinMeeting={mock(() => {})}
        onRefresh={mock(() => {})}
        disabled={false}
      />,
    );

    expect(screen.getByText("Team Standup")).toBeDefined();
    expect(screen.getByText("Project Review")).toBeDefined();
  });

  test("calls onNewMeeting when new meeting button is clicked", () => {
    const onNewMeeting = mock(() => {});

    render(
      <MeetingSelector
        meetings={[]}
        activeMeetingId={null}
        onNewMeeting={onNewMeeting}
        onJoinMeeting={mock(() => {})}
        onRefresh={mock(() => {})}
        disabled={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /new meeting/i }));

    expect(onNewMeeting).toHaveBeenCalledTimes(1);
  });

  test("calls onJoinMeeting when a meeting is selected", () => {
    const onJoinMeeting = mock(() => {});

    render(
      <MeetingSelector
        meetings={mockMeetings}
        activeMeetingId={null}
        onNewMeeting={mock(() => {})}
        onJoinMeeting={onJoinMeeting}
        onRefresh={mock(() => {})}
        disabled={false}
      />,
    );

    fireEvent.click(screen.getByText("Team Standup"));

    expect(onJoinMeeting).toHaveBeenCalledTimes(1);
    expect(onJoinMeeting).toHaveBeenCalledWith("meeting-1");
  });

  test("highlights active meeting", () => {
    render(
      <MeetingSelector
        meetings={mockMeetings}
        activeMeetingId="meeting-1"
        onNewMeeting={mock(() => {})}
        onJoinMeeting={mock(() => {})}
        onRefresh={mock(() => {})}
        disabled={false}
      />,
    );

    const activeMeeting = screen.getByText("Team Standup").closest("button");
    expect(activeMeeting?.className).toContain("bg-primary");
  });

  test("disables buttons when disabled prop is true", () => {
    render(
      <MeetingSelector
        meetings={mockMeetings}
        activeMeetingId={null}
        onNewMeeting={mock(() => {})}
        onJoinMeeting={mock(() => {})}
        onRefresh={mock(() => {})}
        disabled={true}
      />,
    );

    const newMeetingButton = screen.getByRole("button", { name: /new meeting/i });
    expect(newMeetingButton.hasAttribute("disabled")).toBe(true);
  });

  test("shows empty state when no meetings", () => {
    render(
      <MeetingSelector
        meetings={[]}
        activeMeetingId={null}
        onNewMeeting={mock(() => {})}
        onJoinMeeting={mock(() => {})}
        onRefresh={mock(() => {})}
        disabled={false}
      />,
    );

    expect(screen.getByText(/no previous meetings/i)).toBeDefined();
  });
});
