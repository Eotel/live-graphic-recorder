import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

import { FooterAccountMenu } from "./FooterAccountMenu";
import { i18n, LANGUAGE_STORAGE_KEY } from "@/i18n/config";

const audioOptions = [
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
];

describe("FooterAccountMenu", () => {
  beforeEach(async () => {
    localStorage.removeItem(LANGUAGE_STORAGE_KEY);
    await i18n.changeLanguage("en");
  });

  afterEach(() => {
    cleanup();
  });

  test("opens menu upward and loads audio options", () => {
    const onOpenAudioList = mock(async () => {});

    render(
      <FooterAccountMenu
        hasMeeting={true}
        canDownloadAudio={true}
        isDownloadingReport={false}
        audioOptions={audioOptions}
        isAudioOptionsLoading={false}
        audioOptionsError={null}
        onDownloadReport={mock(async () => {})}
        onOpenAudioList={onOpenAudioList}
        onDownloadAudio={mock((_audioUrl: string) => {})}
        onLogout={mock(async () => {})}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));

    const menu = screen.getByRole("menu");
    expect(menu.className).toContain("bottom-full");
    expect(onOpenAudioList).toHaveBeenCalledTimes(1);
  });

  test("downloads report", () => {
    const onDownloadReport = mock(async () => {});

    render(
      <FooterAccountMenu
        hasMeeting={true}
        canDownloadAudio={true}
        isDownloadingReport={false}
        audioOptions={audioOptions}
        isAudioOptionsLoading={false}
        audioOptionsError={null}
        onDownloadReport={onDownloadReport}
        onOpenAudioList={mock(async () => {})}
        onDownloadAudio={mock((_audioUrl: string) => {})}
        onLogout={mock(async () => {})}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /download report/i }));

    expect(onDownloadReport).toHaveBeenCalledTimes(1);
  });

  test("downloads selected audio", () => {
    const onDownloadAudio = mock((_audioUrl: string) => {});

    render(
      <FooterAccountMenu
        hasMeeting={true}
        canDownloadAudio={true}
        isDownloadingReport={false}
        audioOptions={audioOptions}
        isAudioOptionsLoading={false}
        audioOptionsError={null}
        onDownloadReport={mock(async () => {})}
        onOpenAudioList={mock(async () => {})}
        onDownloadAudio={onDownloadAudio}
        onLogout={mock(async () => {})}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));

    fireEvent.change(screen.getByLabelText(/select audio to download/i), {
      target: { value: "/api/meetings/m/audio/2" },
    });

    fireEvent.click(screen.getByRole("menuitem", { name: /download selected audio/i }));

    expect(onDownloadAudio).toHaveBeenCalledTimes(1);
    expect(onDownloadAudio).toHaveBeenCalledWith("/api/meetings/m/audio/2");
  });

  test("calls logout", () => {
    const onLogout = mock(async () => {});

    render(
      <FooterAccountMenu
        hasMeeting={true}
        canDownloadAudio={true}
        isDownloadingReport={false}
        audioOptions={audioOptions}
        isAudioOptionsLoading={false}
        audioOptionsError={null}
        onDownloadReport={mock(async () => {})}
        onOpenAudioList={mock(async () => {})}
        onDownloadAudio={mock((_audioUrl: string) => {})}
        onLogout={onLogout}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    fireEvent.click(screen.getByRole("menuitem", { name: /log out/i }));

    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  test("switches language to JA", async () => {
    render(
      <FooterAccountMenu
        hasMeeting={true}
        canDownloadAudio={true}
        isDownloadingReport={false}
        audioOptions={audioOptions}
        isAudioOptionsLoading={false}
        audioOptionsError={null}
        onDownloadReport={mock(async () => {})}
        onOpenAudioList={mock(async () => {})}
        onDownloadAudio={mock((_audioUrl: string) => {})}
        onLogout={mock(async () => {})}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    fireEvent.click(screen.getByRole("menuitemradio", { name: "JA" }));

    await waitFor(() => {
      expect(i18n.language.startsWith("ja")).toBe(true);
      expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("ja");
    });
  });

  test("closes with escape and outside click", () => {
    render(
      <div>
        <FooterAccountMenu
          hasMeeting={true}
          canDownloadAudio={true}
          isDownloadingReport={false}
          audioOptions={audioOptions}
          isAudioOptionsLoading={false}
          audioOptionsError={null}
          onDownloadReport={mock(async () => {})}
          onOpenAudioList={mock(async () => {})}
          onDownloadAudio={mock((_audioUrl: string) => {})}
          onLogout={mock(async () => {})}
        />
        <button type="button">outside</button>
      </div>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    expect(screen.getByRole("menu")).toBeTruthy();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    expect(screen.getByRole("menu")).toBeTruthy();

    fireEvent.mouseDown(screen.getByRole("button", { name: "outside" }));
    expect(screen.queryByRole("menu")).toBeNull();
  });
});
