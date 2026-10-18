# サム・アルトマンと追尾キャラクター

2026-10-18の[BLACKSITE 開発ノート](https://chatgpt.com/space/page_6ad364e1b6988191bc1b900799453a36)とユーザーの指示を反映した、現行の施設マップ・4干渉版の実装記録です。提出の作業締め切りは同日17:15 JSTです。

## 遊びの流れ

- 人間は建物に棲む怪異として、AIが操作するサム・アルトマンの脱出を妨害します。サムの鍵→電源→出口の目標に対し、恐怖100・180秒阻止がプレイヤーの勝利条件です。接触済みのサムが恐怖100に達すると捕獲結果を表示します。
- サムは左下の受付から開始し、キーカードを回収するとぬこぬこさんが反対側の研究室に出現します。キラーは接続された部屋を追尾し、マップ上で体が重なった瞬間に接触と判定します。接触は捕獲状態として記録され、接触映像の後にサムの行動と実験を再開します。恐怖100に達すると実験を終了します。
- サムがキラーと初めて接触するまでは、その位置を回避判断に使用しません。接触後は位置が分かり、退避や隠れ場所を選べます。
- 扉を封鎖すると、サムが室内にいる場合は退室を阻止し、室外なら入室を阻止します。移動中に現在の部屋または移動先を封鎖すると移動を中断します。
- Tiboは最初の18〜30秒、その後24〜42秒のランダムな間隔で登場します。4種類のクールダウンを解除し、エネルギーも100に回復します。進行、ロック、干渉効果、取得物は維持します。
- Tiboはマップ内の大きな上半身カットインで2.6秒表示します。720pでは約251×320pxです。クリックを遮らず、ゲーム時間を止めません。カメラ・モーダル・非表示タブに隠れた時間は表示寿命に含めません。
- 接触を記録した後もサムは移動・作業・隠れる行動を続けます。停電や囁きによる恐怖、隔離病棟の隠れ場所も引き続き有効です。
- 最初の有効干渉から短い間を置き、中央マップだけを3.6秒の監視カメラ演出へ切り替えます。実際の部屋・妨害・時刻を返します。固定台詞は施設演出と表示し、APIによる選択・方針・ログに混ぜません。

## 状態とAPIの境界

`simulation.ts`が追尾・遭遇・乱数・Tiboの時刻を所有し、`main.ts`が表示とモデル通信を担当します。通常の初期化とリセットでは`crypto.getRandomValues`のseedを渡し、テストでは`createState(seed)`を固定します。乱数はフレームごとに引かず、出現イベントの境界で次の時刻を決めます。

初遭遇前のAPI snapshotには`knownKiller`キー自体を作りません。初期の施設説明も追尾ルールだけを渡し、キラーの初期位置を渡しません。`recentActions`はサム自身の選択行動へ絞り、systemログや初期planからの位置漏れを防ぎます。初遭遇後だけ、相手の現在室・移動先・遭遇回数・遭遇時刻を渡します。

接触はシミュレーション上の永続状態です。接触時に恐怖と通知を即時更新し、全画面の接触映像中はゲーム時間を止めます。恐怖100で終了する時に接触済みならサムの捕獲結果を表示します。API待ちではキャラクターも停止し、シミュレーション再開後に物理的な重なりを判定します。`hideout`状態とフィールドは初回接触後のサムの行動選択にも影響します。

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

2026-10-18の依頼「知らない廃病院の受付で目覚めるサム・アルトマン」を、写実的なホラー映像の最初のカットとしてbuilt-in `image_gen`で生成しました。待合椅子に身体を預けたサム、無人の受付カウンター、暗い廊下を一画面に収め、続く動画で顔を上げて周囲を見回せる構図です。同日の追加依頼で、意図せず連れ去られた状況が分かるよう、片目にかかるずれた黒い布の目隠しと、膝上でまとめられた手首の縄を同じツールで加えました。主人公の外見と受付の構図・照明を保っています。施設と主人公の設定は[BLACKSITE 開発ノート](https://chatgpt.com/space/page_6ad364e1b6988191bc1b900799453a36)を参照しました。

動画制作の入力として、編集出力のPNGを無加工で[public/blacksite-opening-frame.png](../public/blacksite-opening-frame.png)に保存しています。1672×941px（約16:9）、1,986,383 bytes、背景不透過です。目視・PNGのデコード・編集出力とのSHA-256一致を確認しました。初回の画像とプロンプトはGit履歴の `5a0c7c0` に残しています。

検証: 既存55テストと差分の空白チェックが成功しました。追跡中のソースと今回の2ファイルを取り出した環境でWorkerビルドが成功し、配信物のPNGも元データと一致しました。通常の作業ディレクトリでのビルドは、Git管理外の別プロジェクト `blacksite2/vite.config.ts` が親のTypeScript対象に含まれるため失敗します。

初回生成に使用したプロンプト全文:

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


編集に使用したプロンプト全文（入力: 初回の生成画像）:

```text
Use case: precise-object-edit
Asset type: BLACKSITE fictional horror-game opening video, first frame.
Input image 1: EDIT TARGET — the existing cinematic still of Sam Altman waking in an abandoned hospital reception. Use this exact image as the base.
Primary request: Add clear visual props showing that Sam was brought here against his will and is only now waking up.
Change only these local details:
1. Add a plain, visibly wrinkled black cloth blindfold across his eyes, displaced diagonally so it still covers one eye while the other eye is partly exposed. It should unmistakably read as a recently shifted blindfold, not a scarf, headband, medical eye patch, or neckwear. Keep his exposed eye, nose, mouth, facial proportions and hair naturally recognizable as the same Sam Altman.
2. Bring both of his existing hands together naturally over his lap, with both wrists loosely bound together in front by a small amount of plain cord. The binding is visible at a glance but understated, with no knot-making detail, no pressure marks or injury. Preserve two anatomically correct hands with natural fingers and the original dark clothing.
His slumped waking posture and the confused expression of the exposed part of his face must remain. These props should communicate involuntary abduction in a fictional psychological horror story, not a posed fashion scene.
Invariants: Preserve the same person and recognizable identity, same jacket and trousers, same body scale, same waiting chair and reception counter, same dark corridor, decayed hospital surfaces, camera angle, framing, original image dimensions and landscape aspect ratio, film grain, cold window light, green fluorescent atmosphere, and photorealistic cinematic style. Keep the background and every other object unchanged. Match the added cloth and cord to the existing perspective, shadows, and lighting.
Constraints: One adult person only. No added captor or monster. No gag, no neck restraints, no weapons, blood, bruises, wounds, gore, or graphic violence. No extra limbs or fingers, no text, signs, subtitles, UI, logos, timestamps, watermark, border or black bars. Do not redesign the scene.
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

## デモ用の追跡API（2026-10-18追加）

実APIモードではぬこぬこさんも個別のDecisionsリクエストで移動を選びます。隣接室の移動時間を重みにして最短経路候補を計算し、APIが返した候補を適用直前に再検証します。API待ちにはゲーム時間を止め、失敗は一時停止として表示し、ローカル追跡への自動切替はしません。隠れ中・追跡を見失った間はサムの現在地を送信しません。旧QAのcooldown-only reset記録は当時の仕様で、現行Tiboはエネルギーも100に回復します。

2キャラクター版のローカル確認では、モック通信で初期API選択・音オン、OP前のセッション未作成、キラーの停止中応答保留と再開時適用、サム要求の発生、reset後の旧応答破棄、セッション削除要求を確認しました。これは実通信とは別の境界検証です。出現条件追加後の自動テストは92件が成功しています。

## カードキー回収による出現

ぬこぬこさんは `killer.spawned=false` で待機し、カードキーの取得処理で一度だけ出現します。出現前は俯瞰マップの人物・ラベルを隠し、追跡、接触判定、キラーのDecisions要求を行いません。出現時にはユーザー提供の `/video/spawn.mp4` を全画面再生します。リセットで未出現へ戻ります。

## マップ位置に同期した接触判定（2026-10-18）

旧判定は二人の `roomId` が一致するまで接触を確定せず、移動中にマップのキャラクターが重なっても部屋への到着まで恐怖が増えませんでした。また描画だけに約120msの位置補間がありました。

移動経路と座標計算をシミュレーションと描画で共有し、表示位置だけの追従遅延を廃止します。接触は足元のアンカーを基準とする横36・縦65マップ単位の合成楕円で、立ち姿の体の重なりを判定します。接近オーラを当たり判定には使いません。別々の部屋を出発して通路ですれ違う時も判定し、同じ部屋IDでも実際に離れていれば接触しません。

両者の相対速度から最初に楕円へ入る時刻を求め、その時刻、経路の角、行動完了、効果期限、接触後の12秒間隔でtickを分割します。未出現・隠れている間は接触せず、一時停止とAPI待ちでは時間を進めません。描画側からダメージを加えず、シミュレーションが一度だけ確定します。恐怖の上限や隠れるルール、APIの最短経路検証は継続します。

実装前に[Phaser 3.90 Math.Distance](https://docs.phaser.io/api-documentation/3.90.0/namespace/math-distance)、[Geom.Intersects](https://docs.phaser.io/api-documentation/3.90.0/namespace/geom-intersects)を確認しました。現在のキャラクターはArcade PhysicsのBodyを持たない表示オブジェクトです。描画フレーム依存の物理判定を追加する代わりに、既存の決定的シミュレーションで共有座標と幾何計算を使います。SDKの変更はありません。

## 被弾とTiboの演出

接触と有効な干渉で恐怖が増えた際、サムのステータスに深紅のグラデーションと縁の光を重ね、恐怖の数字・ゲージを強調し、実際の増加量を小さなバッジで表示します。配置を動かさず、`role=status`で増加量も伝えます。緩やかな恐怖の自然増加では毎フレーム点滅させません。演出は表示できた時間で1.2秒保持し、接触映像から戻っても確認できます。リセットでは解除します。

Tiboのカットインは2.6秒のCSS tweenで、滑り込み→軽いオーバーシュート→着地→退場を作り、肖像の視差拡大、真鍮色の光輪、一度だけ横切る光、順次現れる文字、エネルギー100回復の発光を重ねます。DOMのカットインなのでPhaserの物理・Tween依存を追加せず、CSS keyframesとcubic-bezierを使用します。動画、監視映像、dialog、非表示タブで覆われる間は、表示寿命とCSS animationの両方を止めます。`prefers-reduced-motion`では動きを止め、赤い被弾色・増加量・Tiboの静的な発光と回復表示を維持します。
