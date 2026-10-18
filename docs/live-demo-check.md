# デモ前の必須実APIチェック

デモ準備完了の条件は、公開したコミットで Agents API と Decisions API を実際に使った対戦が成立すること。通常の `npm test` はオフラインの回帰テストであり、実通信の代わりにはならない。

## 実行順序

1. 作業ブランチの変更をコミットして `npm test` と `npm run build` を通す。
2. 確認した変更を main へ統合・pushし、その正確なコミットからビルドして既存Sitesへデプロイする。公開範囲と秘密設定を維持する。
3. main の作業ツリーをクリーンにして `npm run test:live` を実行する。
4. `npm run demo:ready` が成功することを確認する。
5. 公開版をブラウザーで実APIモードにし、方針・行動・干渉・一時停止と再開・リセットを確認する。デモ直前にも `npm run demo:ready` を再実行する。

実APIテストは既存サイトのサーバー側 `OPENAI_API_KEY` を使用する。ローカルへAPIキーをコピーしない。検証専用のGoogle ChromeまたはVivaldiのウィンドウとタブで公開サイトに正規サインインし、CLIの非表示標準入力へ `{"browser":"Google Chrome","windowId":123,"tabId":456}` の形でその正確なIDを渡す。Apple EventsからのJavaScript実行が既に許可されているブラウザーを使用し、検証のためにセキュリティ設定を変更しない。`browser` は `Google Chrome` または `Vivaldi` だけを受け付ける。CLIはosascriptへ標準入力だけでスクリプトを渡し、指定タブの同一originで通常の `fetch` を実行する。Cookieを読み出し・コピーせず、所有者用トークンや認証ユーザーヘッダーでサインインを代用しない。指定タブが閉じた場合、別originへ移動した場合、未認証の場合は失敗する。検証中はこの専用タブを移動・閉じず、ゲームを同時操作しない。能力トークンを含み得る応答はメモリ内の一時ブリッジだけで受け渡し、各リクエスト後に削除する。

## 自動ゲートの合格条件

- 実行先は既存の本番HTTPS originに固定し、リダイレクトを許可しない。
- `/api/release` の project ID と完全なGit SHAが、クリーンなローカルHEADと開始前・終了後とも一致する。ビルドはGit HEADを埋め込み、未コミット変更があれば停止する。
- `/api/status` が認証済み・設定済み・`live`を返す。
- Agents が正常終了したroot turnの方針を返し、空でない出力とprovider Request IDがある。
- Sam（`actor: escape`）の3回以上の実 Decisions HTTP 200応答が合法な候補を選択し、通常のシミュレーションで適用される。移動・時間経過を確認する。候補が1つの場合は強制行動として処理し、API判断の回数には含めない。
- Samが通常の書庫探索でキーカードを入手するまで、ぬこぬこさんの出現・接触・追跡APIは発生しない。出現条件を共有ルールで確認し、最初のキラー要求より前のキーカード入手とspawn状態を証跡に残す。
- ぬこぬこさん（`actor: killer`）の1回以上の実 Decisions HTTP 200応答を確認する。同一セッションと能力トークンを使い、通常の共有シミュレーション関数で重み付き移動時間が最小の合法な移動だけを適用する。待機や最短でない候補は不合格。actor別のRequest IDと適用前後の追跡状態、通常tickで選択した移動先への実到着を証跡に残す。移動先を設定しただけの証跡は不合格。APIモードでは自動追跡でこの判断を代用しない。
- 実APIが選んだ移動にプレイヤーの扉封鎖を適用し、移動中断・エネルギー消費・封鎖を確認する。変化した状態を送った後続の実API判断が成功する。
- 生成したproviderセッションを終了時に削除し、その成功とRequest IDを確認する。失敗時にも削除を試みる。
- 無条件リトライ・ローカルへのフォールバック・クールダウンやキラーを無効化するテスト用のルール変更は行わない。Sam最大12ループ（各ループで必要ならキラー判断）・通常処理180秒で未達なら失敗する。

成功時のみ `.sites-runtime/live-demo-receipt.json` に許可したメタデータを保存する。証跡はschemaVersion 2とし、キラー証明のない旧版は拒否する。Git管理外で、6時間以内・同一コミット・同一公開版・削除完了の証跡だけが `demo:ready` を通過する。再テスト開始時には古い証跡を無効化する。providerのエラー、認証失敗、未実施、古い版の成功記録は合格にしない。

証跡の `requestedModel` は要求したモデル設定を示す。現在のadapterの `model` は定数由来であり、provider応答本文が返したモデル名の検証とは区別する。Request IDは実際のproviderレスポンスヘッダーから取得する。証跡にはAPIキー、認証ヘッダー、セッションID/能力トークン、方針全文、生のレスポンスを含めない。

このゲートはデモ受け入れを必須化する。Sitesのネイティブデプロイ自体を禁止する仕組みではない。初回の実通信は公開後にしか確認できないため、デプロイ成功とデモ合格は別々に判定する。

## 公式資料の再確認（2026-10-18）

- [Agents events](https://developers.openai.com/api/docs/guides/agents-api/sessions/events#handle-updates): rootの `agent.session.turn.completed` を確認する。`idle`・item完了・stream EOFだけでは成功としない。既存adapterはこの境界を維持する。
- [Decisions](https://developers.openai.com/api/docs/guides/decisions): 質問名・回答型・候補との一致を検証し、任意のdecision IDを必須にしない。
- [Vite define](https://vite.dev/config/shared-options#define): 公開コミットとproject IDをビルド時定数として置換する。APIキーなどの秘密はdefineに渡さない。

今回の差分は公開版を特定する `/api/release` と実通信の受け入れゲート。APIのバージョンとモデル設定は維持する。追跡判断は `actor: killer` と共有の重み付き最短経路検証を追加し、既存のSam判断・扉封鎖後の再判断・cleanup条件を維持する。
