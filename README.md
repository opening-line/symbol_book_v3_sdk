# TypescriptとPythonのSDK及び各種トランザクションの生成

## 動かし方

### Typescrypt  
前提：Node.jsがインストールされていること。動作確認済みバージョンは、22.11.0です。

`typescrypt`フォルダに移動し、依存パッケージをインストール。
```
$ cd typescrypt
$ npm i
```

`.env.sample`をコピーして、`.env`ファイルを作成する。

```bash
$ cp .env.sample .env
```  

`.env`ファイルを開き、`PRIVATE_KEY_A`と`PRIVATE_KEY_B`にそれぞれ別のアカウントの秘密鍵を入力する。  
`PRIVATE_KEY_A`にはxymが入金されたアカウントの秘密鍵を入力する。  

```
PRIVATE_KEY_A=12*************************34
PRIVATE_KEY_B=56*************************78
NODE_URL=https://sym-test-03.opening-line.jp:3001
```

`typescrypt`フォルダから実行する。

```bash
$ npx tsx src/<実行ファイル> 
```  

### Python  
前提：pythonがインストールされていること。動作確認済みバージョンは、3.11.10です。  

`python`フォルダに移動する。  
```
$ cd ../python
```

仮想環境の構築を構築する。(venvの利用を想定)  
```
$ python -m venv .venv
$ source .venv/bin/activate
```

依存パッケージをインストール。
```
$ (.venv) ARCHFLAGS="-arch arm64" # M1 Macの場合はアーキテクチャをarm64にする必要があります。
$ (.venv) pip install -r requirements.txt
```

`.env.sample`をコピーして、`.env`ファイルを作成する。

```bash
$ cp .env.sample .env
```  

`.env`ファイルを開き、`PRIVATE_KEY_A`と`PRIVATE_KEY_B`にそれぞれ別のアカウントの秘密鍵を入力する。  
`PRIVATE_KEY_A`にはxymが入金されたアカウントの秘密鍵を入力する。  

```
PRIVATE_KEY_A=12*************************34
PRIVATE_KEY_B=56*************************78
NODE_URL=https://sym-test-03.opening-line.jp:3001
```

`python`フォルダから実行する。

```bash
$ (.venv) python src/<実行ファイル> 
```  
