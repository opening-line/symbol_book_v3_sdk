# アグリゲートボンデッドトランザクションをハッシュロックし、オンチェーン上で連署を行う
import os
import json
import requests
import asyncio
from dotenv import load_dotenv
from symbolchain.CryptoTypes import PrivateKey
from symbolchain.facade.SymbolFacade import (
  SymbolFacade,
  SymbolAccount,
  Hash256,
)
from symbolchain.sc import (
  Amount,
  Signature,
  TransferTransactionV1,
  AggregateBondedTransactionV2,
  HashLockTransactionV1,
)

from functions import (
  convert_hex_values_in_object,
  wait_transaction_status,
  send_transaction,
)

async def main() -> None:
  load_dotenv()

  NODE_URL: str = os.getenv("NODE_URL") or ""
  facade: SymbolFacade = SymbolFacade("testnet")

  private_key_a: str = os.getenv("PRIVATE_KEY_A") or ""
  account_a: SymbolAccount = facade.create_account(
    PrivateKey(private_key_a)
  )
  private_key_b: str = os.getenv("PRIVATE_KEY_B") or ""
  account_b: SymbolAccount = facade.create_account(
    PrivateKey(private_key_b)
  )

  network_time = requests.get(f"{NODE_URL}/node/time").json()
  current_timestamp: int = int(
    network_time["communicationTimestamps"]["receiveTimestamp"]
  )
  deadline_timestamp: int = current_timestamp + (
    2 * 60 * 60 * 1000
  )  # 2時間後（ミリ秒単位）

  # 転送トランザクション1(accountA=>accountB)
  transfer_tx1: (
    TransferTransactionV1
  ) = facade.transaction_factory.create_embedded({
      "type": "transfer_transaction_v1",
      "recipient_address": account_b.address,
      "mosaics": [
        {
          "mosaic_id": 0x72C0212E67A08BCE,
          "amount": 1000000,  # 1xym
        }
      ],
      "message": b"\0Send 1xym",
      "signer_public_key": account_a.public_key,  # 署名者の公開鍵
    })

  # 転送トランザクション2(accountA=>accountB)
  transfer_tx2: (
    TransferTransactionV1
  ) = facade.transaction_factory.create_embedded({
      "type": "transfer_transaction_v1",
      "recipient_address": account_a.address,
      "mosaics": [],
      "message": b"\0Thank you!",
      "signer_public_key": account_b.public_key,  # 署名者の公開鍵
    })

  txs = [transfer_tx1, transfer_tx2]

  inner_transaction_hash: Hash256 = (
    facade.hash_embedded_transactions(txs)
  )

  # アグリゲート本デッドトランザクションを生成
  tx_agg: (
    AggregateBondedTransactionV2
  ) = facade.transaction_factory.create({
      "type": "aggregate_bonded_transaction_v2",
      "transactions": txs,
      "transactions_hash": inner_transaction_hash,
      "signer_public_key": account_a.public_key,
      "deadline": deadline_timestamp,
    })
  tx_agg.fee = Amount(
    100 * (tx_agg.size + 1 * 104)
  )  # 連署者の署名分のサイズ （連署者 ＊ 104）を追加

  signature_agg: Signature = account_a.sign_transaction(tx_agg)
  json_payload_agg = facade.transaction_factory.attach_signature(
    tx_agg, signature_agg
  )

  # ハッシュロックに必要なトランザクションハッシュの生成
  hash_agg: Hash256 = facade.hash_transaction(tx_agg)

  # ハッシュロックトランザクションの生成
  hash_lock_tx: (
    HashLockTransactionV1
  ) = facade.transaction_factory.create({
      "type": "hash_lock_transaction_v1",
      "mosaic": {
        "mosaic_id": 0x72C0212E67A08BCE,
        "amount": 10000000,  # ロック用に固定で10xymを預ける
      },
      "duration": 5760,  # ロック期間（ブロック数）
      "hash": hash_agg,  # ロックしたいトランザクションのハッシュ
      "signer_public_key": account_a.public_key,  # 署名者の公開鍵
      "deadline": deadline_timestamp,
    })

  print("===ハッシュロックトランザクション===")
  # アグリゲートでないトランザクションは生成からアナウンスまで同じ処理なので関数化
  hash_lock_hash: Hash256 = send_transaction(
    hash_lock_tx, account_a
  )

  await wait_transaction_status(
    str(hash_lock_hash), NODE_URL, "confirmed"
  )

  # ハッシュロックトランザクションが全ノードに伝播されるまで一秒ほど時間を置く
  await asyncio.sleep(1)

  print("===アグリゲートボンデッドトランザクション===")
  # アグリゲートボンデッドトランザクションのアナウンス
  print("アナウンス開始")  
  response_agg = requests.put(
    # エンドポイントがに/transactions/partialであることに注意
    f"{NODE_URL}/transactions/partial",
    headers={"Content-Type": "application/json"},
    data=json_payload_agg,
  ).json()

  print("アナウンス結果", response_agg)

  # partial（オンチェーン上で連署待ちの状態）の確認
  await wait_transaction_status(str(hash_agg), NODE_URL, "partial")

  # アカウントBが連署を必要とするトランザクションを検出する処理
  query = {
    "signerPublicKey": str(account_b.public_key),
    "embedded": "true", #インナートランザクションも検索の対象にする
    "order":"desc" #新しい順に結果を返す    
  }

  tx_search_info = requests.get(
    f"{NODE_URL}/transactions/partial?", params=query
  ).json()

  print(
    "アグリゲートボンデッドトランザクションJSON表示",    
    json.dumps(
      convert_hex_values_in_object(tx_search_info), indent=2
    )
  )
  
  hash_agg_string = tx_search_info["data"][0]["meta"]["aggregateHash"]
  hash_agg_restore: Hash256 = Hash256(hash_agg_string)

  # 連署者による署名
  cosignature_request = account_b.cosign_transaction_hash(
      hash_agg_restore, 
      True
  ).to_json()
  cosignature_request_snake_case = {
      "version": cosignature_request["version"],
      "signerPublicKey": cosignature_request["signer_public_key"],
      "signature": cosignature_request["signature"],
      "parentHash": cosignature_request["parent_hash"],
  }

  print("===アグリゲートボンデッドトランザクションへの連署===")
  print("アナウンス開始")
  response_cos = requests.put(
    # エンドポイントが/transactions/cosignatureであることに注意
    f"{NODE_URL}/transactions/cosignature",
    headers={"Content-Type": "application/json"},
    data=json.dumps(cosignature_request_snake_case),
  ).json()

  print("アナウンス結果", response_cos)

  await wait_transaction_status(
    hash_agg_string,
    NODE_URL,
    "confirmed",
  )


if __name__ == "__main__":
  asyncio.run(main())
