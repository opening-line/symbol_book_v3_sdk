# symbol_book_v3_sdk
1-3章で扱うtypescriptとpythonのSDK及び各種トランザクションの生成

# typescrypt
node v22系を使用する

## 環境構築手順
モジュールのインストール
```
$ cd typescrypt
$ npm i
```
環境変数の設定
```
$ cp .env.sample .env
```

## 環境変数に必要なアカウント  
環境変数に必要なアカウントは以下のコマンドで作ることができます

```
$ npx tsx src/utils/generateAccount.ts
```

## 実行方法
```
$ npx tsx [ファイル名]
```
例
```
$ npx tsx src/1_Transaction.ts
```

## typescript一括実行
typescriptのすべてのコードを実行したい場合は以下スクリプトを実行します。
```
mac
$ scripts/run-all.sh
windows
$ scripts/run-all.bat
```
実行結果はコンソール上に表示、およびscripts/logディレクトリにログとして生成されます。

# python
pyenv 2.4.19
python 3.11.10

## 環境構築手順
仮想環境の構築
```
$ python -m venv .venv
```
仮想環境に接続
```
$ source .venv/bin/activate
```
pythonのバージョンを指定
```
$ pyenv install 3.11.10
```
モジュールのインストール
```
$ pip install -r requirements.txt
```
環境変数の設定
```
$ cp .env.sample .env
```

## 環境変数に必要なアカウント  
秘密鍵はtypescript側で生成したものと同じでも問題ありませんが  
pythonのコードで生成する場合は以下の通りです  

```
$ python src/utils/generate_account.py
```

## 実行方法
```
$ python [ファイル名]
```
例
```
$ python src/1_transaction.py
```

## python一括実行
pythonのすべてのコードを実行したい場合は以下スクリプトを実行します。
```
mac
$ scripts/run-all.sh
windows
$ scripts/run-all.bat
```
実行結果はコンソール上に表示、およびscripts/logディレクトリにログとして生成されます。
