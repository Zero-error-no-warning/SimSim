# 検証

0.8の現行説明は [現在の操作と設計 — 検証](workspace-v3.md#検証) に統合しました。旧UI名・旧実行モデルの手順を現行の手順として使わないでください。

[0.7時点のこの資料](https://github.com/Zero-error-no-warning/SimSim/blob/306c9902be93a3d82bd433afe88d4ff25feeca6c/docs/validation.md) は履歴として参照できます。旧版の分析結果と記録は旧版で開いてください。


## 2026-10-09 情報制約モデル

段階A～Fの検証はtests/information.test.mjs、communication.test.mjs、experiment.test.mjs、mission-templates.test.mjs、patterns.test.mjs、resources.test.mjs。旧機能サンプルはtests/fixtures/legacyへ移設し、同じ回帰検証を続ける。ブラウザのinformation-browser.mjsは新しい通しサンプル、保有情報、集約、判断編集、Worker実験、保存、地図ひな型、Undo/Redoを確認する。持ち込み版も同じ情報制約モデルを同梱する。

tools/benchmark-information.mjsの実測例（5主体・600秒・1回測定）：全て701行動イベント・245情報更新・同一の成功時刻35.57745秒。要約の結果JSONは2,206 bytes・最大保持16イベント、詳細結果369,441 bytes・701イベント、再生の位置／資源バッファ20,436 bytes。プロセス全体のメモリではない。実行時間はウォームアップと環境に左右され、この小ケースから速度向上・大規模性能を主張しない。

## 2026-10-09 設定と盤面表示（画面版27）

`tests/map-presentation.test.mjs` は未計算の担当数・資源・初期保有情報、経路なしタスク、担当値の経路、地点への移動、未担当を検証する。`tests/information.test.mjs` はUI更新後も計算モデル26の記録を復元し、異なる計算モデルを拒否する。

`node tests/authoring-display-browser.mjs` は選択中のチェックとaria-pressed、JSONを開かず入れ子条件を編集・保存、容量・消費率・群への割当・取消・範囲検証、資源残量の時刻移動、初期集約、情報視点の切替とユニット変更を確認する。MapViewの直接検証で敵の残量・未知の経路・真状態の航跡が表示されないこと、接触の画面上の大きさ、集約の計画線と未担当個体を確認する。`SIMSIM_PORTABLE=1` で同じ操作を持ち込み版に実施できる。
