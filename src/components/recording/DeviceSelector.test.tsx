/**
 * Tests for DeviceSelector component.
 *
 * Related: src/components/recording/DeviceSelector.tsx
 */

import { describe, test, expect } from "bun:test";
import { render, screen } from "@testing-library/react";
import { DeviceSelector, type DeviceSelectorProps } from "./DeviceSelector";

describe("DeviceSelector", () => {
  const createMockDevice = (
    kind: "audioinput" | "videoinput",
    deviceId: string,
    label: string,
  ): MediaDeviceInfo => ({
    deviceId,
    groupId: `group-${deviceId}`,
    kind,
    label,
    toJSON: () => ({ deviceId, groupId: `group-${deviceId}`, kind, label }),
  });

  const mockAudioDevices: MediaDeviceInfo[] = [
    createMockDevice("audioinput", "audio-1", "Built-in Microphone"),
    createMockDevice("audioinput", "audio-2", "External Microphone"),
  ];

  const mockVideoDevices: MediaDeviceInfo[] = [
    createMockDevice("videoinput", "video-1", "Built-in Camera"),
    createMockDevice("videoinput", "video-2", "External Webcam"),
  ];

  const defaultProps: DeviceSelectorProps = {
    audioDevices: mockAudioDevices,
    videoDevices: mockVideoDevices,
    selectedAudioDeviceId: "audio-1",
    selectedVideoDeviceId: "video-1",
    onAudioDeviceChange: () => {},
    onVideoDeviceChange: () => {},
    disabled: false,
  };

  describe("rendering", () => {
    test("should return null when no devices are available", () => {
      const { container } = render(
        <DeviceSelector {...defaultProps} audioDevices={[]} videoDevices={[]} />,
      );

      expect(container.innerHTML).toBe("");
    });

    test("should render audio device selector when audio devices exist", () => {
      render(<DeviceSelector {...defaultProps} videoDevices={[]} />);

      const combobox = screen.getByRole("combobox");
      expect(combobox).toBeTruthy();
    });

    test("should render video device selector when video devices exist", () => {
      render(<DeviceSelector {...defaultProps} audioDevices={[]} />);

      const combobox = screen.getByRole("combobox");
      expect(combobox).toBeTruthy();
    });

    test("should render both selectors when both device types exist", () => {
      render(<DeviceSelector {...defaultProps} />);

      const comboboxes = screen.getAllByRole("combobox");
      expect(comboboxes.length).toBe(2);
    });
  });

  describe("audio device selection", () => {
    test("should display selected audio device label", () => {
      render(<DeviceSelector {...defaultProps} videoDevices={[]} />);

      expect(screen.getByText("Built-in Microphone")).toBeTruthy();
    });
  });

  describe("video device selection", () => {
    test("should display selected video device label", () => {
      render(<DeviceSelector {...defaultProps} audioDevices={[]} />);

      expect(screen.getByText("Built-in Camera")).toBeTruthy();
    });
  });

  describe("disabled state", () => {
    test("should disable selectors when disabled prop is true", () => {
      render(<DeviceSelector {...defaultProps} disabled={true} />);

      const comboboxes = screen.getAllByRole("combobox");
      for (const combobox of comboboxes) {
        expect(combobox.getAttribute("data-disabled")).toBe("");
      }
    });
  });

  describe("fallback labels", () => {
    test("should show truncated device ID when label is empty", () => {
      const devicesWithoutLabels: MediaDeviceInfo[] = [
        createMockDevice("audioinput", "abcd1234efgh5678", ""),
      ];

      render(
        <DeviceSelector
          {...defaultProps}
          audioDevices={devicesWithoutLabels}
          videoDevices={[]}
          selectedAudioDeviceId="abcd1234efgh5678"
        />,
      );

      expect(screen.getByText("Microphone abcd1234")).toBeTruthy();
    });
  });
});
