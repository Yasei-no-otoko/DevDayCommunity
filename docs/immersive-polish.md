# BLACKSITE: 既存ゲームを保った没入演出

## 公開担当への引き継ぎ

作業ブランチは `codex/immersive-polish`。作業開始後に更新されたmainの `541a1d9890568a2516de29f971f57f1dd8a3b239`（CC0音声と扉封鎖・接触捕獲ルール）を取り込みました。以下はこの最新版mainに対して追加する映像演出です。

この変更を取り込んで既存Siteへ通常のビルド・公開を行ってください。`.openai/hosting.json` の既存project_id・公開範囲・秘密設定を維持します。このチャットのSites接続では既存project_idが「見つからない」と返ったため、公開操作は行っていません。ユーザーは別チャット／担当者が公開すると確認済みです。

導入に使う `public/blacksite-opening-frame.png` は既にmainにある画像を再利用しました。新規素材は `public/sam-camera-immersive.webp` の1枚です。

## 変更する体験

- 待機中のマップに廃病院の導入写真と「彼は、まだ知らない。あなたが、この病院だ。」を表示します。音あり／音なしのどちらでも直接開始でき、既存の上部開始ボタンも使えます。強制的な映像待ちは追加していません。
- サムの位置を追う減光と監視モニターの縁・走査線を追加します。部屋名と選択・移動先のラベルは減光の上に残し、入力領域は変えません。
- 現在の状況に応じた短い字幕を「施設演出」と明示します。干渉した部屋、隠れる、移動、電源操作などに対応します。モデルの発話や内部思考として扱わず、APIや判断ログには送りません。
- 最初の干渉から1.7秒後、3.6秒の監視カメラ演出が出る既存タイミングを維持します。実写調の画像、静かな寄り、実際に操作した部屋名を返す台詞に変更します。Esc／ボタンで閉じられます。映像中のゲーム停止と停止中の応答保留は既存処理を使用します。
- 最新mainのCC0音声モジュールをそのまま使います。導入の音あり／音なしボタンも同じモジュールへ接続します。音源・音声モジュール・再生の停止条件はこのPRでは変更しません。
- カメラや導入のボタン操作が背後のPhaserの部屋選択に伝わらないようガードを追加します。カメラを閉じた後に追跡ONが維持されることを確認しました。

右上の目のアイコンで映像演出をオフにすると、従来のマップ表示とイラストの監視映像に戻せます。音は隣のボタンで独立して操作します。`prefers-reduced-motion` では新しいズームと導入のフェードを無効にします。

## 維持した境界

最新mainに対して `src/simulation.ts`、`src/audio.ts`、`server/`、`app/`、`.openai/hosting.json` は変更していません。勝敗・接触捕獲・扉封鎖・恐怖・エネルギー・CD・追尾・Tiboの効果と出現時刻・API契約は元のままです。レイアウトの列数や4つの干渉ボタンの配置も維持します。

## 検証

- `npm test`: 67件成功。最新mainの64件と、字幕によるゲーム状態非改変・接触捕獲を通した状態非改変・終了後の演出切替を確認する3件です。
- `npm run build`: TypeScriptとVinextの全環境が成功。
- 1280×720のブラウザ表示で、ページ寸法は1280×720、表示中の操作要素の画面外は0件。導入画像・監視画像の読み込み、導入コピーのマップ内への収まりを確認しました。
- 1920×1080でもページが1画面に収まり、表示中の操作要素の画面外は0件。390×844では既存の縦スクロール表示を維持し、横にはみ出す操作要素は0件、導入の文章と開始ボタンはマップ内に収まりました。
- ブラウザの実操作で音あり開始、扉の封鎖、操作した部屋名を返す監視映像、映像中の一時停止、固定された残り時間、映像からの復帰と追跡ON維持、囁きに対応した字幕、ヘルプによる一時停止を確認しました。フレーム更新・API応答の差し替えは行っていません。
- 演出オン／オフも切り替えました。最新ルール統合後のプレイ結果はPRの検証欄に記録します。
- 音を有効にした待機状態から「音なしで開始」を押した際に、音設定がオフへ変わることを確認しました。最終確認時のブラウザコンソールに警告・エラーはありませんでした。
- Safariで導入の表示と音ありでの動作を確認。音の聞こえ方の主観評価は未実施です。Safariの自動操作からFullscreen要求は拒否され、既存の失敗案内が出ました。Fullscreenの成功は未確認です。
- 今回の変更を入れた実API通信と本番Siteの反映は未確認です。サーバー側のAPIテスト結果を実モデルの動作確認とは扱いません。
- 面白さ・怖さ・審査での評価は未検証です。見た目と操作の成立は、初見の人が怖がる証拠とは区別します。

## 最初の30秒で見せる

1. 導入写真の状態で「AIが逃げる。あなたは病院そのもの」と役割を一言で伝える。
2. 実APIを見せる場合は、サインインと接続可能表示を先に確認してモードを選ぶ。音ありで開始し、Agentsの方針を見せる。
3. 追跡ONで移動先を封鎖する。経路が変わる様子とDecisionsによる次の行動を見せる。
4. サムがカメラを見て、直前の操作を返す。「ここは施設演出。判断は実API」と区別する。

API待ちや失敗は表示したまま説明してください。ローカル体験はサインイン不要の試遊であり、実APIの証拠にはしません。

## 新規監視画像の制作記録

内蔵 `image_gen` を使用。既存の `public/blacksite-opening-frame.png` を人物・衣装・病院・照明の参照とし、PNG生成後にsharpで幅1280px・品質86のWebPへ最適化しました。既存の `sam-camera.webp` は映像演出オフ時と画像読み込み失敗時のフォールバックに残しています。

生成プロンプト:

```text
Use case: identity-preserve. Asset type: a single cinematic CCTV shot for the fictional BLACKSITE horror browser game, wide 16:9. The provided image is an identity, wardrobe, lighting and hospital reference. Create a new camera shot of the SAME recognizable Sam Altman in the SAME abandoned hospital. He has removed the blindfold; no cloth remains on his face. Medium close shot from the chest up, shoulders slightly angled but eyes looking directly into the lens, as though he has just noticed the person operating the camera. His expression is quietly alert and unsettled, not exaggerated fear, not a smile. Preserve his recognizable face, short brown hair, navy crewneck and dark jacket. The face should sit in the upper central half, eyes at about 30 percent image height; leave the lower quarter dark and visually quiet for game subtitles. Behind him the hospital corridor recedes into blackness, one frosted door and a weak distant fluorescent light. Realistic psychological-horror film still, desaturated green-gray and cold blacks, natural skin, soft readable midtones on his eyes, restrained analog grain, beautiful unsettling cinematography. Match the reference's realistic photographic style. No anime, no cartoon, no stylization into illustration, no HUD, no text, no timestamp, no borders, no watermark. One adult character only, no other people, no gore or wounds, no weapons. Wide landscape full bleed.
```
