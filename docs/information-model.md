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
