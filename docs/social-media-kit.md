# BLACKSITE SNS投稿素材（2026-10-20）

公開版の実APIモードを操作して収録したプレイ抜粋です。映像は待ち時間を編集し、横長版と縦長版で表示範囲を変えています。

公開URL: https://blacksite-escape-experiment.yasei-no-otoko.chatgpt.site

## 素材

| 媒体 | ファイル | 書き出し |
| --- | --- | --- |
| YouTube | `blacksite-youtube.mp4` | 1920×1080、50秒、30fps |
| Instagram Reels | `blacksite-instagram.mp4` | 1080×1920、28秒、30fps |
| Facebook | `blacksite-facebook.png` | 1920×1080、実際の対戦画面 |
| LinkedIn | `blacksite-linkedin.png` | 1920×1080、実APIの脱出方針と行動の説明 |

動画はMP4 / H.264 / yuv420p、音声はAAC / 48kHz stereoを使用します。音声はゲーム同梱のCC0環境音・効果音から再編集し、マイクや会議の音声は収録していません。素材はこのチャットに添付したローカル書き出しフォルダーに保存します。

## Facebook 投稿文

逃げるAIを、怪異になって閉じ込める。

ブラウザーゲーム「BLACKSITE — The Escape Experiment」を作りました。
AIエージェントは、鍵と非常用電源を探して出口へ。プレイヤーは施設に棲む怪異として、停電・扉の封鎖・囁き・怪異でその脱出を妨害します。

移動先の扉を閉じるか、先回りして仕掛けるか。部屋とタイミングを選ぶゲームです。

ローカル体験はサインインせずに遊べます。実APIモードはChatGPTへのサインインが必要です。
遊んでみてください。
https://blacksite-escape-experiment.yasei-no-otoko.chatgpt.site

#BLACKSITE #ブラウザゲーム #ゲーム開発

## LinkedIn 投稿文

AIエージェントの脱出を、プレイヤーが怪異となって妨害するブラウザーゲーム「BLACKSITE — The Escape Experiment」を作りました。

脱出を目指すAIに対して、停電や扉の封鎖などで状況を変えます。鍵・電源・出口という明確な目標の中で、状況への干渉と次の行動をゲームとして見せる実験です。

実装では、Agents APIによる脱出方針の生成と、Decisions APIによる行動の選択を分けています。選ばれた行動はゲームのルールで検証して適用します。

ローカル体験はサインイン不要。実APIモードはChatGPTへのサインインが必要です。
https://blacksite-escape-experiment.yasei-no-otoko.chatgpt.site

#AIエージェント #ゲーム開発 #BLACKSITE

## YouTube

タイトル: 逃げるAIを、怪異になって閉じ込める。BLACKSITE

あなたは施設に棲む怪異。AIエージェントの脱出を、停電・扉の封鎖・囁き・怪異で妨害するブラウザーゲーム「BLACKSITE」を作りました。

AIは鍵と非常用電源を確保して出口へ。こちらは部屋とタイミングを選び、脱出を阻止します。

プレイ：https://blacksite-escape-experiment.yasei-no-otoko.chatgpt.site
ローカル体験はサインイン不要。実APIモードはChatGPTへのサインインが必要です。

#BLACKSITE #ブラウザゲーム #インディーゲーム

映像：公開版実APIモードのプレイ抜粋（待ち時間を編集）。

## Instagram キャプション

AIを逃がすな。あなたは施設に棲む怪異。
停電、扉の封鎖、囁き、怪異で脱出を妨害するブラウザーゲーム「BLACKSITE」を作りました。
鍵と電源を探すAIに、次はどこで仕掛ける？

プレイURL：https://blacksite-escape-experiment.yasei-no-otoko.chatgpt.site
ローカル体験はサインイン不要。実APIモードはChatGPTへのサインインが必要です。
#BLACKSITE #ブラウザゲーム #インディーゲーム #ゲーム開発

映像：公開版実APIモードのプレイ抜粋（待ち時間を編集）。

## 収録と検証

- 収録元は公開コミット `5b5eee58fdd07b7a3e50c006be5f030a5cb94a41`。撮影でゲームのルール・時計・API応答を差し替えていません。
- `npm test`: 105件成功。`npm run build`: 成功。
- 同一公開コミットに対する `npm run test:live` が成功。Samの5回のDecisions適用とプロバイダーセッション削除を確認し、既存ゲートがキーカード取得後の実API追跡・移動中の封鎖・封鎖後の再判断も検証しました。
- 収録後の2026-10-20 14:03 JSTにも `npm run demo:ready` が成功。これは上記公開コミットに対する6時間以内の証跡確認です。この投稿文を記録する文書コミットとは区別します。
- ブラウザーでも実APIモード、脱出方針、扉の封鎖後の解錠行動、移動中断、4つの妨害、キーカード取得後の追跡、一時停止・再開、恐怖100の捕獲結果、最後のリセットを確認しました。
- APIの方針と、選択候補にあらかじめ付けた行動説明を区別しています。後者をAIの内部思考とは表現していません。
- 書き出し検査でH.264 / yuv420p / 30fps、YouTube 1500フレーム・50秒、Reels 840フレーム・28秒、AAC-LC / 48kHz stereoを確認。音声は-18 LUFSで編集し、MP4はfaststart形式です。全フレーム・音声のデコードと代表フレームの字幕・表示範囲を検査しました。

## 書き出し仕様の公式参照

- [YouTube推奨アップロード設定](https://support.google.com/youtube/answer/1722171?hl=en): MP4、H.264、progressive、元のフレームレート、AAC-LC stereo 48kHz。1080p SDR / 30fpsの推奨ビットレートは8Mbps。
- [Meta Reelsガイド](https://www.facebook.com/business/ads/facebook-instagram-reels-ads): 9:16と重要な文字・要素のセーフゾーンを参照。広告向けの推奨を、通常投稿の必須条件とは扱っていません。
- [LinkedIn写真・動画投稿](https://www.linkedin.com/help/linkedin/answer/a527229/share-photos-or-videos?lang=en): 写真は5MB以下、比率3:1〜4:5。今回の16:9画像はこの範囲内です。

## 収録用SDKの確認

ゲーム本体のSDK/APIは変更していません。収録用には、Appleの[ScreenCaptureKit公式サンプル](https://developer.apple.com/documentation/screencapturekit/capturing-screen-content-in-macos)、[単一ウィンドウフィルター](https://developer.apple.com/documentation/screencapturekit/sccontentfilter/init(desktopindependentwindow:))、[SCRecordingOutput](https://developer.apple.com/documentation/screencapturekit/screcordingoutput)を調査しました。macOS 15以降のSCRecordingOutputでファイルへ直接出力でき、対象ウィンドウを限定できます。

この環境ではコマンドラインのSwiftから利用する前にMainActor上でAppKit / NSApplicationを初期化する必要がありました。長尺収録が途中停止したため有効な映像範囲のみを使い、後続はH.264・幅1920pxの短い収録に分割しました。同時に別のキャプチャープロセスを起動した時刻と停止時刻が近接していましたが、因果は未確定です。同時キャプチャーを防ぐロックを加えた手順を再利用用スキルに保存しました。
