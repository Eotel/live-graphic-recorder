/**
 * Device selector component for choosing microphone and camera.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/hooks/useMediaStreamController.ts, src/components/recording/CameraPreview.tsx
 */

import { Video } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AudioLevelIndicator } from "./AudioLevelIndicator";
import { useAudioLevel } from "@/hooks/useAudioLevel";
import { cn } from "@/lib/utils";
import type { MediaSourceType } from "@/types/messages";
import { useTranslation } from "react-i18next";

export interface DeviceSelectorProps {
  audioDevices: MediaDeviceInfo[];
  videoDevices: MediaDeviceInfo[];
  selectedAudioDeviceId: string | null;
  selectedVideoDeviceId: string | null;
  onAudioDeviceChange: (deviceId: string) => void;
  onVideoDeviceChange: (deviceId: string) => void;
  disabled?: boolean;
  stream?: MediaStream | null;
  isRecording?: boolean;
  sourceType?: MediaSourceType;
  className?: string;
}

export function DeviceSelector({
  audioDevices,
  videoDevices,
  selectedAudioDeviceId,
  selectedVideoDeviceId,
  onAudioDeviceChange,
  onVideoDeviceChange,
  disabled = false,
  stream = null,
  isRecording = false,
  sourceType = "camera",
  className,
}: DeviceSelectorProps) {
  const { t } = useTranslation();
  const { isActive: isAudioActive } = useAudioLevel(stream, {
    enabled: isRecording,
  });

  // Only show video selector in camera mode
  const showVideoSelector = sourceType === "camera" && videoDevices.length > 0;
  const hasDevices = audioDevices.length > 0 || showVideoSelector;

  if (!hasDevices) {
    return null;
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {audioDevices.length > 0 && (
        <div className="flex items-center gap-2">
          <AudioLevelIndicator isActive={isAudioActive} />
          <Select
            value={selectedAudioDeviceId || undefined}
            onValueChange={onAudioDeviceChange}
            disabled={disabled}
          >
            <SelectTrigger className="w-full" size="sm">
              <SelectValue placeholder={t("recording.selectMicrophone")} />
            </SelectTrigger>
            <SelectContent>
              {audioDevices
                .filter((device) => device.deviceId)
                .map((device, index) => (
                  <SelectItem key={device.deviceId} value={device.deviceId}>
                    {device.label || t("recording.microphoneWithIndex", { index: index + 1 })}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {showVideoSelector && (
        <div className="flex items-center gap-2">
          <Video className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <Select
            value={selectedVideoDeviceId || undefined}
            onValueChange={onVideoDeviceChange}
            disabled={disabled}
          >
            <SelectTrigger className="w-full" size="sm">
              <SelectValue placeholder={t("recording.selectCamera")} />
            </SelectTrigger>
            <SelectContent>
              {videoDevices
                .filter((device) => device.deviceId)
                .map((device, index) => (
                  <SelectItem key={device.deviceId} value={device.deviceId}>
                    {device.label || t("recording.cameraWithIndex", { index: index + 1 })}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
