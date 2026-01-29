/**
 * MeetingSelectPage component tests.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/components/pages/MeetingSelectPage.tsx
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MeetingSelectPage } from "./MeetingSelectPage";
import type { MeetingInfo } from "@/types/messages";

describe("MeetingSelectPage", () => {
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

  test("renders app title", () => {
    render(
      <MeetingSelectPage
        meetings={[]}
        isLoading={false}
        onNewMeeting={mock(() => {})}
        onSelectMeeting={mock(() => {})}
        onRefresh={mock(() => {})}
      />,
    );

    expect(screen.getByText("Live Graphic Recorder")).toBeDefined();
  });

  test("renders new meeting button", () => {
    render(
      <MeetingSelectPage
        meetings={[]}
        isLoading={false}
        onNewMeeting={mock(() => {})}
        onSelectMeeting={mock(() => {})}
        onRefresh={mock(() => {})}
      />,
    );

    expect(screen.getByRole("button", { name: /start new meeting/i })).toBeDefined();
  });

  test("renders past meetings list", () => {
    render(
      <MeetingSelectPage
        meetings={mockMeetings}
        isLoading={false}
        onNewMeeting={mock(() => {})}
        onSelectMeeting={mock(() => {})}
        onRefresh={mock(() => {})}
      />,
    );

    expect(screen.getByText("Team Standup")).toBeDefined();
    expect(screen.getByText("Project Review")).toBeDefined();
  });

  test("shows empty state message when no meetings", () => {
    render(
      <MeetingSelectPage
        meetings={[]}
        isLoading={false}
        onNewMeeting={mock(() => {})}
        onSelectMeeting={mock(() => {})}
        onRefresh={mock(() => {})}
      />,
    );

    expect(screen.getByText(/no past meetings/i)).toBeDefined();
  });

  test("calls onNewMeeting when new meeting button is clicked", () => {
    const onNewMeeting = mock(() => {});

    render(
      <MeetingSelectPage
        meetings={[]}
        isLoading={false}
        onNewMeeting={onNewMeeting}
        onSelectMeeting={mock(() => {})}
        onRefresh={mock(() => {})}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /start new meeting/i }));

    expect(onNewMeeting).toHaveBeenCalledTimes(1);
  });

  test("calls onSelectMeeting when a meeting is clicked", () => {
    const onSelectMeeting = mock(() => {});

    render(
      <MeetingSelectPage
        meetings={mockMeetings}
        isLoading={false}
        onNewMeeting={mock(() => {})}
        onSelectMeeting={onSelectMeeting}
        onRefresh={mock(() => {})}
      />,
    );

    fireEvent.click(screen.getByText("Team Standup"));

    expect(onSelectMeeting).toHaveBeenCalledTimes(1);
    expect(onSelectMeeting).toHaveBeenCalledWith("meeting-1");
  });

  test("shows loading state", () => {
    render(
      <MeetingSelectPage
        meetings={[]}
        isLoading={true}
        onNewMeeting={mock(() => {})}
        onSelectMeeting={mock(() => {})}
        onRefresh={mock(() => {})}
      />,
    );

    expect(screen.getByText(/loading/i)).toBeDefined();
  });

  test("displays 'Untitled Meeting' for meetings without title", () => {
    const meetingsWithoutTitle: MeetingInfo[] = [
      {
        id: "meeting-untitled",
        title: null,
        startedAt: Date.now() - 86400000,
        endedAt: null,
        createdAt: Date.now() - 86400000,
      },
    ];

    render(
      <MeetingSelectPage
        meetings={meetingsWithoutTitle}
        isLoading={false}
        onNewMeeting={mock(() => {})}
        onSelectMeeting={mock(() => {})}
        onRefresh={mock(() => {})}
      />,
    );

    expect(screen.getByText("Untitled Meeting")).toBeDefined();
  });

  test("calls onRefresh when refresh button is clicked", () => {
    const onRefresh = mock(() => {});

    render(
      <MeetingSelectPage
        meetings={mockMeetings}
        isLoading={false}
        onNewMeeting={mock(() => {})}
        onSelectMeeting={mock(() => {})}
        onRefresh={onRefresh}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /refresh/i }));

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  test("handles null meetings prop as empty list", () => {
    render(
      <MeetingSelectPage
        meetings={null}
        isLoading={false}
        onNewMeeting={mock(() => {})}
        onSelectMeeting={mock(() => {})}
        onRefresh={mock(() => {})}
      />,
    );

    expect(screen.getByText(/no past meetings/i)).toBeDefined();
  });

  test("renders 'Unknown' for invalid timestamps without crashing", () => {
    const meetingsWithInvalidTimestamp: MeetingInfo[] = [
      {
        id: "meeting-invalid-ts",
        title: "Invalid Timestamp",
        startedAt: Number.NaN,
        endedAt: null,
        createdAt: Date.now(),
      },
    ];

    render(
      <MeetingSelectPage
        meetings={meetingsWithInvalidTimestamp}
        isLoading={false}
        onNewMeeting={mock(() => {})}
        onSelectMeeting={mock(() => {})}
        onRefresh={mock(() => {})}
      />,
    );

    expect(screen.getByText("Unknown")).toBeDefined();
  });
});
