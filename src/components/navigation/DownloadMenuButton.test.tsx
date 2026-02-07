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
    const onDownloadAudio = mock(() => {});

    render(
      <DownloadMenuButton
        hasMeeting={true}
        canDownloadAudio={true}
        isDownloadingReport={false}
        onDownloadReport={onDownloadReport}
        onDownloadAudio={onDownloadAudio}
      />,
    );

    const trigger = screen.getByRole("button", { name: /download|ダウンロード|report\.menu/i });
    fireEvent.click(trigger);

    const menuItems = screen.getAllByRole("menuitem");
    fireEvent.click(menuItems[0]!);

    expect(onDownloadReport).toHaveBeenCalledTimes(1);
    expect(onDownloadAudio).toHaveBeenCalledTimes(0);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  test("disables audio download item when URL is unavailable", () => {
    const onDownloadReport = mock(async () => {});
    const onDownloadAudio = mock(() => {});

    render(
      <DownloadMenuButton
        hasMeeting={true}
        canDownloadAudio={false}
        isDownloadingReport={false}
        onDownloadReport={onDownloadReport}
        onDownloadAudio={onDownloadAudio}
      />,
    );

    const trigger = screen.getByRole("button", { name: /download|ダウンロード|report\.menu/i });
    fireEvent.click(trigger);

    const menuItems = screen.getAllByRole("menuitem") as HTMLButtonElement[];
    expect(menuItems[1]!.disabled).toBe(true);
  });
});
