import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { i18n, LANGUAGE_STORAGE_KEY } from "@/i18n/config";
import { LanguageToggle } from "./LanguageToggle";

describe("LanguageToggle", () => {
  beforeEach(async () => {
    localStorage.removeItem(LANGUAGE_STORAGE_KEY);
    await i18n.changeLanguage("en");
    cleanup();
  });

  afterEach(() => {
    cleanup();
  });

  test("shows EN as active by default", () => {
    render(<LanguageToggle />);

    const enButton = screen.getByRole("button", { name: "EN" });
    const jaButton = screen.getByRole("button", { name: "JA" });

    expect(enButton.getAttribute("aria-pressed")).toBe("true");
    expect(jaButton.getAttribute("aria-pressed")).toBe("false");
  });

  test("switches to JA and persists language", async () => {
    render(<LanguageToggle />);

    fireEvent.click(screen.getByRole("button", { name: "JA" }));

    await waitFor(() => {
      expect(i18n.language.startsWith("ja")).toBe(true);
      expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("ja");
      expect(screen.getByRole("button", { name: "JA" }).getAttribute("aria-pressed")).toBe("true");
    });
  });
});
