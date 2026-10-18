# ゲーム音の素材と再生仕様

調査日: 2026-10-18。環境音と効果音は無料配布の CC0 素材を編集し、`public/audio/` に同梱する。ゲーム中に外部の素材サイトへアクセスしない。作者、素材ページ、配布ファイル、編集内容は配信対象の [CREDITS.txt](../public/audio/CREDITS.txt) に記録し、ゲームの遊び方からも参照できる。

## 使用 API の公式資料

既存実装は Phaser の Sound Manager ではなく、ブラウザー標準の Web Audio API を直接使用していた。今回もその方式を継続し、43 Hz の合成ドローンとオシレーターの効果音を、読み込んだ音声バッファーの再生へ置き換える。Phaser やサーバー SDK の追加・更新は不要。

- [MDN: Web Audio API best practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices): 自動再生制限に対応し、ユーザー操作のハンドラーで AudioContext を作成・再開する。音の初期設定はオフ。
- [MDN: AudioBufferSourceNode](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode): ソースノードは一回限り。デコード済み AudioBuffer を再利用し、再生ごとに新しいソースを作る。
- [MDN: loop](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode/loop): 環境音の繰り返しは `loop` を使用する。
- [MDN: BaseAudioContext.state](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/state): `running` / `suspended` / `closed` のほか、ブラウザーにより `interrupted` へ遷移する。特にバックグラウンド復帰で再生が中断した場合、ユーザー操作からの再開が必要になる。

従来の実装との差は、一つのオシレーターを再開し続ける方式から、各音源の開始・停止・後始末を管理する方式になる点。一時停止時にコンテキストだけを停止すると、再開時に古い効果音の続きを鳴らしてしまうため、再生中のソースも停止する。ロード中のミュート、リセット、ページ離脱で古い非同期処理が再生を復活させないようにする。

## 素材の選定

- [Kenney: RPG Audio](https://kenney.nl/assets/rpg-audio) — 扉、金属、足音、小物の効果音。公式ページと配布パックの License.txt で CC0 を確認。
- [congusbongus: Abandoned passages](https://opengameart.org/content/abandoned-passages-horror-ambience-loop) — 狭く暗い施設に合う環境音のループ。配布ページで CC0 を確認。
- [Ogrebane: Ghost](https://opengameart.org/content/ghost) — 怪異の出現音。配布ページで CC0 を確認。
- [cicifyre: Voice Clip Packs for Visual Novels and RPGs](https://opengameart.org/content/voice-clip-packs-for-visual-novels-and-rpgs) — CC0 の Bright Female パックから非言語の女性 gasp を使用。約1半音上げて元の速度に戻し、190 Hz のハイパス、3.2 kHz を1.5 dB強調、7.6 kHz のローパスで整えた。約230 ms 前から聞こえる弱い逆再生リバーブと約20セントずらした影の声を重ね、150/300/450/600 ms に小さく減衰する反射を置いた。話者の年齢は不明で、特定人物の模倣や合成音声ではない。

ゲームの音量は環境音・足音を控えめにし、干渉・Tiboの登場・目標達成を短い効果音で知らせる。音はシミュレーションの外で制御し、判定・乱数・API 入出力に影響させない。

## 検証記録

2026-10-18 の音追加時（接触即終了ルールの統合前）に以下を確認した。

- `npm test`: 63件成功。既存55件に、音の初期オフ、同梱素材と出典、再生中のゲート、非同期ロード中のミュート・リセット・破棄、イベントの重複防止、足音の時間間隔、読み込み失敗後の再試行、音声デバイスの失敗を確認する8件を追加。
- `npm run build`: TypeScript と Worker ビルドが成功。Git 管理外の入れ子チェックアウトが型検査へ混入していたため、`tsconfig.json` の対象をこのプロジェクトのソース・設定・生成型のディレクトリーへ限定した。
- FFmpeg: 全8ファイルをデコード。音声データ計471,841バイト。モノラル44.1kHz、96kbps MP3。無音ではなく、書き出した素材の true peak は -4.5〜-10.4dBFS。環境音は31.318秒の元ループを保持。
- Vivaldi のローカルゲーム画面: スピーカーボタンのオン・オフ、開始、一時停止・再開、4種類の干渉、監視映像、リセット後の音設定引き継ぎ、遊び方からのクレジット表示を確認。マップと監視映像をスクリーンショットで確認。プレーンテキスト配信時に文字化けしたクレジットの引用符を ASCII へ直し、再表示を確認した。
- Chrome の一時検証ページで実際の Web Audio API を使用: 操作前の AudioContext 未作成、全8素材の取得・デコード、環境音の出力 RMS 0.004348、4種類の干渉・遭遇・Tibo・目標達成・足音のソース開始を確認。一時停止でソースの接続が切れ、RMS は 0.00000000。ミュートとリセットで停止、破棄でコンテキスト終了を確認。検証用サーバーとスクリプトは作業後に削除。これはブラウザー内の音声信号の測定であり、実スピーカーでの聴取評価は含まない。

実API・公開サイトの再検証は今回の音追加の検証範囲に含めない。

## 最新ゲームルールとの統合

囁きは女性声に逆向きの残響と声の重なりを加えた `whisper-ghost.mp3` に更新した。以前の音声がブラウザーにキャッシュされていても新しい素材を取得できるよう、配信パスも変更した。

2026-10-18の最新mainでは、接触後も実験を継続し、恐怖100で捕獲結果を表示する。実験中の接触は遭遇音を再生でき、終了・結果ダイアログでは音を停止する。上記の検証記録は音追加時の記録として保持し、現行版の実API確認にはデモの必須ゲートを使用する。

## 提供BGMのループ（2026-10-18追加）

ユーザー提供の `A_dark,_suspenseful__#3-1792305773451.mp3`（15.680秒、ステレオ48kHz、377,901 bytes）をBGMに使用します。既存のCC0効果音とは出典を区別し、ファイル名の `#` をURLでは `%23` として扱います。MP3を改変せず配信し、Web Audioの `loop=true` で繰り返します。

[MDNのloop](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode/loop)と[AudioContext.resume](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/resume)を実装前に確認しました。音設定は初期オン、実際のAudioContext作成・再開は開始クリックから行い、操作前の自動再生は試みません。API応答待ち中はBGMの同じループを維持し、効果音は止めます。一時停止・映像・dialog・非表示・終了・ミュート・reset・disposeではBGMも停止します。上記の初期オフは過去版の記録です。
