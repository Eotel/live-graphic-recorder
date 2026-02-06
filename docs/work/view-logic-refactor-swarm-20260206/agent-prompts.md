# Agent別プロンプト

## A01 / T01

```text
あなたは Coverage Swarm の Agent A01 です。
Task ID: T01
依存: なし
対象ソース: src/app/view-model/app-store.ts
主テストファイル: src/app/view-model/app-store.test.ts

要件:
1. createAppStore() を公開する
2. state に auth, meeting, recording, media, upload, ui, derived を定義する
3. actions に initialize/selectMeeting/createMeeting/startRecording/stopRecording/logout/downloadReport/refreshMeetings/togglePaneMode を定義する

実行:
- bun run typecheck

進捗更新:
- docs/work/.../progress.md の自分のセクション
```

## A02 / T02

```text
あなたは Coverage Swarm の Agent A02 です。
Task ID: T02
依存: T01
対象ソース: src/app/usecases
主テストファイル: src/app/usecases/usecases.test.ts

要件:
1. createMeetingUsecase/selectMeetingUsecase/recordingLifecycleUsecase/logoutUsecase/downloadReportUsecase を作成
2. 既存 logic/controller 型を壊さない
3. 副作用実行は関数注入でテスト可能にする

実行:
- bun run typecheck

進捗更新:
- docs/work/.../progress.md の自分のセクション
```

## A03 / T03

```text
あなたは Coverage Swarm の Agent A03 です。
Task ID: T03
依存: T01, T02
対象ソース: src/app/container/AppShell.tsx
主テストファイル: src/App.tsx

要件:
1. src/App.tsx を 200 行以下にする
2. UI 挙動は現行維持
3. 既存 hook/controller を再利用する

実行:
- bun run typecheck

進捗更新:
- docs/work/.../progress.md の自分のセクション
```

## A04 / T04

```text
あなたは Coverage Swarm の Agent A04 です。
Task ID: T04
依存: T03
対象ソース: src/components/navigation/MeetingHeader.tsx
主テストファイル: src/components/navigation/MeetingHeader.test.tsx

要件:
1. UI コンポーネントはイベント発火のみを担う
2. hasUnsavedRecording に依存しない
3. 既存編集 UI 動作は維持

実行:
- bun test src/components/navigation/MeetingHeader.test.tsx

進捗更新:
- docs/work/.../progress.md の自分のセクション
```

## A05 / T05

```text
あなたは Coverage Swarm の Agent A05 です。
Task ID: T05
依存: なし
対象ソース: src/hooks/useAttachMediaStream.ts
主テストファイル: src/hooks/useMediaStreamController.test.ts

要件:
1. useAttachMediaStream(videoRef, stream) を追加
2. useMediaStreamController から view 寄り責務を分離
3. 既存の permission/device 切替挙動を壊さない

実行:
- bun test src/hooks/useMediaStreamController.test.ts

進捗更新:
- docs/work/.../progress.md の自分のセクション
```

## A06 / T06

```text
あなたは Coverage Swarm の Agent A06 です。
Task ID: T06
依存: T01, T02
対象ソース: src/hooks/useMeetingSession.ts
主テストファイル: src/hooks/useMeetingSession.test.ts

要件:
1. deprecation コメントを追加
2. 既存返却 shape を維持
3. 将来の app-store 委譲に向けた移行コメントを明示

実行:
- bun test src/hooks/useMeetingSession.test.ts

進捗更新:
- docs/work/.../progress.md の自分のセクション
```
