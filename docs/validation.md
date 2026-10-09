# 検証

0.8の現行説明は [現在の操作と設計 — 検証](workspace-v3.md#検証) に統合しました。旧UI名・旧実行モデルの手順を現行の手順として使わないでください。

[0.7時点のこの資料](https://github.com/Zero-error-no-warning/SimSim/blob/306c9902be93a3d82bd433afe88d4ff25feeca6c/docs/validation.md) は履歴として参照できます。旧版の分析結果と記録は旧版で開いてください。


## 2026-10-09 情報制約モデル

段階A～Fの検証はtests/information.test.mjs、communication.test.mjs、experiment.test.mjs、mission-templates.test.mjs、patterns.test.mjs、resources.test.mjs。旧機能サンプルはtests/fixtures/legacyへ移設し、同じ回帰検証を続ける。ブラウザのinformation-browser.mjsは新しい通しサンプル、保有情報、集約、判断編集、Worker実験、保存、地図ひな型、Undo/Redoを確認する。持ち込み版も同じ情報制約モデルを同梱する。

tools/benchmark-information.mjsの実測例（5主体・600秒・1回測定）：全て701行動イベント・245情報更新・同一の成功時刻35.57745秒。要約の結果JSONは2,206 bytes・最大保持16イベント、詳細結果369,441 bytes・701イベント、再生の位置／資源バッファ20,436 bytes。プロセス全体のメモリではない。実行時間はウォームアップと環境に左右され、この小ケースから速度向上・大規模性能を主張しない。

## 2026-10-09 設定と盤面表示（画面版27）

`tests/map-presentation.test.mjs` は未計算の担当数・資源・初期保有情報、経路なしタスク、担当値の経路、地点への移動、未担当を検証する。`tests/information.test.mjs` はUI更新後も計算モデル26の記録を復元し、異なる計算モデルを拒否する。

`node tests/authoring-display-browser.mjs` は選択中のチェックとaria-pressed、JSONを開かず入れ子条件を編集・保存、容量・消費率・群への割当・取消・範囲検証、資源残量の時刻移動、初期集約、情報視点の切替とユニット変更を確認する。MapViewの直接検証で敵の残量・未知の経路・真状態の航跡が表示されないこと、接触の画面上の大きさ、集約の計画線と未担当個体を確認する。`SIMSIM_PORTABLE=1` で同じ操作を持ち込み版に実施できる。

## 2026-10-09 設定契約と共通設定画面（画面版28）

- `npm run check:configuration`: 17モジュール・113フィールド、実際の編集部品、分析への接続、状態の参照契約、生成LLM仕様表を検査。持ち込み版ビルド前にも実行。
- `node --test tests/*.test.mjs`: 51件成功。既存の計算・記録・実験・定石・分析・保存互換性に加え、下書きの分離、revision競合、群ひな型、公開状態の参照と未知値を確認。
- `tests/configuration-browser.mjs`: 通常版・持ち込み版で、右ペインから入力を分離、契約だけから標準入力を生成、資源の量/km↔量/m、保存・再読込、Undo/Redo、対象切替の適用／破棄／継続、初期情報・リンク・障害・停止事象、分析への引き継ぎ、群の適用範囲、1200pxの表示を確認。
- `tests/authoring-display-browser.mjs`: 条件の入れ子、資源の不正値・取消・補給率保持、盤面の残量と時刻移動、集約・情報視点、未受信の敵資源を非表示にする検査を維持。
- ノード・経路の共通下書き統合: `browser-smoke.mjs`（通常・持ち込み）、`navigation-browser.mjs`、`route-planner-browser.mjs`、`state-measurement-browser.mjs`、`plans-browser.mjs`、`information-browser.mjs`で確認。専用エディタの保存後に外側の適用を行う操作へテストを移行した。
- `worker-version-browser.mjs`: 実際のWorker応答版、古い通常版・持ち込み版の混在検出を確認。`MODEL_BUILD`は26のまま。

ブラウザ検証はPlaywright・Chromium、外部通信を許可しないCSPで実行。表示設定の変更と定義設定の変更を区別し、現在の残量を初期値へ保存しない。
