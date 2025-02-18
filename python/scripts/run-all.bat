@echo off
setlocal enabledelayedexpansion

rem スクリプトの場所を取得して移動
pushd %~dp0

rem タイムスタンプを設定
for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set datetime=%%I
set TIMESTAMP=%datetime:~0,8%_%datetime:~8,6%

rem もし logs ディレクトリが存在すれば削除
if exist logs (
    rd /s /q logs
)

rem logsディレクトリを作成
mkdir logs

rem src直下のPythonファイルを検索して実行
set "FILES_FOUND=0"
for %%F in (..\src\*.py) do (
    set /a FILES_FOUND+=1
    echo 実行中: %%F
    python "%%F" > "logs\%%~nxF_%TIMESTAMP%.log" 2>&1
)

rem ファイルが見つからない場合はエラーメッセージを表示
if %FILES_FOUND%==0 (
    echo エラー: src ディレクトリに Python ファイルが見つかりません
    exit /b 1
)

echo ===== 実行結果 =====

rem 各ログファイルの内容を表示
for %%F in (logs\*.log) do (
    echo ********** %%~nxF **********
    type "%%F"
    echo.
    echo.
    echo.
)

popd
endlocal