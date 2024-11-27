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
$ npx tsx 1_3_1_GenerateAccount.ts
```

## その他
環境変数に必要なアカウントは以下のコマンドで作れます
```
$ npx tsx 1_3_1_GenerateAccount.ts
```