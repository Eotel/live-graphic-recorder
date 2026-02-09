import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useTranslation } from "react-i18next";
import { triggerAnchorDownload } from "@/app/bridge";
import { buildDefaultReportUrl } from "@/app/usecases/downloadReportUsecase";
import type { SessionStatus } from "@/types/messages";
import type { UserRole } from "@/types/auth";

type SessionStatusFilter = "all" | SessionStatus;

interface AdminSessionListItem {
  sessionId: string;
  meetingId: string;
  meetingTitle: string | null;
  ownerUserId: string | null;
  ownerEmail: string | null;
  status: SessionStatus;
  startedAt: number | null;
  endedAt: number | null;
  meetingCreatedAt: number;
}

interface AdminSessionDetail {
  sessionId: string;
  meetingId: string;
  meetingTitle: string | null;
  ownerUserId: string | null;
  ownerEmail: string | null;
  status: SessionStatus;
  startedAt: number | null;
  endedAt: number | null;
  meetingCreatedAt: number;
  counts: {
    transcriptSegments: number;
    analyses: number;
    images: number;
    captures: number;
    audioRecordings: number;
  };
}

interface AdminSessionListResponse {
  sessions: AdminSessionListItem[];
  total: number;
  limit: number;
  offset: number;
}

interface AdminSessionDetailResponse {
  session: AdminSessionDetail;
}

interface FilterState {
  q: string;
  status: SessionStatusFilter;
  from: string;
  to: string;
}

interface AdminPageProps {
  userEmail: string;
  userRole: UserRole;
  isSubmitting: boolean;
  onBackToApp: () => void;
  onLogout: () => Promise<void>;
}

const PAGE_SIZE = 30;
const STATUS_OPTIONS: SessionStatusFilter[] = ["all", "idle", "recording", "processing", "error"];

function formatDateTime(value: number | null, emptyLabel: string): string {
  if (!Number.isFinite(value) || value === null || value <= 0) {
    return emptyLabel;
  }
  return new Date(value).toLocaleString();
}

function parseDateTimeInput(value: string): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return parsed;
}

