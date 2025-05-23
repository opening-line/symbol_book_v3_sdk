# モザイクに対する制限（グローバルモザイク制限）を設定するコード
import os
import random
import requests
import asyncio
from dotenv import load_dotenv
from symbolchain.CryptoTypes import PrivateKey
from symbolchain.facade.SymbolFacade import (
  SymbolFacade,
  SymbolAccount,
  Hash256,
)
from symbolchain.symbol.IdGenerator import generate_mosaic_id
from symbolchain.symbol.Metadata import metadata_generate_key
from symbolchain.sc import (
  Amount,
  Signature,
  MosaicFlags,
  MosaicNonce,
  MosaicRestrictionType,
  TransferTransactionV1,
  AggregateCompleteTransactionV2,
  MosaicDefinitionTransactionV1,
  MosaicSupplyChangeTransactionV1,
  MosaicGlobalRestrictionTransactionV1,
  MosaicAddressRestrictionTransactionV1,
)

from wait_tx_status import wait_tx_status
from send_tx import send_tx
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
  receive_timestamp: int = int(
    network_time["communicationTimestamps"]["receiveTimestamp"]
  )
  deadline_timestamp: int = receive_timestamp + (
    2 * 60 * 60 * 1000
  )  # 2時間後（ミリ秒単位）

  # 事前アカウント生成
  allowed_account1 = facade.create_account(PrivateKey.random())
  allowed_account2 = facade.create_account(PrivateKey.random())
  not_allowed_account1 = facade.create_account(PrivateKey.random())

  print("Allowed Account 1 Address:", allowed_account1.address)
  print("Allowed Account 2 Address:", allowed_account2.address)
  print(
    "Not Allowed Account 1 Address:", not_allowed_account1.address
  )

  fee_amount = 60000000  # 60xym
  recipient_addresses = [allowed_account1.address]

  print("===事前手数料転送トランザクション===")
  # 手数料を送付するトランザクションを生成、署名、アナウンス
  hash_pre: Hash256 = send_transfer_fees(account_a, recipient_addresses, fee_amount)

  await wait_tx_status(
    str(hash_pre), NODE_URL, "confirmed"
  )

  # モザイク定義用のフラグ値（制限付きモザイクを許可）
  mosaic_flags_value: MosaicFlags = (
    MosaicFlags.TRANSFERABLE # 第三者に転送可能
    | MosaicFlags.RESTRICTABLE # グローバルモザイク制限を許可
  )

  nonce: int = random.randint(0, 0xFFFFFFFF)
  mosaic_id: int = generate_mosaic_id(
    allowed_account1.address, nonce
  )

  mosaic_definition_tx: (
    MosaicDefinitionTransactionV1
  ) = facade.transaction_factory.create_embedded({
      "type": "mosaic_definition_transaction_v1",  
      "id": mosaic_id,
      "duration": 0,
      "nonce": MosaicNonce(nonce),
      "flags": mosaic_flags_value,
      "divisibility": 0,
      "signer_public_key": allowed_account1.public_key,  # 署名者の公開鍵
    })

  # モザイク供給量変更トランザクション
  mosaic_supply_change_tx: (
    MosaicSupplyChangeTransactionV1
  ) = facade.transaction_factory.create_embedded({
      "type": "mosaic_supply_change_transaction_v1",  
      "mosaic_id": mosaic_id,
      "delta": 100,
      "action": "increase",
      "signer_public_key": allowed_account1.public_key,  # 署名者の公開鍵
    })

  # グローバルモザイク制限用のキーワードの生成
  # モザイクごとにユニークである必要がある
  key_text = "kyc"
  restrictionKey = metadata_generate_key(key_text)

  mosaic_global_restriction_tx: (
    MosaicGlobalRestrictionTransactionV1
  ) = facade.transaction_factory.create_embedded({
      "type": "mosaic_global_restriction_transaction_v1",  
      "mosaic_id": mosaic_id,  # 制限対象のモザイクID
      "reference_mosaic_id": 0,  # 参照するモザイクID。制限対象のモザイクIDと同じ場合は0
      "restriction_key": restrictionKey,  # グローバルモザイク制限のキー
      "previous_restriction_value": 0,  # キーに対する現在の値（初回は0）
      "new_restriction_value": 1,  # キーに対する新しい値
      "previous_restriction_type": 0,  # 値を比較する現在のタイプ（初回は0）
      # 値を比較する新しいタイプ（EQは同じ値であれば許可）
      "new_restriction_type": MosaicRestrictionType.EQ, 
      "signer_public_key": allowed_account1.public_key,  # 署名者の公開鍵
    })

  txs_gmr = [
    mosaic_definition_tx,
    mosaic_supply_change_tx,
    mosaic_global_restriction_tx,
  ]

  inner_transaction_hash_gmr: Hash256 = (
    facade.hash_embedded_transactions(txs_gmr)
  )

  tx_gmr: (
    AggregateCompleteTransactionV2
  ) = facade.transaction_factory.create({
      "type": "aggregate_complete_transaction_v2",
      "transactions": txs_gmr,
      "transactions_hash": inner_transaction_hash_gmr,
      "signer_public_key": allowed_account1.public_key,
      "deadline": deadline_timestamp,
    })
  tx_gmr.fee = Amount(100 * tx_gmr.size)

  signature_gmr: Signature = allowed_account1.sign_transaction(
    tx_gmr
  )

  json_payload_gmr = facade.transaction_factory.attach_signature(
    tx_gmr, signature_gmr
  )

  print("===制限付きモザイク発行及び転送トランザクション===")
  print("アナウンス開始")  
  response_gmr = requests.put(
    f"{NODE_URL}/transactions",
    headers={"Content-Type": "application/json"},
    data=json_payload_gmr,
  ).json()

  print("アナウンス結果", response_gmr)

  hash_gmr: Hash256 = facade.hash_transaction(tx_gmr)


  await wait_tx_status(
    str(hash_gmr), NODE_URL, "confirmed"
  )

  # モザイクの使用を許可/制限するアドレスとその制限値を設定するトランザクション
  # allowedAccount1に送受信の許可を適応
  mosaic_address_restriction_tx1: (
    MosaicAddressRestrictionTransactionV1
  ) = facade.transaction_factory.create_embedded({
      "type": "mosaic_address_restriction_transaction_v1",  
      "mosaic_id": mosaic_id,  # 制限対象のモザイクID
      "restriction_key": restrictionKey,  # グローバルモザイク制限のキー
      # 現在の値　、初回は 0xFFFFFFFFFFFFFFFF
      "previous_restriction_value": 0xFFFFFFFF_FFFFFFFF, 
      "new_restriction_value": 1,  # 新しい値（比較タイプがEQで値が1なので許可）
      # 発行者自身にも設定しないと送受信できない
      "target_address": allowed_account1.address,
      # 署名者の公開鍵
      "signer_public_key": allowed_account1.public_key,
    })

  # allowedAccount2に送受信の許可を適応
  mosaic_address_restriction_tx2: (
    MosaicAddressRestrictionTransactionV1
  ) = facade.transaction_factory.create_embedded({
      "type": "mosaic_address_restriction_transaction_v1",  
      "mosaic_id": mosaic_id,
      "restriction_key": restrictionKey,
      "previous_restriction_value": 0xFFFFFFFF_FFFFFFFF,
      "new_restriction_value": 1,
      "target_address": allowed_account2.address,
      # 署名者の公開鍵
      "signer_public_key": allowed_account1.public_key, 
    })

  txs_Mar = [
    mosaic_address_restriction_tx1,
    mosaic_address_restriction_tx2,
  ]

  inner_transaction_hash_Mar: Hash256 = (
    facade.hash_embedded_transactions(txs_Mar)
  )

  tx_Mar: (
    AggregateCompleteTransactionV2
  ) = facade.transaction_factory.create({
      "type": "aggregate_complete_transaction_v2",
      "transactions": txs_Mar,
      "transactions_hash": inner_transaction_hash_Mar,
      "signer_public_key": allowed_account1.public_key,
      "deadline": deadline_timestamp,
    })
  tx_Mar.fee = Amount(100 * tx_Mar.size)

  signature_Mar: Signature = allowed_account1.sign_transaction(
    tx_Mar
  )

  json_payload_Mar = facade.transaction_factory.attach_signature(
    tx_Mar, signature_Mar
  )

  print("===制限付きモザイクの送受信許可トランザクション===")
  print("アナウンス開始")  
  response_Mar = requests.put(
    f"{NODE_URL}/transactions",
    headers={"Content-Type": "application/json"},
    data=json_payload_Mar,
  ).json()

  print("アナウンス結果", response_Mar)

  hash_Mar: Hash256 = facade.hash_transaction(tx_Mar)

  await wait_tx_status(
    str(hash_Mar), NODE_URL, "confirmed"
  )

  # allowedAccount1からallowedAccount2への制限モザイクの送付
  tx_tf1: (
    TransferTransactionV1
  ) = facade.transaction_factory.create({
      "type": "transfer_transaction_v1",
      "recipient_address": allowed_account2.address,
      "mosaics": [{"mosaic_id": mosaic_id, "amount": 1}],
      "signer_public_key": allowed_account1.public_key,
      "deadline": deadline_timestamp,
    })

  print("===制限付きモザイクが許可されたアカウントへの転送トランザクション===")
  hash_tf1: Hash256 = send_tx(tx_tf1, allowed_account1)

  await wait_tx_status(
    str(hash_tf1), NODE_URL, "confirmed"
  )

  # allowedAccount1からnotAllowedAccount1への制限モザイクの送付
  # 制限がかかりエラーになることを確認する
  tx_tf2: (
    TransferTransactionV1
  ) = facade.transaction_factory.create({
      "type": "transfer_transaction_v1",
      "recipient_address": not_allowed_account1.address,
      "mosaics": [{"mosaic_id": mosaic_id, "amount": 1}],
      "signer_public_key": allowed_account1.public_key,
      "deadline": deadline_timestamp,
    })

  print("===制限付きモザイクが許可されてないアカウントへの転送トランザクション===")
  print("承認結果がSuccessではなくFailure_xxxになれば成功")  
  hash_tf2: Hash256 = send_tx(tx_tf2, allowed_account1)

  await wait_tx_status(
    str(hash_tf2), NODE_URL, "confirmed"
  )


if __name__ == "__main__":
  asyncio.run(main())
