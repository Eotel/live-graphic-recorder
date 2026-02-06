## EVAL: pane-expand-popout

Created: 2026-02-06

### Feature Summary

3pane構成（SummaryPanel / CameraPreview / ImageCarousel）の各paneを拡大表示またはpopout（別ウィンドウ化）する機能。
CameraPreviewをpopoutした場合、元画面ではストリームを二重にしないようskeleton表示にする。

### Architecture Notes

- 現在の3pane: SummaryPanel(左) / CameraPreview(右上) / ImageCarousel(右下)
- ResizablePanelGroup で左右分割 → 右パネル内で縦分割
- CameraPreviewは `useMediaStreamController` 経由で `videoRef` にストリームをアタッチ
- popout時は `window.open()` + ストリームの移譲が必要

### Capability Evals

#### Expand (フルスクリーン/最大化)

- [x] **C1**: 各pane（Summary, Camera, Graphics）に拡大ボタンが表示される — `PaneToolbar.test.tsx`, integration C1
- [x] **C2**: 拡大ボタンをクリックすると、該当paneがメインエリア全体を占有する — integration C2 (CSS hidden verification)
- [x] **C3**: 拡大状態から元のレイアウトに戻せる（縮小ボタンまたはEscキー） — integration C3, C4b (Escape key)
- [x] **C4**: 拡大中も他paneのデータ（トランスクリプト、画像生成等）は裏で継続動作する — integration R7 (hidden panes stay mounted, not unmounted)

#### Popout (別ウィンドウ化)

- [x] **C5**: 各paneにpopoutボタンが表示される — `PaneToolbar.test.tsx` (normal mode renders popout button)
- [x] **C6**: popoutボタンをクリックすると、該当paneが新しいブラウザウィンドウで開く — `PopoutPane.test.tsx`, integration C6
- [x] **C7**: CameraPreviewをpopoutした場合、元画面のCameraPreview領域はskeleton表示になる — `PopoutPane.test.tsx` (placeholder), `PaneSkeleton.test.tsx`
- [ ] **C8**: CameraPreviewのpopoutウィンドウにストリームが正常に表示される（二重ストリーム取得なし） — requires manual verification (MediaStream in browser)
- [x] **C9**: popoutウィンドウを閉じると、元画面のpaneが復帰する（skeleton → 通常表示） — integration C7 (beforeunload → closePopout)
- [x] **C10**: SummaryPanel / ImageCarouselのpopoutでも元画面にplaceholder表示がされる — integration C10
- [x] **C11**: popout中も元画面のRecordingControls等は正常に動作する — integration C11 (popup blocker), architectural: panes hidden not unmounted

#### UX

- [x] **C12**: ボタンはpaneヘッダーまたはホバー時にオーバーレイ表示（邪魔にならない配置） — integration C12, PaneToolbar uses group-hover + absolute positioning
- [x] **C13**: popoutウィンドウのサイズはpaneの内容に適したデフォルトサイズが設定される — `usePopoutWindow.test.ts` (default 800x600, configurable width/height)
- [x] **C14**: モバイル表示ではpopoutボタンは非表示（window.openが不適切なため） — integration C13 (hidden md:inline-flex class verified)

### Regression Evals

#### Layout

- [x] **R1**: 通常の3pane表示が既存通りに動作する — integration R1, R2 (backward compatibility)
- [ ] **R2**: ResizablePanelの左右・上下リサイズが正常に動作する — requires manual verification (ResizablePanel interaction)
- [x] **R3**: MainLayoutのmobile/desktop切り替えが正常 — integration R3 (header/footer always visible), MainLayout preserves mobile layout

#### Media Stream

- [ ] **R4**: カメラ/スクリーンの切り替えが拡大・popout中も正常に動作する — requires manual verification (browser MediaStream)
- [ ] **R5**: 録音の開始/停止が拡大・popout中も正常 — requires manual verification (browser MediaRecorder)
- [ ] **R6**: popout後にストリームがリークしていない（MediaStream.getTracks()で確認） — requires manual verification

#### Core Features

- [x] **R7**: トランスクリプトのリアルタイム表示が継続 — integration R7 (hidden panes stay in DOM)
- [x] **R8**: 画像生成とカルーセル表示が継続 — integration R7, R8 (components not unmounted)
- [x] **R9**: レポートダウンロードが正常に動作 — architectural: footer always rendered, no changes to report download logic

### Success Criteria

- pass@3 > 90% for capability evals
- pass^3 = 100% for regression evals

### Implementation Hints

#### Expand approach

- React state `expandedPane: "summary" | "camera" | "graphics" | null` をApp.tsxで管理
- 拡大時は他paneを `display: none` にし、該当paneを `flex-grow: 1` で全領域表示
- ResizablePanelGroupの外にラッパーを追加

#### Popout approach

- `window.open()` で新ウィンドウを開き、React Portalで描画
- CameraPreviewの場合: `videoRef.current.srcObject` をpopoutウィンドウのvideo要素に移譲
  - 元画面の `video.srcObject = null` にしてskeleton表示
  - `beforeunload` イベントでpopoutウィンドウclose検知 → ストリーム復帰
- `useSyncExternalStore` パターンに適合する popout state管理

#### Key risk: CameraPreview stream handoff

- 同一MediaStreamを複数video要素にアタッチすることは可能だが、パフォーマンス懸念
- 推奨: popout時に元画面のvideo.srcObjectをnullにし、popoutのvideoにのみアタッチ
- `useMediaStreamController` の `videoRef` をpopout時に差し替える仕組みが必要
