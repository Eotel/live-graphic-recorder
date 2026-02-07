import { MainLayout } from "@/components/layout/MainLayout";
import { PaneToolbar } from "@/components/layout/PaneToolbar";
import { PopoutPane } from "@/components/layout/PopoutPane";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { FooterAccountMenu } from "@/components/navigation/FooterAccountMenu";
import { RecordingControls } from "@/components/recording/RecordingControls";
import { CloudSaveButton } from "@/components/recording/CloudSaveButton";
import { CameraPreview } from "@/components/recording/CameraPreview";
import { DeviceSelector } from "@/components/recording/DeviceSelector";
import { MediaSourceToggle } from "@/components/recording/MediaSourceToggle";
import { SummaryPanel } from "@/components/summary/SummaryPanel";
import { TagList } from "@/components/summary/TagList";
import { TopicIndicator } from "@/components/summary/TopicIndicator";
import { FlowMeter } from "@/components/metrics/FlowMeter";
import { HeatMeter } from "@/components/metrics/HeatMeter";
import { ImageCarousel } from "@/components/graphics/ImageCarousel";
import { ImageModelToggle } from "@/components/graphics/ImageModelToggle";
import { MeetingHeader } from "@/components/navigation/MeetingHeader";
import { PaneContext } from "@/contexts/PaneContext";
import type { AppShellViewModel } from "@/app/container/useAppShellController";

interface AppShellRecordingViewProps {
  viewModel: AppShellViewModel;
}

