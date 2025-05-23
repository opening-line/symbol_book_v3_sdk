# オフライン（オフチェーン）上で署名を集めるコード
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
  Cosignature,
  TransferTransactionV1,
  AggregateCompleteTransactionV2,
)

from wait_tx_status import wait_tx_status
from binascii import unhexlify

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
  receive_timestamp: int = int(
    network_time["communicationTimestamps"]["receiveTimestamp"]
  )
  deadline_timestamp: int = receive_timestamp + (
    2 * 60 * 60 * 1000
  )  # 2時間後（ミリ秒単位）

  # 転送トランザクション1(accountA=>accountB)
  transfer_tx1: (
    TransferTransactionV1
  ) = facade.transaction_factory.create_embedded({
      "type": "transfer_transaction_v1",
      "recipient_address": account_b.address,
      "mosaics": [],
      "message": b"\0Hello, accountB",
      "signer_public_key": account_a.public_key,  # 署名者の公開鍵
    })

  # 転送トランザクション2(accountA=>accountB)
  transfer_tx2: (
    TransferTransactionV1
  ) = facade.transaction_factory.create_embedded({
      "type": "transfer_transaction_v1",
      "recipient_address": account_a.address,
      "mosaics": [],
      "message": b"\0Hello, accountA!",
      "signer_public_key": account_b.public_key,  # 署名者の公開鍵
    })

  txs = [transfer_tx1, transfer_tx2]

  inner_transaction_hash: Hash256 = (
    facade.hash_embedded_transactions(txs)
  )

  # アグリゲートボンデッドトランザクションを生成
  tx_agg: (
    AggregateCompleteTransactionV2
  ) = facade.transaction_factory.create({
      "type": "aggregate_complete_transaction_v2",
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

  print("署名済みペイロード生成…")

  # ペイロードをJSON形式に変換
  payloadAgg = str(json.loads(json_payload_agg)["payload"])

  print("ペイロード",payloadAgg)

  # メール等何かの方法（オフライン）でpayloadAggを送る
  # ここでは、payloadAggを表示することで確認する

  # ペイロードからTxの復元
  print("ペイロードからTxの復元実施…")
  restored_tx_agg = AggregateCompleteTransactionV2.deserialize(
    unhexlify(payloadAgg)
  )

  # 検証を行い、改ざんされていないことを確認する
  print("署名の検証実施…")
  response_verify = facade.verify_transaction(
    restored_tx_agg,
    restored_tx_agg.signature,
  )

  if not response_verify:
    raise Exception("署名の検証に失敗しました。")
  
  print("署名の検証に成功しました。")  

  cosignB: Cosignature = account_b.cosign_transaction(
    restored_tx_agg
  )

  # 連署者の署名追加
  print("オフライン署名の実施…")  
  restored_tx_agg.cosignatures.append(cosignB)

  json_payload_restored_tx_agg = json.dumps({
      "payload": (restored_tx_agg.serialize()).hex(),
    })

  print("===オフライン署名したトランザクションのアナウンス===")
  print("アナウンス開始")  
  response_restored_tx_agg = requests.put(
    f"{NODE_URL}/transactions",
    headers={"Content-Type": "application/json"},
    data=json_payload_restored_tx_agg,
  ).json()

  print("アナウンス結果", response_restored_tx_agg)

  hash__restored_tx_agg: Hash256 = facade.hash_transaction(
    restored_tx_agg
  )

  await wait_tx_status(
    str(hash__restored_tx_agg), NODE_URL, "confirmed"
  )


if __name__ == "__main__":
  asyncio.run(main())
