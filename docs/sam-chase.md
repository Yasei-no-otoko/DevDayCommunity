# サム・アルトマンと追尾キャラクター

2026-10-18の[BLACKSITE 開発ノート](https://chatgpt.com/space/page_6ad364e1b6988191bc1b900799453a36)とユーザーの指示を反映した、現行の施設マップ・4干渉版の実装記録です。提出の作業締め切りは同日17:15 JSTです。

## 遊びの流れ

- 人間は建物に棲む怪異として、AIが操作するサム・アルトマンの脱出を妨害します。サムの鍵→電源→出口の目標と、恐怖100または180秒の勝利条件を維持します。
- サムは左下の受付、ぬこぬこさんは反対側の研究室から開始します。キラーは接続された部屋を追尾します。移動はサムより遅く、接触時の恐怖は+5、再接触は12秒間隔です。
- 初遭遇時だけ、進行中の探索・電源復旧・解錠・深呼吸を中断します。移動中の行動は継続し、再遭遇では恐怖の増加だけを適用します。
- サムがキラーを初めて認識するまでは、その位置を回避判断に使用しません。遭遇後は相手の在室・移動先に経路コストを加え、同室から合法に退避できる場合は退避を優先します。取得目標自体は維持します。
- Tiboは最初の18〜30秒、その後24〜42秒のランダムな間隔で登場します。4種類のクールダウンだけを解除します。エネルギー、進行、ロック、干渉効果、取得物は戻しません。
- 最初の有効干渉から短い間を置き、中央マップだけを3.6秒の監視カメラ演出へ切り替えます。実際の部屋・妨害・時刻を返します。固定台詞は施設演出と表示し、APIによる選択・方針・ログに混ぜません。

## 状態とAPIの境界

`simulation.ts`が追尾・遭遇・乱数・Tiboの時刻を所有し、`main.ts`が表示とモデル通信を担当します。通常の初期化とリセットでは`crypto.getRandomValues`のseedを渡し、テストでは`createState(seed)`を固定します。乱数はフレームごとに引かず、出現イベントの境界で次の時刻を決めます。

初遭遇前のAPI snapshotには`knownKiller`キー自体を作りません。初期の施設説明も追尾ルールだけを渡し、キラーの初期位置を渡しません。`recentActions`はサム自身の選択行動へ絞り、systemログや初期planからの位置漏れを防ぎます。初遭遇後だけ、相手の現在室・移動先・遭遇回数・遭遇時刻を渡します。

監視カメラはシミュレーションと独立した状態です。表示中はゲーム時間と新しいDecisions要求を止め、ユーザーの一時停止を上書きしません。API待ち・モーダル・非表示タブ中は開始を待ち、保留した判断は再開時に一度だけ適用します。リセット後の古い応答は世代番号で無効にします。Tiboの通知はカメラ等に隠れていた時間を寿命に含めません。

## 2D素材

全てbuilt-in `image_gen`で生成し、sharpでWebPに変換しました。監視カメラ以外の5枚は透過を保持しています。ぬこぬこさんとTiboには、ユーザーがこの作業で提供した2枚を外見の参照として使用しました。参照原画は読み取りだけに使い、リポジトリや公開配信物へコピーしていません。マップ上では上から見たサムとぬこぬこさんを表示します。

| ファイル | 用途 | 寸法 | サイズ |
| --- | --- | --- | --- |
| [sam-altman.webp](../public/sam-altman.webp) | サムの全身・左のポートレート | 1024×1536 | 72,360 bytes |
| [sam-camera.webp](../public/sam-camera.webp) | 同じ2D人物の監視カメラ | 1280×720 | 60,622 bytes |
| [nuko-nuko.webp](../public/nuko-nuko.webp) | 参照画像を反映したぬこぬこさんの全身 | 1024×1536 | 128,874 bytes |
| [tibo.webp](../public/tibo.webp) | 参照写真を反映したTiboの支援登場 | 1024×1536 | 82,112 bytes |
| [sam-map.webp](../public/sam-map.webp) | サムの俯瞰マップ用・右下へ歩行 | 1024×1024 | 53,704 bytes |
| [nuko-map.webp](../public/nuko-map.webp) | ぬこぬこさんの俯瞰マップ用・左下へ追跡 | 1024×1024 | 120,746 bytes |

生成プロンプトのbrief:

1. **Sam**: recognizable 2D stylized illustration of Sam Altman, complete full body, short brown hair, navy crewneck and jacket, slightly worried expression, crisp adventure-game cel shading, transparent background, no text or logos.
2. **Sam camera**: use the full-body Sam image as an identity reference; same illustrated character looking directly at the viewer in a green monochrome hospital CCTV frame, readable midtones, quiet recognition, 16:9, lower quarter quiet for UI, no text, HUD or gore.
3. **ぬこぬこさん**: use the provided catgirl illustration as the identity reference; adult anime game avatar, long brown hair, golden eyes, brown cat ears and tail, gold medallion, modest black-and-gold gothic coat dress, complete full body and boots with transparent padding, playful expression, no text or gore.
4. **Tibo**: use the provided portrait photo as the identity reference; friendly 2D adult developer, short dark hair, strong eyebrows, clean-shaven smiling face, black hoodie and trousers, glowing cyan reset-clock motif, complete full body with transparent padding, no text or logos.
5. **Sam map**: use the generated Sam full body as the outfit and identity reference; compact 2D game sprite viewed from a high overhead angle of about 65 degrees, walking diagonally down-right, visible crown and shoulders with foreshortened body, readable silhouette at small size, complete body on a square transparent canvas, no text or ground plane.
6. **ぬこぬこさん map**: use the provided catgirl image as the identity reference; retain brown hair, golden eyes, cat ears, tail and black-gold outfit, compact chase pose viewed from the same high overhead angle, facing diagonally down-left, complete body on a square transparent canvas, no text or ground plane.

## SDK参照

Phaserのバージョン指定なしの最新資料は4.1.0ですが、本プロジェクトは3.90.0を維持します。[Image](https://docs.phaser.io/api-documentation/3.90.0/class/gameobjects-image)と[LoaderPlugin](https://docs.phaser.io/api-documentation/3.90.0/class/loader-loaderplugin)の版別資料でpreload→create、textureの確認、静止画の表示を確認しました。画像が読み込めない場合は既存の図形表示を使います。部屋選択のzoneとNPC画像は分離し、NPC自体は入力を奪いません。

## 検証

- `npm test`: 50件成功（simulation 27、API 11、Worker API 12）。追尾、初遭遇だけの中断、seed固定、Tiboのcooldown-only reset、フレーム幅の違いを含みます。
- `npm run build`: TypeScriptとVinextの全環境が成功。新しい6画像がclient配信物に含まれ、旧ELIAS画像を削除しています。
- ブラウザの手動フレーム試験で、cameraの停止・フォーカス・一度だけの発火、pause/reset/非表示タブ、Tibo通知の表示寿命を確認しました。最終UIでcameraとTiboを表示し、エラーは0件です。
- 遅延したモックAPIによる8条件の境界試験と、初遭遇前の位置非送信・自身の行動だけの履歴・遭遇後の位置送信と合法退避を確認しました。実モデルの行動品質や本番通信を示す結果ではありません。
- 新しいマップ素材・右列の対象選択・2×2アイコンUIは[レイアウトQA](projector-layout.md)を参照してください。初見の人による面白さの評価は未実施です。