export function AppShellRecordingView({ viewModel }: AppShellRecordingViewProps) {
  const {
    appState,
    session,
    media,
    localRecording,
    audioDownloadOptions,
    isAudioListLoading,
    audioListError,
    paneState,
    popouts,
    error,
    onPopout,
    onRequestPermission,
    onStartRecording,
    onStopRecording,
    onUpload,
    onCancelUpload,
    onDownloadReport,
    onOpenAudioList,
    onDownloadAudio,
    onResumeMeeting,
    onBackRequested,
    onLogout,
  } = viewModel;

  const summaryPaneMode = paneState.getPaneMode("summary");
  const cameraPaneMode = paneState.getPaneMode("camera");
  const graphicsPaneMode = paneState.getPaneMode("graphics");
  const meetingIdForReport = appState.meeting.meetingId;
  const isReadOnlyMeeting = appState.meeting.mode === "view";
  const canDownloadAudio = audioDownloadOptions.length > 0;

  return (
    <PaneContext.Provider value={paneState}>
      <MainLayout
        expandedPane={paneState.expandedPane}
        header={
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <MeetingHeader
                title={appState.meeting.meetingTitle}
                onBackRequested={onBackRequested}
                onUpdateTitle={isReadOnlyMeeting ? undefined : session.updateMeetingTitle}
              />
              <TopicIndicator topics={session.topics} />
            </div>
            <div className="flex items-center gap-4">
              <FlowMeter value={session.flow} />
              <HeatMeter value={session.heat} />
            </div>
          </div>
        }
        leftPanel={
          <PopoutPane
            paneId="summary"
            isPopout={paneState.popoutPanes.has("summary")}
            portalContainer={popouts.summary.portalContainer}
            onFocusPopout={() => popouts.summary.popoutWindow?.focus()}
          >
            <div className="group relative h-full flex flex-col overflow-hidden">
              <PaneToolbar
                paneId="summary"
                mode={summaryPaneMode}
                onExpand={() => paneState.expandPane("summary")}
                onCollapse={() => paneState.collapsePane()}
                onPopout={() => onPopout("summary")}
              />
              <SummaryPanel
                summaryPages={session.summaryPages}
                transcriptSegments={session.transcriptSegments}
                interimText={session.interimText}
                interimSpeaker={session.interimSpeaker}
                interimStartTime={session.interimStartTime}
                isAnalyzing={session.isAnalyzing}
                className="flex-1 min-h-0"
              />
              <TagList
                tags={session.tags}
                className="flex-shrink-0 mt-3 pt-3 border-t border-border"
              />
            </div>
          </PopoutPane>
        }
        rightPanel={
          <div className="h-full flex flex-col">
            <div className="flex-shrink-0 mx-4 mt-4 mb-2 flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <MediaSourceToggle
                  value={appState.media.sourceType}
                  onChange={
                    appState.recording.isRecording
                      ? media.switchVideoSource
                      : media.switchSourceType
                  }
                  disabled={appState.media.isSwitching || isReadOnlyMeeting}
                  isLoading={appState.media.isSwitching}
                />
                <ImageModelToggle
                  value={session.imageModel.preset}
                  model={session.imageModel.model}
                  onChange={session.setImageModelPreset}
                  proAvailable={Boolean(session.imageModel.available.pro)}
                  disabled={session.isGenerating}
                />
              </div>
              {appState.media.hasPermission && (
                <DeviceSelector
                  audioDevices={media.audioDevices}
                  videoDevices={media.videoDevices}
                  selectedAudioDeviceId={media.selectedAudioDeviceId}
                  selectedVideoDeviceId={media.selectedVideoDeviceId}
                  onAudioDeviceChange={media.setAudioDevice}
                  onVideoDeviceChange={media.setVideoDevice}
                  disabled={appState.media.isSwitching || isReadOnlyMeeting}
                  stream={media.stream}
                  isRecording={appState.recording.isRecording}
                  sourceType={appState.media.sourceType}
                />
              )}
            </div>
            <ResizablePanelGroup
              id="camera-graphics"
              direction="vertical"
              className="flex-1 min-h-0"
            >
              <ResizablePanel id="camera-panel" defaultSize={35} minSize={20} maxSize={70}>
                <PopoutPane
                  paneId="camera"
                  isPopout={paneState.popoutPanes.has("camera")}
                  portalContainer={popouts.camera.portalContainer}
                  onFocusPopout={() => popouts.camera.popoutWindow?.focus()}
                >
                  <div className="group relative h-full flex flex-col px-4 pb-4">
                    <PaneToolbar
                      paneId="camera"
                      mode={cameraPaneMode}
                      onExpand={() => paneState.expandPane("camera")}
                      onCollapse={() => paneState.collapsePane()}
                      onPopout={() => onPopout("camera")}
                    />
                    <CameraPreview
                      videoRef={media.videoRef}
                      hasPermission={appState.media.hasPermission}
                      isRecording={appState.recording.isRecording}
                      sourceType={appState.media.sourceType}
                      className="flex-1 min-h-0"
                    />
                  </div>
                </PopoutPane>
              </ResizablePanel>
              <ResizableHandle />
              <ResizablePanel id="graphics-panel" defaultSize={65} minSize={30} maxSize={80}>
                <PopoutPane
                  paneId="graphics"
                  isPopout={paneState.popoutPanes.has("graphics")}
                  portalContainer={popouts.graphics.portalContainer}
                  onFocusPopout={() => popouts.graphics.popoutWindow?.focus()}
                >
                  <div className="group relative h-full flex flex-col px-4 pt-4 pb-4">
                    <PaneToolbar
                      paneId="graphics"
                      mode={graphicsPaneMode}
                      onExpand={() => paneState.expandPane("graphics")}
                      onCollapse={() => paneState.collapsePane()}
                      onPopout={() => onPopout("graphics")}
                    />
                    <ImageCarousel
                      images={session.images}
                      isGenerating={session.isGenerating}
                      generationPhase={session.generationPhase}
                      className="flex-1 min-h-0"
                    />
                  </div>
                </PopoutPane>
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        }
        cameraPanel={
          <PopoutPane
            paneId="camera"
            isPopout={paneState.popoutPanes.has("camera")}
            portalContainer={popouts.camera.portalContainer}
            onFocusPopout={() => popouts.camera.popoutWindow?.focus()}
          >
            <div className="group relative h-full flex flex-col">
              <PaneToolbar
                paneId="camera"
                mode={cameraPaneMode}
                onExpand={() => paneState.expandPane("camera")}
                onCollapse={() => paneState.collapsePane()}
                onPopout={() => onPopout("camera")}
              />
              <CameraPreview
                videoRef={media.videoRef}
                hasPermission={appState.media.hasPermission}
                isRecording={appState.recording.isRecording}
                sourceType={appState.media.sourceType}
                className="flex-1 min-h-0"
              />
            </div>
          </PopoutPane>
        }
        graphicsPanel={
          <PopoutPane
            paneId="graphics"
            isPopout={paneState.popoutPanes.has("graphics")}
            portalContainer={popouts.graphics.portalContainer}
            onFocusPopout={() => popouts.graphics.popoutWindow?.focus()}
          >
            <div className="group relative h-full flex flex-col">
              <PaneToolbar
                paneId="graphics"
                mode={graphicsPaneMode}
                onExpand={() => paneState.expandPane("graphics")}
                onCollapse={() => paneState.collapsePane()}
                onPopout={() => onPopout("graphics")}
              />
              <ImageCarousel
                images={session.images}
                isGenerating={session.isGenerating}
                generationPhase={session.generationPhase}
                className="flex-1 min-h-0"
              />
            </div>
          </PopoutPane>
        }
        footer={
          <div className="flex w-full flex-wrap items-center gap-4">
            <FooterAccountMenu
              hasMeeting={Boolean(meetingIdForReport)}
              canDownloadAudio={canDownloadAudio}
              isDownloadingReport={appState.ui.isDownloadingReport}
              audioOptions={audioDownloadOptions}
              isAudioOptionsLoading={isAudioListLoading}
              audioOptionsError={audioListError}
              onDownloadReport={onDownloadReport}
              onOpenAudioList={onOpenAudioList}
              onDownloadAudio={onDownloadAudio}
              onLogout={onLogout}
            />

            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-center gap-4">
              <RecordingControls
                sessionStatus={appState.recording.sessionStatus}
                isRecording={appState.recording.isRecording}
                hasPermission={appState.media.hasPermission}
                isLoading={appState.media.isLoading}
                error={error}
                sourceType={appState.media.sourceType}
                elapsedTime={appState.recording.elapsedTime}
                hasMeeting={appState.derived.hasMeeting}
                readOnly={isReadOnlyMeeting}
                onResumeMeeting={onResumeMeeting}
                onRequestPermission={onRequestPermission}
                onStart={onStartRecording}
                onStop={onStopRecording}
              />
              {!isReadOnlyMeeting && (
                <CloudSaveButton
                  meetingId={meetingIdForReport}
                  isRecording={appState.recording.isRecording}
                  isUploading={appState.upload.isUploading}
                  progress={appState.upload.progress}
                  error={appState.upload.error}
                  pendingCount={localRecording.pendingRecordings.length}
                  onUpload={onUpload}
                  onCancel={onCancelUpload}
                />
              )}
            </div>
          </div>
        }
      />
    </PaneContext.Provider>
  );
}
