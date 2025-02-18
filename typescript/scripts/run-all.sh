#!/bin/bash

# スクリプトの場所を取得
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" &> /dev/null && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"  # typescriptディレクトリに移動

# もし logs ディレクトリが存在すれば削除
if [ -d "$SCRIPT_DIR/logs" ]; then
    rm -rf "$SCRIPT_DIR/logs"
fi

# logsディレクトリを作成
mkdir -p "$SCRIPT_DIR/logs"

# タイムスタンプを設定
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# src直下のTypeScriptファイルを検索
FILES=$(find src -maxdepth 1 -name "*.ts")

# ファイルが見つからない場合はエラーメッセージを表示して終了
if [ -z "$FILES" ]; then
    echo "エラー: src ディレクトリに TypeScript ファイルが見つかりません"
    exit 1
fi

# 各ファイルを直列処理で実行し、ログを保存
for file in $FILES; do
    echo "実行中: $file"
    npx tsx "$file" > "$SCRIPT_DIR/logs/$(basename "$file")_$TIMESTAMP.log" 2>&1
done

echo "===== 実行結果 ====="

# 各ログファイルの内容を表示
ls "$SCRIPT_DIR"/logs/*.log | while read -r logfile; do
    filename=$(basename "$logfile")
    echo "********** ${filename} **********"
    cat "$logfile"
    echo ""
    echo ""
    echo ""
done