# トランザクションを生成するコード
import os
import json
import time
import requests
from dotenv import load_dotenv
from symbolchain.CryptoTypes import PrivateKey
from symbolchain.facade.SymbolFacade import (
  SymbolFacade,
  SymbolAccount,
  Hash256,
)
from symbolchain.sc import Amount, Signature, TransferTransactionV1
from convert_hex_values import convert_hex_values

def main() -> None:
  # dotenvの設定
  load_dotenv()

  # Symbolへ接続するためのノードを指定
  NODE_URL: str = os.getenv("NODE_URL") or ""
  facade: SymbolFacade = SymbolFacade("testnet")

  # 秘密鍵からのアカウント復元
  private_key_a: str = os.getenv("PRIVATE_KEY_A") or ""
  account_a: SymbolAccount = facade.create_account(
    PrivateKey(private_key_a)
  )
  private_key_b: str = os.getenv("PRIVATE_KEY_B") or ""
  account_b: SymbolAccount = facade.create_account(
    PrivateKey(private_key_b)
  )

  # ネットワークの現在時刻を取得
  network_time = requests.get(f"{NODE_URL}/node/time").json()
  receive_timestamp: int = int(
    network_time["communicationTimestamps"]["receiveTimestamp"]
  )
  deadline_timestamp: int = receive_timestamp + (
    2 * 60 * 60 * 1000
  )  # 2時間後（ミリ秒単位）

  # トランザクションの生成
  tx: (TransferTransactionV1) = facade.transaction_factory.create({
    "type": "transfer_transaction_v1",  # 転送トランザクション
    "recipient_address": account_b.address,  # 送信先アカウントのアドレス
    "mosaics": [
      {
        # 72C0212E67A08BCEはテストネットの基軸通貨のモザイクID
        "mosaic_id": 0x72C0212E67A08BCE,
        "amount": 1000000,  # 1xym、xymは可分性（小数点以下）が6
      }
    ],
    "message": b"\0Hello, AccountB!",
    "signer_public_key": account_a.public_key,  # 署名者の公開鍵
    "deadline": deadline_timestamp,
  })
  # トランザクション手数料の計算と設定
  tx.fee = Amount(100 * tx.size)  # 手数料乗数、100は最大値

  signature: Signature = account_a.sign_transaction(tx)  # 署名

  # ペイロードを生成しJson形式 => 文字列に整形したもの
  json_payload = facade.transaction_factory.attach_signature(
    tx, signature  # トランザクションを指定  # 署名を指定
  )

  print("===転送トランザクション===")
  # ノードにアナウンスを行う
  print("アナウンス開始")
  response = requests.put(  # 書き込み時はPUTを指定する
    f"{NODE_URL}/transactions",
    headers={"Content-Type": "application/json"},
    data=json_payload,  # 整形されたペイロードを指定
  ).json()

  print("アナウンス結果", response)

  # トランザクションハッシュの生成
  hash: Hash256 = facade.hash_transaction(tx)

  # ノード上でのトランザクションの状態を一秒ごとに確認
  print("confirmed状態まで待機中..")
  for _ in range(100):
    time.sleep(1)
    # トランザクションの状態を確認
    status = requests.get(
      f"{NODE_URL}/transactionStatus/{str(hash)}",
      headers={"Content-Type": "application/json"},
    ).json()
    # トランザクションの状態がconfirmedになっていたら結果を表示させる
    if status["code"] == "ResourceNotFound":
      continue
    elif status["group"] == "confirmed":
      print("confirmed完了!")
      print("承認結果", status["code"])
      print("承認状態", status["group"])
      print("トランザクションハッシュ", hash)
      print("ブロック高", status["height"])
      print("Symbolエクスプローラー ")
      print(f"https://testnet.symbol.fyi/transactions/{hash}")
      break
    elif status["group"] == "failed":
      print("承認結果:", status["code"])
      break
  else:
    raise Exception("トランザクションが確認されませんでした。")

  # トランザクション情報を取得する
  print("トランザクション情報を取得中・・・")
  tx_info = requests.get(
    f"{NODE_URL}/transactions/confirmed/{str(hash)}",
    headers={"Content-Type": "application/json"},
  ).json()

  # オブジェクト内のオブジェクトを展開して表示
  print("トランザクション情報JSON表示",
        json.dumps(tx_info, indent=2))

  # アドレスやメッセージは16進数文字列になっているため表示するには以下変換が必要になる
  # アドレスはAddressオブジェクトに変換後、最終的に文字列に変換
  # メッセージはバイトに変換し、UTF-8形式でデコード。
  # 16進数のアドレスとメッセージを変換する処理を関数化
  print("変換したデータを表示")  
  print("トランザクション情報JSON表示",
    json.dumps(convert_hex_values(tx_info), indent=2))


if __name__ == "__main__":
  main()
