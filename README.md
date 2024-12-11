# symbol_book_v3_sdk
1-3章で扱うtypescriptとpythonのSDK及び各種トランザクションの生成

# typescrypt
node v23.3.0

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

## 実行方法
```
$ npx tsx [ファイル名]
```
例
```
$ npx tsx src/1_Transaction.ts
```

## その他
環境変数に必要なアカウントは以下のコマンドで作ることができます
```
$ npx tsx utils/generateAccount.ts
```

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
秘密鍵はtypescript側で生成したものと同じでも問題ない

## 実行方法
```
$ python [ファイル名]
```
例
```
$ python 1_transaction.py
```