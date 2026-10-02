SimSim 環境確認 v1.1

1. ZIPを展開してください。
2. check.html / check.css / check.js / worker.js / probe.jsn を、社内ポータルの同じフォルダに配置してください。
3. 社内でSimSimを使うブラウザから、check.htmlのHTTPまたはHTTPSのURLを開いてください。
4. 約10秒以内に各項目の結果が表示されます。
5. 通常のWorker、WebGL 2、静的JSONが成功すれば、想定する静的アプリの基本動作を確認できています。
   module Workerの成否は構成選択の参考です。WebGL 1だけの成功では現行Three.jsの条件を満たしません。
6. 必要なら「結果をコピー」を押してください。HTTP等でクリップボードが使えない場合は、結果欄を選択しCtrl+Cでコピーできます。

データはJSON形式ですが、社内ポータルの拡張子制限に合わせて .jsn を使用します。

外部CDN、APIサーバ、サーバへの書き込みは使いません。ホスト名やページURLは結果に含めません。
ライブラリを含めたSimSim全体の動作や、大量ユニット・大量試行での性能を保証するテストではありません。
画面がJavaScript起動待ちのままなら、check.jsの配置・配信・実行許可を確認してください。
失敗時はF12 -> Consoleのエラーも確認してください。worker.jsの404、認証ページへのリダイレクト、MIMEタイプ、CSP等が手がかりになります。
file:で開いた結果とポータルのURLから開いた結果は異なることがあるため、ポータル上で確認してください。

参考:
https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers
https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/Tutorial/Getting_started_with_WebGL
https://threejs.org/docs/pages/WebGLRenderer.html
