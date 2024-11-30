#!/bin/bash

# もし logs ディレクトリが存在すれば削除
if [ -d "logs" ]; then
    rm -rf logs
fi

# logsディレクトリを作成
mkdir -p logs

# タイムスタンプ付きで各ファイルのログをlogsディレクトリに保存
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
find . -name "1_3_*.ts" | xargs -P 15 -I {} sh -c 'npx tsx {} > logs/$(basename {})_'"$TIMESTAMP"'.log 2>&1'

# すべてのプロセスが完了するまで少し待つ
wait

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