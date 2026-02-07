import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import "@/i18n/config";
import { DownloadMenuButton } from "./DownloadMenuButton";

afterEach(() => {
  cleanup();
});

describe("DownloadMenuButton", () => {
  test("opens menu and calls report download", () => {
    const onDownloadReport = mock(async () => {});
    const onDownloadAudio = mock((_audioUrl: string) => {});
    const onOpenAudioList = mock(async () => {});

    render(
      <DownloadMenuButton
        hasMeeting={true}
        canDownloadAudio={true}
        isDownloadingReport={false}
        audioOptions={[
          {
            id: 1,
            url: "/api/meetings/m/audio/1",
            createdAt: 1_000,
            fileSizeBytes: 100,
            label: "2026/02/07 10:00 · 100 B",
          },
        ]}
        isAudioOptionsLoading={false}
        audioOptionsError={null}
        onDownloadReport={onDownloadReport}
        onOpenAudioList={onOpenAudioList}
        onDownloadAudio={onDownloadAudio}
      />,
    );

    const trigger = screen.getByRole("button", { name: /download|ダウンロード|report\.menu/i });
    fireEvent.click(trigger);
    expect(onOpenAudioList).toHaveBeenCalledTimes(1);

    const menuItems = screen.getAllByRole("menuitem");
    fireEvent.click(menuItems[0]!);

    expect(onDownloadReport).toHaveBeenCalledTimes(1);
    expect(onDownloadAudio).toHaveBeenCalledTimes(0);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  test("downloads selected audio URL", () => {
    const onDownloadReport = mock(async () => {});
    const onDownloadAudio = mock((_audioUrl: string) => {});
    const onOpenAudioList = mock(async () => {});

    render(
      <DownloadMenuButton
        hasMeeting={true}
        canDownloadAudio={true}
        isDownloadingReport={false}
        audioOptions={[
          {
            id: 1,
            url: "/api/meetings/m/audio/1",
            createdAt: 1_000,
            fileSizeBytes: 100,
            label: "2026/02/07 10:00 · 100 B",
          },
          {
            id: 2,
            url: "/api/meetings/m/audio/2",
            createdAt: 2_000,
            fileSizeBytes: 200,
            label: "2026/02/07 10:10 · 200 B",
          },
        ]}
        isAudioOptionsLoading={false}
        audioOptionsError={null}
        onDownloadReport={onDownloadReport}
        onOpenAudioList={onOpenAudioList}
        onDownloadAudio={onDownloadAudio}
      />,
    );

    const trigger = screen.getByRole("button", { name: /download|ダウンロード|report\.menu/i });
    fireEvent.click(trigger);

    const select = screen.getByLabelText(
      /select audio|ダウンロードする音声|report\.audioSelectLabel/i,
    );
    fireEvent.change(select, { target: { value: "/api/meetings/m/audio/2" } });

    const menuItems = screen.getAllByRole("menuitem");
    fireEvent.click(menuItems[1]!);

    expect(onDownloadAudio).toHaveBeenCalledTimes(1);
    expect(onDownloadAudio).toHaveBeenCalledWith("/api/meetings/m/audio/2");
  });

  test("shows empty state and disables selected audio download", () => {
    const onDownloadReport = mock(async () => {});
    const onDownloadAudio = mock((_audioUrl: string) => {});
    const onOpenAudioList = mock(async () => {});

    render(
      <DownloadMenuButton
        hasMeeting={true}
        canDownloadAudio={false}
        isDownloadingReport={false}
        audioOptions={[]}
        isAudioOptionsLoading={false}
        audioOptionsError={null}
        onDownloadReport={onDownloadReport}
        onOpenAudioList={onOpenAudioList}
        onDownloadAudio={onDownloadAudio}
      />,
    );

    const trigger = screen.getByRole("button", { name: /download|ダウンロード|report\.menu/i });
    fireEvent.click(trigger);

    expect(screen.getByText(/no audio|音声データがありません|report\.audioEmpty/i)).toBeTruthy();
    const menuItems = screen.getAllByRole("menuitem") as HTMLButtonElement[];
    expect(menuItems[1]!.disabled).toBe(true);
  });
});
