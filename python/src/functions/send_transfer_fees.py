import os
import requests
from symbolchain.facade.SymbolFacade import (
  SymbolFacade,
  SymbolAccount,
  Hash256,
)
from symbolchain.sc import Amount, Signature

#  事前に手数料を送付するトランザクションの生成、署名、アナウンスを行う関数
def send_transfer_fees(signAccount: SymbolAccount, recipientAddresses: list, feeAmount: int) -> Hash256:
  NODE_URL: str = os.getenv("NODE_URL") or ""
  facade: SymbolFacade = SymbolFacade("testnet")

  network_time = requests.get(f"{NODE_URL}/node/time").json()
  current_timestamp: int = int(
    network_time["communicationTimestamps"]["receiveTimestamp"]
  )
  deadline_timestamp: int = current_timestamp + (
    2 * 60 * 60 * 1000
  )  # 2時間後（ミリ秒単位）

  transfer_descriptors = [
    {
      "recipient_address": address,
      "mosaics": [{"mosaic_id": 0x72C0212E67A08BCE, "amount": feeAmount}],
      "signer_public_key": signAccount.public_key,
    } for address in recipientAddresses
  ]

  txs_pre = [facade.transaction_factory.create_embedded({
    "type": "transfer_transaction_v1",
    "recipient_address": descriptor["recipient_address"],
    "mosaics": descriptor["mosaics"],
    "signer_public_key": descriptor["signer_public_key"],
  }) for descriptor in transfer_descriptors]

  inner_transaction_hash_pre = facade.hash_embedded_transactions(txs_pre)

  tx_pre = facade.transaction_factory.create({
    "type": "aggregate_complete_transaction_v2",
    "transactions": txs_pre,
    "transactions_hash": inner_transaction_hash_pre,
    "signer_public_key": signAccount.public_key,
    "deadline": deadline_timestamp
  })
  tx_pre.fee = Amount(100 * tx_pre.size)

  signature_pre: Signature = signAccount.sign_transaction(tx_pre)

  json_payload_pre = facade.transaction_factory.attach_signature(tx_pre, signature_pre)

  print("アナウンス開始")
  response = requests.put(
    f"{NODE_URL}/transactions",
    headers={"Content-Type": "application/json"},
    data=json_payload_pre,
  ).json()

  print("アナウンス結果", response)

  return facade.hash_transaction(tx_pre)
