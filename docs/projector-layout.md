# プロジェクター向け1画面レイアウト

BLACKSITEの監視画面を、16:9のプロジェクター表示で必要な情報が見渡せる構成にするための実装メモです。基準解像度は1920×1080と1280×720です。UIの文字を一律に縮小せず、CSS Gridで情報の優先順位を保ちます。

## 画面構成

- ヘッダーにタイトル、残り時間、干渉回数、開始・リセット、対戦モード、API詳細、音、ヘルプ、全画面操作を置きます。
- ヘッダー直下のbriefingで、プレイヤーの役割、勝利条件、操作、敗北条件を短く案内します。
- メインのconsoleは3列です。左にサム・アルトマンの状態・恐怖・目標、中央に施設マップ、右に部屋選択・追跡・対象、エネルギー、4つの干渉操作を置きます。干渉は大きなアイコンを中心とした2×2配置です。
- 最新ログはconsole下部のevent-consoleに表示し、全ログはダイアログに展開します。
- API詳細、選択行動の説明全文、ログ、結果、ヘルプは`<dialog>`で表示します。ダイアログを開いた間は実験を一時停止し、閉じた後は起動元へフォーカスを戻す設計です。
- 1150px以下はマップを先頭に置く縦スクロールの簡易表示へ切り替え、650px以下は1列に積みます。プロジェクター向けの全項目同時表示は16:9のデスクトップ表示を対象にし、狭い画面では操作可能性と文字サイズを優先します。

実装の対応箇所は`src/main.ts`（DOM、ダイアログ、Fullscreen）、`src/style.css`（3列配置と画面幅別レイアウト）、`src/facility.ts`（Phaserの施設canvas、追従ラベル）です。

## Phaser Scale Manager

この画面の施設描画はPhaser 3.90.0です。現状のゲーム座標は1000×680で、部屋・経路・背景テクスチャもこの座標系を使います。

2026-10-18時点でバージョン指定のないPhaser API資料は4.1.0を示すため、実装判断には3.90.0の版別資料と導入済みソースを使用します。新しい描画APIへの移行はせず、移動先の補助線にも既存の`Graphics.lineBetween`と`strokeCircle`を使います。

- `Phaser.Scale.FIT`はゲームの論理サイズを保ち、親要素の中にアスペクト比を保ってcanvasを表示します。マップ内の描画座標を変えずに表示領域へ収める現在の構成に適しています。
- `Phaser.Scale.RESIZE`はcanvasとゲームサイズを親領域まで広げ、親の縦横比にも合わせます。既存の固定座標や1000×680の背景テクスチャにそのまま適用すると、描画や入力領域の再設計が必要です。
- 親要素にはサイズを明示します。現在のCSSのようにcanvas自体の`width`と`height`を`!important`で固定すると、FITが設定する表示寸法に干渉するため使いません。
- ウィンドウ変更以外にCSS GridやFullscreenで親要素が変わる場合は、親を監視する`ResizeObserver`から`game.scale.getParentBounds()`、`game.scale.refresh()`の順で呼び、FITの再計算後にDOMラベルを再配置します。Phaser 3.90.0の`refresh()`は既存の`parentSize`から表示寸法を計算するため、親寸法の採取を先行させます。RESIZEイベントでも表示ラベルの位置を同期し、破棄時はobserverとイベントを解除します。

Phaserの公式資料では、FITがcanvasのCSS寸法を使って表示を調整すること、RESIZEがcanvas自体を親領域へ拡大すること、canvas親の寸法がスケーリングに影響することを説明しています。スケーリングモード利用時の論理ゲームサイズ変更には`setGameSize`、canvasを直接変更する`resize`はNONE用とされています。

## Fullscreen API

Fullscreenボタンのクリック処理から`root.requestFullscreen()`を呼びます。Fullscreen開始はユーザー操作に伴う一時的なアクティベーションが必要なので、自動起動や遅延処理から要求しません。Promiseのrejectを捕捉し、開始できない場合に画面内メッセージを出します。

`document.fullscreenchange`で状態を再読込し、`document.fullscreenElement === root`を基準にボタンのラベルと`aria-pressed`を同期します。EscキーでブラウザがFullscreenを解除した場合も同じイベントで表示を戻せます。終了要求もPromiseの失敗を捕捉します。

## 公式資料

