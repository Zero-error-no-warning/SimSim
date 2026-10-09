# 情報制約モデル version 4

version 3は既存の実行・記録モデルを維持する。version 4は `information-behavior-v4` として別のモデル名で記録・分析を保存する。旧記録の再計算によって新モデルの結果へ置換しない。

## 段階A

各ユニットはcontacts、friendlyReports、commandsを持つ。真のユニット位置は解析用に存在するが、判断条件へ渡さない。接触は複数保持し、元の観測時刻と受信時刻を区別する。古い観測は同じ対象の新しい観測を上書きしない。再生は再生時刻までの情報履歴から再構成する。

`initialInformation` は所有者ごとに明示する。観測は `targetId, targetPosition, observationTime`、味方状態は `messageKind:"status", subjectId, reportedState, observationTime`。初期の観測時刻は0以下。未指定の敵初期位置は既知情報へ入らない。

ユニット目的地は `access:"known"` として最後に知った座標を使う。version 4では省略時もknown。情報がなければ待機し、現在の真位置への追尾に切り替わらない。従来の参照は `modelAssumptions.information:"legacy"` と明示したときだけ許す。

判断接続は `when:"condition"`。`condition` は `field,op,value` または `all/any`。比較演算はlt/lte/gt/gte/eq/neq/exists。判断対象はself.status、self.operational、self.resources、knowledge.selectedContactのage/identity.confidence/positionErrorRadius、knowledge.friendlyReportsのage/reportedState、clockに限定する。未知情報をfalseと同一視せず、`onUnknown:true`の接続で扱う。priorityの大きい接続を優先し、同順位は接続先ID順。判断時のコンテキストはイベントに残る。

接触selectorはclass、order（latest/nearest）、trackId。内部の対象対応は完全ID一致という近似で、誤識別・誤接触・位置誤差の生成はまだ行わない。モデルの細分化より先に情報経路を検証するための境界である。

報告ノードのmessageKindはobservation（既定）、status（自分の状態）、command。命令は `command:{name:"respond"}`。受信ユニットの `commandSources` にある送信元だけを受け付ける。`when:"command",commandName:"respond"` の接続は配達時刻に遷移する。送信成功の時点では遠隔ユニットを動かさない。命令そのものは位置観測を作らない。

通しサンプルは `data/information-mission.txt`。探知者→中継→対処ユニットの経路で観測が届き、鮮度を条件に対処する。通信失敗や観測欠落は、対処側の既知情報を直接更新しない。

## 段階B

`communicationLinks` は送信元・受信先・IDと既存通信能力を持つ有向リンク。省略時は送信側の従来設定を使う。複数リンクは同じ論理メッセージを送信し、最初の受信だけを適用する。再送は別メッセージIDで独立した偶発乱数を使う。failureModelのtrialは試行全体、windowはwindowSecondsの区間内で継続する障害（outageProbability）。既存version 3の通信乱数は維持する。

媒体はideal・rf・optical・acoustic・satellite。idealは従来の抽象リンク。rf/opticalは地球半径6371000mに対する球面の地平線と、地形遮蔽設定時の曲率補正を使う。earthFactorは実効半径係数（既定1）。局所平面座標・海面標高を用いる近似であり、全地球座標・屈折・電波リンクバジェットは含まない。acousticは両端が水中、他媒体は両端が海面以上の使用領域制約。伝搬速度の既定は音響1500m/s、他は光速。衛星リンクは抽象化した衛星経由で、軌道や可視衛星の計算はしない。sensor.mediumにも同じ使用領域・見通しを適用する。

`communicationDisruptions` はstart/endの半開区間、medium、linkIdsを絞り、available:false、probabilityMultiplier、delayAddedを指定する。送信時にリンク状態を評価し、配達時に受信側の稼働を再確認する。伝搬中の経路変動は計算しない（instantTransmission近似）。偶発未着は解析専用deliveryFailedイベントで、送信側のsendFailed接続には漏らさない。確認応答は未実装。自動再送はなく、wait/report接続で設定する。

`operationalEvents:[{unitId,time,operational:false}]` は交戦結果ではなく外部から注入する停止事象。移動・探知・送受信を止める。司令部のfriendlyReportsを直接更新しない。`unit.statusReports:{receiverIds,interval}` は移動と並行する周期状態報告。停止前の報告が最後に届いた場合、司令部はその古い「稼働」を保持する。沈黙から損害確定への自動変換はしない。

協調周回はassignment.coordinationのideal/reportedで区別する。reportedは仲間の報告位置とreportMaxAgeのみを用い、情報欠落時はmissingReportのcruise/stopに従う。既存idealの間隔制御と性能は維持する。同時刻の受信は保有情報をまとめて更新してから判断する。
