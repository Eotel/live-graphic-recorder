import { useCallback, useEffect, useMemo, useRef } from "react";
import type { MutableRefObject } from "react";

import { createMeetingUsecase, selectMeetingUsecase } from "@/app/usecases";
import type { AppStore, AppStoreActions, AppView } from "@/app/view-model/app-store";
import type { UseAuthReturn } from "@/hooks/useAuth";
import type { UseLocalRecordingReturn } from "@/hooks/useLocalRecording";
import type { UseMeetingSessionReturn } from "@/hooks/useMeetingSession";
import { useTranslation } from "react-i18next";

const MEETING_LIST_REQUEST_TIMEOUT_MS = 10000;
interface UseMeetingListFlowParams {
  authStatus: UseAuthReturn["status"];
  meetingView: AppView;
  session: UseMeetingSessionReturn;
  appStore: AppStore;
  appActions: AppStoreActions;
  localRecordingRef: MutableRefObject<UseLocalRecordingReturn>;
}

export function useMeetingListFlow({
  authStatus,
  meetingView,
  session,
  appStore,
  appActions,
  localRecordingRef,
}: UseMeetingListFlowParams) {
  const { t } = useTranslation();
  const meetingListRequestTimeoutRef = useRef<number | null>(null);
  const meetingListSnapshotRef = useRef(session.meeting.meetingList);
  const meetingListErrorBaselineRef = useRef<string | null>(session.error);
  const latestMeetingListRef = useRef(session.meeting.meetingList);
  latestMeetingListRef.current = session.meeting.meetingList;
  const latestSessionErrorRef = useRef(session.error);
  latestSessionErrorRef.current = session.error;

  const clearMeetingListRequestTimeout = useCallback(() => {
    if (meetingListRequestTimeoutRef.current !== null) {
      window.clearTimeout(meetingListRequestTimeoutRef.current);
      meetingListRequestTimeoutRef.current = null;
    }
  }, []);

  const finishMeetingListLoad = useCallback(() => {
    clearMeetingListRequestTimeout();
    appActions.setMeetingState({ isListLoading: false });
  }, [appActions, clearMeetingListRequestTimeout]);

  const startMeetingListLoad = useCallback(() => {
    clearMeetingListRequestTimeout();
    meetingListSnapshotRef.current = latestMeetingListRef.current;
    meetingListErrorBaselineRef.current = latestSessionErrorRef.current;
    appActions.setMeetingState({ isListLoading: true, listError: null });
    meetingListRequestTimeoutRef.current = window.setTimeout(() => {
      meetingListRequestTimeoutRef.current = null;
      appActions.setMeetingState({
        isListLoading: false,
        listError: t("meeting.listTimeoutError"),
      });
    }, MEETING_LIST_REQUEST_TIMEOUT_MS);
  }, [appActions, clearMeetingListRequestTimeout, t]);

  useEffect(() => {
    return () => {
      clearMeetingListRequestTimeout();
    };
  }, [clearMeetingListRequestTimeout]);

  useEffect(() => {
    if (authStatus !== "authenticated") return;
    if (!session.isConnected) return;

    const pending = appStore.getState().meeting.pendingAction;
    if (pending) {
      finishMeetingListLoad();
      appActions.setMeetingState({
        pendingAction: null,
        listError: null,
        view: "recording",
      });
      appActions.setRecordingState({ hasLocalFile: false });
      localRecordingRef.current.reset();
      if (pending.type === "new") {
        session.startMeeting(pending.title);
      } else {
        session.startMeeting(undefined, pending.meetingId, "view");
      }
      return;
    }

    if (meetingView !== "select") return;
    startMeetingListLoad();
    session.requestMeetingList();
  }, [
    appActions,
    appStore,
    authStatus,
    finishMeetingListLoad,
    localRecordingRef,
    meetingView,
    session.isConnected,
    session.requestMeetingList,
    session.startMeeting,
    startMeetingListLoad,
  ]);

  useEffect(() => {
    if (!appStore.getState().meeting.isListLoading) return;
    if (session.meeting.meetingList === meetingListSnapshotRef.current) return;
    finishMeetingListLoad();
    appActions.setMeetingState({ listError: null });
  }, [appActions, appStore, finishMeetingListLoad, session.meeting.meetingList]);

  useEffect(() => {
    const meeting = appStore.getState().meeting;
    if (meeting.view !== "select") return;
    if (!meeting.isListLoading) return;
    if (!session.error) return;
    if (session.error === meetingListErrorBaselineRef.current) return;
    finishMeetingListLoad();
    appActions.setMeetingState({ listError: session.error });
  }, [appActions, appStore, finishMeetingListLoad, session.error]);

  const prepareMeetingStart = useCallback(() => {
    finishMeetingListLoad();
    appActions.setMeetingState({ listError: null });
    appActions.setRecordingState({ hasLocalFile: false });
    localRecordingRef.current.reset();
  }, [appActions, finishMeetingListLoad, localRecordingRef]);

  const runCreateMeeting = useMemo(
    () =>
      createMeetingUsecase({
        isConnected: () => session.isConnected,
        connect: session.connect,
        startMeeting: session.startMeeting,
        beforeStart: prepareMeetingStart,
        onStarted: () => {
          appActions.setMeetingState({ view: "recording" });
        },
        setPendingAction: (action) => {
          appActions.setMeetingState({ pendingAction: action });
        },
      }),
    [appActions, prepareMeetingStart, session.connect, session.isConnected, session.startMeeting],
  );

  const runSelectMeeting = useMemo(
    () =>
      selectMeetingUsecase({
        isConnected: () => session.isConnected,
        connect: session.connect,
        startMeeting: (title, meetingId) => {
          session.startMeeting(title, meetingId, "view");
        },
        beforeStart: prepareMeetingStart,
        onStarted: () => {
          appActions.setMeetingState({ view: "recording" });
        },
        setPendingAction: (action) => {
          appActions.setMeetingState({ pendingAction: action });
        },
      }),
    [appActions, prepareMeetingStart, session.connect, session.isConnected, session.startMeeting],
  );

  const onNewMeeting = useCallback(
    (title?: string) => {
      runCreateMeeting(title);
    },
    [runCreateMeeting],
  );

  const onSelectMeeting = useCallback(
    (meetingId: string) => {
      runSelectMeeting(meetingId);
    },
    [runSelectMeeting],
  );

  const onRefreshMeetings = useCallback(() => {
    startMeetingListLoad();
    if (session.isConnected) {
      session.requestMeetingList();
      return;
    }
    session.connect();
  }, [session.connect, session.isConnected, session.requestMeetingList, startMeetingListLoad]);

  return {
    onNewMeeting,
    onSelectMeeting,
    onRefreshMeetings,
    clearMeetingListRequestTimeout,
  };
}
