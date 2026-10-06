# テキストコピーによる社内持ち込み

[持ち込み用ファイルページ](https://zero-error-no-warning.github.io/SimSim/portable/copy.html)から、次の5ファイルの全文をコピーして、同じフォルダにUTF-8で保存します。

| 保存する名前 | 内容 |
| --- | --- |
| `index.html` | 画面 |
| `styles.css` | 表示スタイル |
| `main.js` | 画面操作・Three.js・全サンプル |
| `worker.js` | シミュレーション計算 |
| `analysis-worker.js` | モンテカルロ分析 |

「表示」→「全文をコピー」でコピーします。クリップボード操作が利用できない場合は「全文を選択」→ Ctrl+Cを使います。「TXTを保存」は同じ内容を `ファイル名.txt` として保存します。配信する際は末尾の `.txt` を外し、上表の名前にしてください。

社内の静的HTTP／HTTPSサーバで `index.html` を開きます。`.js` はJavaScriptのMIMEタイプ、`.css` は `text/css` で配信してください。既存の `src`・`vendor`・`data` フォルダは、この版の実行には不要です。`copy.html` は持ち込み支援用なので、社内へコピーする必要はありません。

3本のJSにはすべての依存コードが含まれています。外部CDN、追加モジュールの読込、BlobによるWorker起動、module Workerを使いません。9個の同梱サンプルは `main.js` に入っており、読込ごとに新しく解析します。保存形式と計算モデルは通常版と同じです。シナリオ・記録・分析のTXTは相互に開けます。

更新するときも同じ5ファイルを入れ替えます。HTML・JS・WorkerのURLには入力ファイルから作った版識別子を付けています。コピー用ページは取得したファイルの長さを検証し、利用できる環境ではSHA-256も検証します。

## 開発側での生成

Node.jsとnpmで、リポジトリのルートから実行します。

```sh
npm ci
npm run build:portable
```

`portable/` に5ファイルとコピー用の `copy.html` を生成します。生成済みファイルもGitに含めているため、持ち込み先でNode.jsやビルドは不要です。通常の開発では `src/` を編集し、公開前に持ち込み版を再生成してください。UI_BUILDを変更した場合は先に `node tools/version-assets.mjs` を実行します。

ビルドはesbuildのIIFE形式を使います。Worker URLとサンプル読込、起動時の非同期処理だけをビルド時に置き換え、元のソースは保持します。置換対象が見つからない・重複する場合や、外部importが残る場合は生成に失敗します。Three.jsのMITライセンス本文は `main.js` に含めています。

## 検証

```sh
node tests/portable-browser.mjs
SIMSIM_WEB_ROOT=portable node tests/browser-smoke.mjs
SIMSIM_WEB_ROOT=portable node tests/state-measurement-browser.mjs
```

PlaywrightとChromiumが必要です。`SIMSIM_PLAYWRIGHT` と `SIMSIM_BROWSER_EXECUTABLE` で既存の環境を指定できます。

専用テストはコピー画面の全文から5ファイルを別フォルダに保存し、通常版のソースを配信せず起動します。module Workerを禁止した環境と自己オリジンのみを許可するCSPで、全サンプルのデータ一致、version 3の保存・再読込、計算、分析、追加ファイルの取得がないことを確認します。