export function AdminPage({
  userEmail,
  userRole,
  isSubmitting,
  onBackToApp,
  onLogout,
}: AdminPageProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<FilterState>({
    q: "",
    status: "all",
    from: "",
    to: "",
  });
  const [applied, setApplied] = useState<FilterState>(draft);
  const [page, setPage] = useState(0);
  const [isListLoading, setIsListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<AdminSessionListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminSessionDetail | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PAGE_SIZE)), [total]);
  const hasPrevious = page > 0;
  const hasNext = page + 1 < totalPages;
  const canDownloadReport = userRole === "admin" && Boolean(detail?.meetingId);

  const handleDownloadReport = useCallback(() => {
    if (!detail?.meetingId || userRole !== "admin") {
      return;
    }
    triggerAnchorDownload(buildDefaultReportUrl(detail.meetingId));
  }, [detail?.meetingId, userRole]);

  const loadSessions = useCallback(async () => {
    setIsListLoading(true);
    setListError(null);
    try {
      const params = new URLSearchParams();
      const q = applied.q.trim();
      if (q) {
        params.set("q", q);
      }
      if (applied.status !== "all") {
        params.set("status", applied.status);
      }
      const from = parseDateTimeInput(applied.from);
      if (typeof from === "number") {
        params.set("from", String(from));
      }
      const to = parseDateTimeInput(applied.to);
      if (typeof to === "number") {
        params.set("to", String(to));
      }
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(page * PAGE_SIZE));

      const response = await fetch(`/api/admin/sessions?${params.toString()}`, {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const payload = (await response.json()) as AdminSessionListResponse;
      const nextSessions = Array.isArray(payload.sessions) ? payload.sessions : [];
      setSessions(nextSessions);
      setTotal(typeof payload.total === "number" ? payload.total : 0);

      setSelectedSessionId((current) => {
        if (current && nextSessions.some((item) => item.sessionId === current)) {
          return current;
        }
        return nextSessions[0]?.sessionId ?? null;
      });
    } catch (error) {
      console.error("[Admin] Failed to load sessions:", error);
      setSessions([]);
      setTotal(0);
      setListError(t("admin.loadListFailed"));
    } finally {
      setIsListLoading(false);
    }
  }, [applied.from, applied.q, applied.status, applied.to, page, t]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (!selectedSessionId) {
      setDetail(null);
      setDetailError(null);
      return;
    }

    let cancelled = false;
    const loadDetail = async () => {
      setIsDetailLoading(true);
      setDetailError(null);
      try {
        const response = await fetch(
          `/api/admin/sessions/${encodeURIComponent(selectedSessionId)}`,
          {
            method: "GET",
            credentials: "include",
          },
        );
        if (!response.ok) {
          throw new Error(await response.text());
        }

        const payload = (await response.json()) as AdminSessionDetailResponse;
        if (cancelled) {
          return;
        }
        setDetail(payload.session ?? null);
      } catch (error) {
        console.error("[Admin] Failed to load session detail:", error);
        if (cancelled) {
          return;
        }
        setDetail(null);
        setDetailError(t("admin.loadDetailFailed"));
      } finally {
        if (!cancelled) {
          setIsDetailLoading(false);
        }
      }
    };

    void loadDetail();
    return () => {
      cancelled = true;
    };
  }, [selectedSessionId, t]);

  const handleFilterSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setPage(0);
    setApplied(draft);
  };

  return (
    <div className="min-h-screen bg-background px-4 py-6 md:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card/60 p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{t("admin.title")}</h1>
            <p className="text-sm text-muted-foreground">
              {t("admin.signedInAs", { email: userEmail, role: userRole })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" type="button" onClick={onBackToApp}>
              {t("admin.backToApp")}
            </Button>
            <Button variant="outline" type="button" onClick={onLogout} disabled={isSubmitting}>
              {t("common.logout")}
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("admin.filtersTitle")}</CardTitle>
            <CardDescription>{t("admin.filtersDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3 md:grid-cols-5" onSubmit={handleFilterSubmit}>
              <div className="md:col-span-2">
                <Input
                  type="text"
                  value={draft.q}
                  placeholder={t("admin.searchPlaceholder")}
                  onChange={(event) => setDraft((prev) => ({ ...prev, q: event.target.value }))}
                />
              </div>
              <div>
                <select
                  value={draft.status}
                  onChange={(event) =>
                    setDraft((prev) => ({
                      ...prev,
                      status: event.target.value as SessionStatusFilter,
                    }))
                  }
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {status === "all"
                        ? t("admin.status.all")
                        : t(`admin.status.${status}` as const)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Input
                  type="datetime-local"
                  value={draft.from}
                  onChange={(event) => setDraft((prev) => ({ ...prev, from: event.target.value }))}
                  aria-label={t("admin.from")}
                />
              </div>
              <div>
                <Input
                  type="datetime-local"
                  value={draft.to}
                  onChange={(event) => setDraft((prev) => ({ ...prev, to: event.target.value }))}
                  aria-label={t("admin.to")}
                />
              </div>
              <div className="md:col-span-5">
                <Button type="submit" disabled={isListLoading}>
                  {t("admin.applyFilters")}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Card>
            <CardHeader>
              <CardTitle>{t("admin.sessionListTitle")}</CardTitle>
              <CardDescription>{t("admin.sessionListMeta", { total })}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {listError ? <p className="text-sm text-destructive">{listError}</p> : null}
              {isListLoading ? (
                <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
              ) : sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("admin.noSessions")}</p>
              ) : (
                <div className="space-y-2">
                  {sessions.map((session) => {
                    const isActive = session.sessionId === selectedSessionId;
                    return (
                      <button
                        key={session.sessionId}
                        type="button"
                        onClick={() => setSelectedSessionId(session.sessionId)}
                        className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
                          isActive
                            ? "border-primary bg-primary/5"
                            : "border-border hover:bg-accent hover:text-accent-foreground"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-medium text-foreground">
                            {session.meetingTitle || t("meeting.untitled")}
                          </p>
                          <span className="text-xs text-muted-foreground">
                            {t(`admin.status.${session.status}` as const)}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{session.sessionId}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {session.ownerEmail || t("admin.unassignedOwner")}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatDateTime(
                            session.startedAt ?? session.meetingCreatedAt,
                            t("common.unknown"),
                          )}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex items-center justify-between border-t border-border pt-3">
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  disabled={!hasPrevious || isListLoading}
                  onClick={() => setPage((prev) => Math.max(0, prev - 1))}
                >
                  {t("admin.previous")}
                </Button>
                <p className="text-xs text-muted-foreground">
                  {t("admin.page", { current: page + 1, total: totalPages })}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  disabled={!hasNext || isListLoading}
                  onClick={() => setPage((prev) => prev + 1)}
                >
                  {t("admin.next")}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("admin.sessionDetailTitle")}</CardTitle>
              <CardDescription>{t("admin.sessionDetailDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {isDetailLoading ? (
                <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
              ) : detailError ? (
                <p className="text-sm text-destructive">{detailError}</p>
              ) : !detail ? (
                <p className="text-sm text-muted-foreground">{t("admin.selectSessionPrompt")}</p>
              ) : (
                <div className="space-y-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">{t("admin.labels.sessionId")}</p>
                    <p className="break-all font-mono">{detail.sessionId}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">{t("admin.labels.meetingId")}</p>
                    <p className="break-all font-mono">{detail.meetingId}</p>
                  </div>
                  {canDownloadReport ? (
                    <div>
                      <Button
                        variant="outline"
                        size="sm"
                        type="button"
                        onClick={handleDownloadReport}
                      >
                        {t("report.download")}
                      </Button>
                    </div>
                  ) : null}
                  <div>
                    <p className="text-muted-foreground">{t("admin.labels.owner")}</p>
                    <p>{detail.ownerEmail || t("admin.unassignedOwner")}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-muted-foreground">{t("admin.labels.startedAt")}</p>
                      <p>{formatDateTime(detail.startedAt, t("common.unknown"))}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">{t("admin.labels.endedAt")}</p>
                      <p>{formatDateTime(detail.endedAt, t("admin.notEnded"))}</p>
                    </div>
                  </div>
                  <div className="rounded-md border border-border p-3">
                    <p className="mb-2 text-sm font-medium">{t("admin.countsTitle")}</p>
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      <li>
                        {t("admin.counts.transcripts", { count: detail.counts.transcriptSegments })}
                      </li>
                      <li>{t("admin.counts.analyses", { count: detail.counts.analyses })}</li>
                      <li>{t("admin.counts.images", { count: detail.counts.images })}</li>
                      <li>{t("admin.counts.captures", { count: detail.counts.captures })}</li>
                      <li>{t("admin.counts.audio", { count: detail.counts.audioRecordings })}</li>
                    </ul>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
