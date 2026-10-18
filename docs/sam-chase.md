# サム・アルトマンと追尾キャラクター

2026-10-18の[BLACKSITE 開発ノート](https://chatgpt.com/space/page_6ad364e1b6988191bc1b900799453a36)とユーザーの指示を反映した、現行の施設マップ・4干渉版の実装記録です。提出の作業締め切りは同日17:15 JSTです。

## 遊びの流れ

- 人間は建物に棲む怪異として、AIが操作するサム・アルトマンの脱出を妨害します。サムの鍵→電源→出口の目標と、恐怖100または180秒の勝利条件を維持します。
- サムは左下の受付、ぬこぬこさんは反対側の研究室から開始します。キラーは接続された部屋を追尾します。移動はサムより遅く、接触時の恐怖は+5、再接触は12秒間隔です。
- 初遭遇時だけ、進行中の探索・電源復旧・解錠・深呼吸を中断します。移動中の行動は継続し、再遭遇では恐怖の増加だけを適用します。
- サムがキラーを初めて認識するまでは、その位置を回避判断に使用しません。遭遇後は相手の在室・移動先に経路コストを加え、同室から合法に退避できる場合は退避を優先します。取得目標自体は維持します。
- Tiboは最初の18〜30秒、その後24〜42秒のランダムな間隔で登場します。4種類のクールダウンだけを解除します。エネルギー、進行、ロック、干渉効果、取得物は戻しません。
- Tiboはマップ内の大きな上半身カットインで2.6秒表示します。720pでは約251×320pxです。クリックを遮らず、ゲーム時間を止めません。カメラ・モーダル・非表示タブに隠れた時間は表示寿命に含めません。
- 隔離病棟のベッドの陰は隠れ場所です。初遭遇後、サムはここへ避難して14秒隠れます。キラーは研究室側へ離れ、隠れ終わった後も10秒間は追跡を見失います。再使用は開始から42秒後です。ローカルのサムは1回の避難成功後、鍵・電源・出口へ戻ります。
- 病棟に怪異を出すと隠れたサムを追い出し、追跡も再開します。消費済みの隠れ場所の再使用間隔は戻しません。停電や囁きによる恐怖も有効です。
- 最初の有効干渉から短い間を置き、中央マップだけを3.6秒の監視カメラ演出へ切り替えます。実際の部屋・妨害・時刻を返します。固定台詞は施設演出と表示し、APIによる選択・方針・ログに混ぜません。

## 状態とAPIの境界

`simulation.ts`が追尾・遭遇・乱数・Tiboの時刻を所有し、`main.ts`が表示とモデル通信を担当します。通常の初期化とリセットでは`crypto.getRandomValues`のseedを渡し、テストでは`createState(seed)`を固定します。乱数はフレームごとに引かず、出現イベントの境界で次の時刻を決めます。

初遭遇前のAPI snapshotには`knownKiller`キー自体を作りません。初期の施設説明も追尾ルールだけを渡し、キラーの初期位置を渡しません。`recentActions`はサム自身の選択行動へ絞り、systemログや初期planからの位置漏れを防ぎます。初遭遇後だけ、相手の現在室・移動先・遭遇回数・遭遇時刻を渡します。

`hide`は初遭遇後・病棟内・封鎖なし・再使用可能な場合だけ合法です。APIの候補にも同じルールを適用します。snapshotの`hideout`は隠れ中か、候補にあるか、再使用までの残り時間、成功回数、追跡を見失っている残り時間と定数を渡します。Agentsの施設説明と方針依頼にも、病棟へ行く理由とその後の目標復帰を含めます。

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

## オープニング映像の先頭フレーム

2026-10-18の依頼「知らない廃病院の受付で目覚めるサム・アルトマン」を、写実的なホラー映像の最初のカットとしてbuilt-in `image_gen`で生成しました。待合椅子に身体を預けたサム、無人の受付カウンター、暗い廊下を一画面に収め、続く動画で顔を上げて周囲を見回せる構図です。施設と主人公の設定は[BLACKSITE 開発ノート](https://chatgpt.com/space/page_6ad364e1b6988191bc1b900799453a36)を参照しました。

動画制作の入力として、生成時のPNGを無加工で[public/blacksite-opening-frame.png](../public/blacksite-opening-frame.png)に保存しています。1672×941px（約16:9）、2,082,429 bytes、背景不透過です。実画像の目視とPNGのデコードを確認し、元ファイルとのSHA-256一致を確認しました。

検証: 既存55テストと差分の空白チェックが成功しました。追跡中のソースと今回の2ファイルを取り出した環境でWorkerビルドが成功し、配信物のPNGも元データと一致しました。通常の作業ディレクトリでのビルドは、Git管理外の別プロジェクト `blacksite2/vite.config.ts` が親のTypeScript対象に含まれるため失敗します。

生成に使用したプロンプト全文:

```text
Use case: photorealistic-natural
Asset type: BLACKSITE horror-game opening video, first frame, a single full-bleed cinematic still in wide 16:9 landscape.
Primary request: 知らない廃病院の受付で目覚めるサム・アルトマン — Sam Altman waking up at the reception of an unfamiliar abandoned hospital.
Scene/backdrop: The long-abandoned reception waiting area of ST. ORISON INSTITUTE. A clearly recognizable reception counter and unstaffed service window, worn waiting chairs, peeling walls, aged tile floor, a dark corridor receding beyond the counter. Restrained realistic decay, no fantastical architecture.
Subject: Sam Altman, naturally recognizable facial likeness, short brown hair, clean-shaven, wearing a simple dark navy jacket over a navy crewneck and dark trousers. He is alone, slumped in an old hospital waiting chair near the counter, shoulders slightly rounded and head only beginning to lift. His eyelids have just opened; his face shows sleepiness and quiet disorientation, as if he has no idea how he arrived here. His face must be clearly visible in a three-quarter frontal view. Natural hands resting on chair armrest and lap, natural anatomy.
Style/medium: Photorealistic cinematic psychological-horror film still, grounded live-action cinematography, detailed natural skin and worn fabric textures, subtle 35mm film grain.
Composition/framing: Medium-wide 35mm shot from seated eye level, slightly three-quarter frontal. Sam is the immediate focal point while the reception counter and empty hospital environment remain unmistakably visible in the same composition. Leave comfortable space above his head and into the room so a subsequent video can begin with a slow head lift, glance around, and subtle camera push-in. A single quiet opening moment rather than a completed frightened reaction.
Lighting/mood: Faint cold window light reveals his eyes and face; weak sickly green fluorescent light in the reception mixes with the blue-gray shadows. Dark but readable midtones, pale desaturated colors, oppressive stillness, restrained dread, realistic motivated lighting.
Constraints: One adult subject only. No killer, ghosts, extra people, blood, wounds, restraints, weapons, or gore. No invented narrative props. No text, legible signs, subtitles, titles, logos, UI, timestamp, watermark, borders, or letterboxing. No collage, no multiple panels. Landscape 16:9, full image composition, realistic human likeness and anatomy.
```

## SDK参照

Phaserのバージョン指定なしの最新資料は4.1.0ですが、本プロジェクトは3.90.0を維持します。[Image](https://docs.phaser.io/api-documentation/3.90.0/class/gameobjects-image)と[LoaderPlugin](https://docs.phaser.io/api-documentation/3.90.0/class/loader-loaderplugin)の版別資料でpreload→create、textureの確認、静止画の表示を確認しました。画像が読み込めない場合は既存の図形表示を使います。部屋選択のzoneとNPC画像は分離し、NPC自体は入力を奪いません。

## 検証

- `npm test`: 55件成功（simulation 32、API 11、Worker API 12）。追尾、初遭遇だけの中断、seed固定、Tiboのcooldown-only reset、隠れ場所の合法性・遭遇抑止・怪異による中断、フレーム幅の違いを含みます。
- `npm run build`: TypeScriptとVinextの全環境が成功。新しい6画像がclient配信物に含まれ、旧ELIAS画像を削除しています。
- ブラウザの手動フレーム試験で、cameraの停止・フォーカス・一度だけの発火、pause/reset/非表示タブ、Tibo通知の表示寿命を確認しました。最終UIでcameraとTiboを表示し、エラーは0件です。
- 隠れ場所を加えたローカルpolicyは8 seed全てで病棟へ避難し、1回隠れた後に110秒以内で脱出しました。標準seedは89.453秒です。ブラウザでも「隠れる / 隔離病棟」、隠れ中の対象表示、怪異で追い出した後のフィードバックを確認しました。
- 遅延したモックAPIによる8条件の境界試験と、初遭遇前の位置非送信・自身の行動だけの履歴・遭遇後の位置送信と合法退避を確認しました。実モデルの行動品質や本番通信を示す結果ではありません。
- 隠れ場所のAPIモックでも、初遭遇前はhide候補なし、遭遇後の病棟への移動、合法hideと画面反映、完了後の42秒制限と追跡解除の残り時間、書庫探索への復帰を8条件で確認しました。
- 新しいマップ素材・右列の対象選択・2×2アイコンUIは[レイアウトQA](projector-layout.md)を参照してください。初見の人による面白さの評価は未実施です。
