#!/bin/bash

# スクリプトの場所を取得
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
cd "$SCRIPT_DIR"

# もし logs ディレクトリが存在すれば削除
if [ -d "logs" ]; then
    rm -rf logs
fi

# logsディレクトリを作成
mkdir -p logs

# タイムスタンプを設定
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# src直下のPythonファイルを検索
FILES=$(find ../src -maxdepth 1 -name "*.py")

# ファイルが見つからない場合はエラーメッセージを表示して終了
if [ -z "$FILES" ]; then
    echo "エラー: src ディレクトリに Python ファイルが見つかりません"
    exit 1
fi

# 各ファイルを直列処理で実行し、ログを保存
for file in $FILES; do
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