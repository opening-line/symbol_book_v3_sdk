#!/bin/bash

# もし logs ディレクトリが存在すれば削除
if [ -d "logs" ]; then
    rm -rf logs
fi

# logsディレクトリを作成
mkdir -p logs

# タイムスタンプを設定
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# 各ファイルを直列処理で実行し、ログを保存
for file in $(find . -name "1_3_*.py"); do
    echo "実行中: $file"
    python "$file" > "logs/$(basename "$file")_$TIMESTAMP.log" 2>&1
done

echo "===== 実行結果 ====="

# 各ログファイルの内容を表示
ls logs/*.log | while read -r logfile; do
    filename=$(basename "$logfile")
    echo "********** ${filename} **********"
    cat "$logfile"
    echo ""
    echo ""
    echo ""
done