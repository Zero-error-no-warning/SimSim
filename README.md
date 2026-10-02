# SimSim

HTML・CSS・JavaScriptで動作するミッションシミュレーションの開発用リポジトリです。

## ブラウザ環境の動作確認

[確認用ファイル一式](environment-check/)を同じフォルダに配置し、社内ポータルのHTTP／HTTPS URLから `check.html` を開いてください。外部CDNやサーバ側処理は不要です。

確認する項目:

- 通常のWeb Worker: 計算と配列の往復転送
- module Worker: module形式の実行
- WebGL 2 / WebGL 1: シェーダ、描画、画素検証
- 静的JSONの読み込み

通常のWorker・WebGL 2・JSON読み込みの成功で、想定する静的アプリ構成の基本動作を確認できます。module Workerは構成選択の参考です。大量試行の性能やSimSim全体の動作は別途検証します。

一括取得は GitHub の **Code → Download ZIP** を使ってください。

## GitHub Pages

`Settings → Pages → Deploy from a branch → main → /(root)` を選ぶと、このリポジトリの確認ページを公開できます。ルートの `index.html` から確認ページへ移動します。

社内運用条件の確認は、GitHub Pages上の結果だけでなく、実際の社内ポータル上でも行ってください。

参考:

- [Web Workers — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers)
- [WebGL — MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/Getting_started_with_WebGL)
- [Three.js WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html)
