# マルチシグアカウントの構成及びマルチシグアカウントからのトランザクションを行うコード
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
  MultisigAccountModificationTransactionV1,
)

from wait_tx_status import wait_tx_status
from send_transfer_fees import send_transfer_fees

async def main() -> None:
  load_dotenv()

  NODE_URL: str = os.getenv("NODE_URL") or ""
  facade: SymbolFacade = SymbolFacade("testnet")

  private_key_a: str = os.getenv("PRIVATE_KEY_A") or ""
  account_a: SymbolAccount = facade.create_account(
    PrivateKey(private_key_a)
  )

  network_time = requests.get(f"{NODE_URL}/node/time").json()
  receiveTimestamp: int = int(
    network_time["communicationTimestamps"]["receiveTimestamp"]
  )
  deadline_timestamp: int = receiveTimestamp + (
    2 * 60 * 60 * 1000
  )  # 2時間後（ミリ秒単位）

  # 事前アカウント生成
  multisig_account = facade.create_account(PrivateKey.random())
  cosig_account1 = facade.create_account(PrivateKey.random())
  cosig_account2 = facade.create_account(PrivateKey.random())
  cosig_account3 = facade.create_account(PrivateKey.random())
  cosig_account4 = facade.create_account(PrivateKey.random())

  print("Multisig Account Address:", multisig_account.address)
  print("Cosig Account 1 Address:", cosig_account1.address)
  print("Cosig Account 2 Address:", cosig_account2.address)
  print("Cosig Account 3 Address:", cosig_account3.address)
  print("Cosig Account 4 Address:", cosig_account4.address)

  fee_amount = 1000000  # 1xym
  recipient_addresses = [multisig_account.address, cosig_account1.address]

  print("===事前手数料転送トランザクション===")
  # 手数料を送付するトランザクションを生成、署名、アナウンス
  hash_pre: Hash256 = send_transfer_fees(account_a, recipient_addresses, fee_amount)

  await wait_tx_status(
    str(hash_pre), NODE_URL, "confirmed"
  )

  # マルチシグアカウント構成トランザクション
  multisig_account_modification_tx: (
    MultisigAccountModificationTransactionV1
  ) = facade.transaction_factory.create_embedded({
      "type": "multisig_account_modification_transaction_v1",
      "min_removal_delta": 3,  # マルチシグのトランザクションに必要な署名数の増減値
      "min_approval_delta": 3,  # マルチシグの除名に必要な署名数の増減値
      # 追加するアカウントのアドレスリスト
      "address_additions": [
        cosig_account1.address,
        cosig_account2.address,
        cosig_account3.address,
        cosig_account4.address,
      ],
      # 除名するアカウントのアドレスリスト
      'address_deletions': [],
      # マルチシグ化するアカウントの公開鍵を指定
      "signer_public_key": multisig_account.public_key,
    })

  txs_mod = [multisig_account_modification_tx]

  inner_transaction_hash_mod: Hash256 = (
    facade.hash_embedded_transactions(txs_mod)
  )

  tx_mod: (
    AggregateCompleteTransactionV2
  ) = facade.transaction_factory.create({
      "type": "aggregate_complete_transaction_v2",
      "transactions": txs_mod,
      "transactions_hash": inner_transaction_hash_mod,
      "signer_public_key": multisig_account.public_key,
      "deadline": deadline_timestamp,
    })
  tx_mod.fee = Amount(
    100 * (tx_mod.size + 4 * 104)
  )  # 連署者の署名分のサイズ （連署者 ＊ 104）を追加

  signature_mod: Signature = multisig_account.sign_transaction(
    tx_mod
  )
  # 署名の付与
  facade.transaction_factory.attach_signature(tx_mod, signature_mod)

  # マルチシグ構成アカウントの連署
  cosig1: Cosignature = cosig_account1.cosign_transaction(tx_mod)
  # 連署者の署名追加
  tx_mod.cosignatures.append(cosig1)
  cosig2: Cosignature = cosig_account2.cosign_transaction(tx_mod)
  tx_mod.cosignatures.append(cosig2)
  cosig3: Cosignature = cosig_account3.cosign_transaction(tx_mod)
  tx_mod.cosignatures.append(cosig3)
  cosig4: Cosignature = cosig_account4.cosign_transaction(tx_mod)
  tx_mod.cosignatures.append(cosig4)

  # トランザクションをペイロード化 => 文字列に整形
  json_payload_mod = json.dumps({
      "payload": (tx_mod.serialize()).hex(),
    })

  print("===マルチシグアカウント構成トランザクション===")
  print("アナウンス開始")  
  response_mod = requests.put(
    f"{NODE_URL}/transactions",
    headers={"Content-Type": "application/json"},
    data=json_payload_mod,
  ).json()

  print("アナウンス結果", response_mod)

  hash_mod: Hash256 = facade.hash_transaction(tx_mod)

  await wait_tx_status(
    str(hash_mod), NODE_URL, "confirmed"
  )

  # 転送トランザクション(multisigAccount=>accountA)
  transfer_tx: (
    TransferTransactionV1
  ) = facade.transaction_factory.create_embedded({
      "type": "transfer_transaction_v1",
      "recipient_address": account_a.address,
      "mosaics": [],
      "message": b"\0Hello accountA From Multisig Account!",
      # 署名者の公開鍵
      "signer_public_key": multisig_account.public_key,
    })

  txs_tf = [transfer_tx]

  inner_transaction_hash_tf: Hash256 = (
    facade.hash_embedded_transactions(txs_tf)
  )

  tx_tf: (
    AggregateCompleteTransactionV2
  ) = facade.transaction_factory.create({
      "type": "aggregate_complete_transaction_v2",
      "transactions": txs_tf,
      "transactions_hash": inner_transaction_hash_tf,
      # 起案者であるcosigAccount1を指定
      "signer_public_key": cosig_account1.public_key,
      "deadline": deadline_timestamp,
    })
  tx_tf.fee = Amount(
    100 * (tx_tf.size + 2 * 104)
  )  # 連署者の署名分のサイズ （連署者 ＊ 104）を追加

  signature_tf: Signature = cosig_account1.sign_transaction(tx_tf)
  # 署名の付与
  facade.transaction_factory.attach_signature(tx_tf, signature_tf)

  cosig2_tf: Cosignature = cosig_account2.cosign_transaction(tx_tf)
  tx_tf.cosignatures.append(cosig2_tf)
  cosig3_tf: Cosignature = cosig_account3.cosign_transaction(tx_tf)
  tx_tf.cosignatures.append(cosig3_tf)

  json_payload_tf = json.dumps({
      "payload": (tx_tf.serialize()).hex(),
    })

  print("===転送トランザクション（マルチシグアカウントから）===")
  print("アナウンス開始")  
  response_tf = requests.put(
    f"{NODE_URL}/transactions",
    headers={"Content-Type": "application/json"},
    data=json_payload_tf,
  ).json()

  print("アナウンス結果", response_tf)

  hash_tf: Hash256 = facade.hash_transaction(tx_tf)

  await wait_tx_status(
    str(hash_tf), NODE_URL, "confirmed"
  )


if __name__ == "__main__":
  asyncio.run(main())