- [Phaser 3.90.0 ScaleManager API](https://docs.phaser.io/api-documentation/3.90.0/class/scale-scalemanager) — FIT/RESIZEの説明、親要素の寸法、`refresh`、`setGameSize`、`resize`。
- [Phaser Scale Manager概念ガイド](https://docs.phaser.io/phaser/concepts/scale-manager) — 親要素とcanvas表示寸法、scale modeの概要。
- [MDN: Element.requestFullscreen()](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen) — transient user activation、Promiseによる成功・失敗、`fullscreenchange`による状態検出。
- [MDN: Document.fullscreenchange event](https://developer.mozilla.org/en-US/docs/Web/API/Document/fullscreenchange_event) — Fullscreen状態が変わった際のイベント。

## 初期プロジェクター版のQA記録（2026-10-18、公開version 4）

- **1280×720**: Vivaldiの実表示領域で、ページ寸法も1280×720。主要操作、4つの干渉、恐怖・エネルギー、判断、3目標、最新ログについて、viewport外や親要素によるclipは0件。全画面のスクリーンショットでも確認しました。
- **1920×1080**: 同一originのiframeをこのCSS viewportに設定して測定。ページ寸法も1920×1080、主要UIの欠け0件。OSの実ウィンドウは高さ985pxに制限されるため、1080pxでの配置確認にはiframeを使いました。
- **マップ**: 1920×1080→390×844→1280×720の変更で、canvasは1000:680の縦横比と親内のFIT寸法を維持。7部屋すべてのcanvas上のクリック位置が対応する選択値へ変わることを確認しました。
- **詳細表示**: API、判断全文、全記録、ヘルプは720p内に収まり、通常内容で内部スクロールなし。長いRequest IDとエラーを入れた場合も横はみ出しなしで、ダイアログ内のみ縦スクロールします。閉じる操作後の起動ボタンへのフォーカス復帰、停止維持、モーダル中の1・R・Spaceのゲーム操作抑止を確認しました。
- **結果**: ローカル試遊をQA用フレーム加速で脱出まで進め、1080pと720pの結果・統計・再挑戦がダイアログ内に収まることを確認しました。これはAPI実通信の試験ではありません。
- **390×844**: iframeで縦スクロール表示、横はみ出し0件、表示中の操作対象は44px以上。スマートフォン実機は未確認です。
- **Fullscreen**: ユーザー操作なしの開始要求が拒否された際の説明表示を確認。開始・Esc解除の実キー操作はブラウザ操作環境のフォーカスを確定できず未確認です。状態同期と失敗処理はコードレビューしました。
- **回帰確認**: `npm test`で33件通過、`npm run build`成功、`git diff --check`成功。ゲームルールとAPIサーバーの変更はありません。

## サム・追尾・アイコンUI版のQA記録（2026-10-18）

- 部屋選択・追跡を右列へ移し、中央の部屋選択行をマップへ返しました。1280×720でマップ親は718×424、canvasは623.52×424です。従来のcanvas 532.35×362から面積は約37%増えました。ボタンは各124×137で、コスト・持続・CD・状態を表示し、効果の全文をtitleとaria-labelにも保持します。
- 1280×720の実ウィンドウと1920×1080のiframeで主要UIのviewport外・親clipは0件。1080pではcanvas 1026.47×698です。canvasとHTMLラベルの位置差は1px未満です。
- 新しい俯瞰スプライトを表示した状態で7部屋すべてのcanvasクリックが選択値へ反映しました。画像やラベルが入力を奪いません。API・判断全文・全記録・ヘルプの各dialogは720p内に収まり、横はみ出しはありません。
- 390×844のiframeで横はみ出し0件、表示中の操作対象は全て44px以上。スマートフォン実機とFullscreen開始・実キーEsc解除は未検証です。
- モックしたAPIで停止中の応答保留、再開時の1回適用、camera中の時間・新規要求停止、reset後の遅延応答破棄を8条件で再確認。これは本番モデル通信の検証とは区別します。
- 隠れ場所と大型Tibo追加後も720p/1080pの主要UI欠けは0件です。Tibo cut-inは各251.30×320、400×470でマップ内に収まり、表示中もゲームは進行します。病棟の「隠れ場所」とサムの隠れ中表示、怪異で追い出した際のフィードバックを確認しました。最終のテストは55件成功、ビルド成功です。

## VILLAGEを参考にした配色（2026-10-18）

1画面の配置・寸法・操作は維持し、冷たいグラファイト、温かいアイボリー、控えめな真鍮色、危険を示す赤へ変更しました。タイトルにはローカルのセリフ体、パネルには細い灰色の罫線を使います。参照画像はゲーム内素材として再配布していません。

- 参照: [Game UI Database: Resident Evil Village](https://www.gameuidatabase.com/gameData.php?id=780)、[Capcom公式マニュアルのタイトル画面](https://game.capcom.com/manual/village/locale/ja/ps4/page/11_1_1.jpg)、[所持品画面](https://game.capcom.com/manual/village/locale/ja/page/41_2_1.jpg)。
- 施設背景は生成時に一度だけピクセルの彩度を調整します。[Canvas filter](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/filter)はブラウザー互換性に制限があるため使わず、毎フレームの画像処理も避けます。動く人物・選択表示は別に描画します。
- 1280×720の実ブラウザーでページ寸法も1280×720、ヘッダーと3列の主要パネルが画面内に収まることを確認しました。
