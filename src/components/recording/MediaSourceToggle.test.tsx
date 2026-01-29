import { test, expect, describe, mock, afterEach } from "bun:test";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { MediaSourceToggle } from "./MediaSourceToggle";

describe("MediaSourceToggle", () => {
  afterEach(() => {
    cleanup();
  });

  test("renders camera and screen options", () => {
    const onChange = mock(() => {});
    render(<MediaSourceToggle value="camera" onChange={onChange} />);

    expect(screen.getByText("Camera")).toBeDefined();
    expect(screen.getByText("Screen")).toBeDefined();
  });

  test("calls onChange with 'screen' when screen button is clicked", () => {
    const onChange = mock(() => {});
    render(<MediaSourceToggle value="camera" onChange={onChange} />);

    fireEvent.click(screen.getByText("Screen"));
    expect(onChange).toHaveBeenCalledWith("screen");
  });

  test("calls onChange with 'camera' when camera button is clicked", () => {
    const onChange = mock(() => {});
    render(<MediaSourceToggle value="screen" onChange={onChange} />);

    fireEvent.click(screen.getByText("Camera"));
    expect(onChange).toHaveBeenCalledWith("camera");
  });

  test("buttons are disabled when disabled prop is true", () => {
    const onChange = mock(() => {});
    render(<MediaSourceToggle value="camera" onChange={onChange} disabled />);

    const cameraButton = screen.getByText("Camera").closest("button");
    const screenButton = screen.getByText("Screen").closest("button");

    expect(cameraButton?.disabled).toBe(true);
    expect(screenButton?.disabled).toBe(true);
  });

  test("does not call onChange when buttons are disabled", () => {
    const onChange = mock(() => {});
    render(<MediaSourceToggle value="camera" onChange={onChange} disabled />);

    fireEvent.click(screen.getByText("Screen"));
    expect(onChange).not.toHaveBeenCalled();
  });

  test("applies active styles to camera when selected", () => {
    const onChange = mock(() => {});
    render(<MediaSourceToggle value="camera" onChange={onChange} />);

    const cameraButton = screen.getByText("Camera").closest("button");
    const screenButton = screen.getByText("Screen").closest("button");

    // Camera should have active styles (bg-background)
    expect(cameraButton?.className).toContain("bg-background");
    expect(screenButton?.className).not.toContain("bg-background");
  });

  test("applies active styles to screen when selected", () => {
    const onChange = mock(() => {});
    render(<MediaSourceToggle value="screen" onChange={onChange} />);

    const cameraButton = screen.getByText("Camera").closest("button");
    const screenButton = screen.getByText("Screen").closest("button");

    // Screen should have active styles (bg-background)
    expect(screenButton?.className).toContain("bg-background");
    expect(cameraButton?.className).not.toContain("bg-background");
  });
});
