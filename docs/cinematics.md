# OP・ED映像

2026-10-18にユーザーのDownloadsの最新3本を取り込みました。元ファイルは変更せず、公開用に意味の明確な名前で配置しています。

| 状況 | 元ファイル | 公開パス | 長さ |
| --- | --- | --- | --- |
| ゲーム開始前 | op.mp4 | /video/op.mp4 | 6.048秒 |
| プレイヤーの干渉勝利（AIが脱出できない） | 逃げ切れなかったed.mp4 | /video/contained.mp4 | 6.080秒 |
| AIの脱出成功によるプレイヤー敗北 | 逃げ切れたed.mp4 | /video/escaped.mp4 | 6.080秒 |

3本とも1280×720・60fps、H.264 High / yuv420p、AAC-LCステレオ44.1kHzのMP4です。各約5MBで再圧縮せず収録しました。結果の意味はプレイヤー視点で対応付けています。

## ブラウザーAPIの確認

実装前に最新のMDNを確認しました。`HTMLMediaElement.play()`は非同期で成功・失敗が返り、スクリプト起点の再生は自動再生ポリシーで拒否される場合があります。拒否時には再生操作を提示します。`ended`を動画自身で監視して閉じ、ループ再生はしません。

ブラウザーのFullscreen APIには一時的なユーザー操作が必要です。クリック起点のOPで要求できても、ゲーム結果から自動起動するEDで新しく要求できる保証はありません。そのため常に画面全体を覆う黒い映像レイヤーを表示し、既存のゲーム全画面状態でも同じレイヤーを使います。動画は比率を維持して全体を表示します。

- [MDN: HTMLMediaElement.play](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play)
- [MDN: HTMLMediaElement ended event](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/ended_event)
- [MDN: Element.requestFullscreen](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen)

## ファイルのSHA-256

- contained.mp4: `351d1eda48b2fdd43a45f785b25f334f61bdb58c50d80be550ab2db4deb6437d`
- escaped.mp4: `65091c5659d91601d4a26c5143fadab650032b43299e15159cc4c82980fe3261`
- op.mp4: `98094dfe3153b9aff315e96bd98f90ce0e5aad262b4f4919d2af27c4cc58ff22`

## 動作確認（2026-10-18）

- Vivaldiのローカル実画面で開始をクリックし、ブラウザーFullscreenに入ってOPを再生。自然終了後に映像とFullscreenが閉じ、ゲームを開始しました。
- 同一originの1920×1080 QAフレームで、実ゲームの時計だけを加速し、seed 1の無干渉プレイで脱出敗北ED、干渉6回・恐怖100で勝利EDを確認。MP4自体は通常速度で再生し、3本とも自然終了を確認しました。ED中は結果dialogを開かず、終了後に結果を表示します。このローカルQAはモデル通信の検証とは別です。
- OP中に5秒分のゲームtickを渡しても残り時間03:00を維持し、映像レイヤーは1920×1080、object-fitはcontain、背景はinertでした。
- キー操作の抑止、非表示時の動画停止と復帰再生、Escapeスキップ、リセット後の遅延開始防止、破棄時の映像・DOM解放を確認しました。
- 自動再生拒否をQA内で再現し、再生ボタンから再開できること、存在しない動画のエラー表示とスキップで復帰できることを確認しました。
- コピーした3本は元ファイルとSHA-256一致。既存の自動テスト80件が成功しています。
