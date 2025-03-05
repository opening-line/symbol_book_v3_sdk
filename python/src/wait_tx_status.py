import time
import requests
from typing import Literal

# トランザクションハッシュを指定してトランザクションの状態を確認する関数
async def wait_tx_status(
  hash: str,
  node_url: str,
  transaction_status: Literal[
    "confirmed", "unconfirmed", "partial"
  ],
) -> None:
  print(f"{transaction_status}状態まで待機中..")
  for _ in range(100):
    time.sleep(1)
    # トランザクションハッシュからステータスを確認
    status = requests.get(
      f"{node_url}/transactionStatus/{hash}",
      headers={"Content-Type": "application/json"},
    ).json()
    # 指定したトランザクションステータスになっていたら結果を表示させる
    if status["code"] == "ResourceNotFound":
      continue
    elif status["group"] == transaction_status:
      print(f"{status['group']}完了!")
      print("承認結果", status["code"])
      print("承認状態", status["group"])
      print("トランザクションハッシュ", hash)
      print("ブロック高", status["height"])
      print("Symbolエクスプローラー ")
      print(f"https://testnet.symbol.fyi/transactions/{hash}")
      return
    elif status["group"] == "failed":
      print("承認結果:", status["code"])
      return

  raise Exception("トランザクションが確認されませんでした。")
