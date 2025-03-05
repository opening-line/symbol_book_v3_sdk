# アカウントに対する制限を設定するコード
import os
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
  AccountRestrictionFlags,
  TransactionType,
  UnresolvedMosaicId,
  TransferTransactionV1,
  AccountAddressRestrictionTransactionV1,
  AccountMosaicRestrictionTransactionV1,
  AccountOperationRestrictionTransactionV1,
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
  receiveTimestamp: int = int(
    network_time["communicationTimestamps"]["receiveTimestamp"]
  )
  deadline_timestamp: int = receiveTimestamp + (
    2 * 60 * 60 * 1000
  )  # 2時間後（ミリ秒単位）

  # 事前アカウント生成
  restricted_account1 = facade.create_account(PrivateKey.random())
  restricted_account2 = facade.create_account(PrivateKey.random())
  restricted_account3 = facade.create_account(PrivateKey.random())

  print(
    "Restricted Account 1 Address:", restricted_account1.address
  )
  print(
    "Restricted Account 2 Address:", restricted_account2.address
  )
  print(
    "Restricted Account 3 Address:", restricted_account3.address
  )

  fee_amount = 1000000  # 1xym
  recipient_addresses = [
    restricted_account1.address,
    restricted_account2.address,
    restricted_account3.address    
  ]

  print("===事前手数料転送トランザクション===")
  # 手数料を送付するトランザクションを生成、署名、アナウンス
  hash_pre: Hash256 = send_transfer_fees(account_a, recipient_addresses, fee_amount)

  await wait_tx_status(
    str(hash_pre), NODE_URL, "confirmed"
  )

  # 特定のアドレスからの受信禁止制限フラグ値
  # (restrictedAccount1に対してaccountAからの受信を禁止)
  block_incoming_address_flag_value: AccountRestrictionFlags = (
    AccountRestrictionFlags.ADDRESS  # 制限対象 アカウント
    | AccountRestrictionFlags.BLOCK  # 制限内容 拒否
  )

  # アカウント制限トランザクション
  tx_rr1: (
    AccountAddressRestrictionTransactionV1
  ) = facade.transaction_factory.create({
      "type": "account_address_restriction_transaction_v1",
      # フラグの指定
      "restriction_flags": block_incoming_address_flag_value,
      "restriction_additions": [
        account_a.address
      ],  # 対象アドレスリスト（署名するアカウントではない事に注意）
      "restriction_deletions": [],  # 解除対象アドレスリスト
      # 署名者の公開鍵
      "signer_public_key": restricted_account1.public_key,
      "deadline": deadline_timestamp,
    })

  print("===アカウント受信禁止トランザクション===")
  hash_rr1: Hash256 = send_tx(tx_rr1, restricted_account1)

  await wait_tx_status(
    str(hash_rr1), NODE_URL, "confirmed"
  )

  # アカウント受信禁止トランザクションの確認
  # 制限がかかりエラーになることを確認する
  tx_tf1: (
    TransferTransactionV1
  ) = facade.transaction_factory.create({
      "type": "transfer_transaction_v1",
      "recipient_address": restricted_account1.address,
      "mosaics": [],
      "message": b"\0Hello, restrictedAccount1!",
      "signer_public_key": account_a.public_key,  # 署名者の公開鍵
      "deadline": deadline_timestamp,
    })

  print("===確認用アカウント受信禁止トランザクション===")
  print("承認結果がSuccessではなくFailure_xxxになれば成功")
  hash_tf1: Hash256 = send_tx(tx_tf1, account_a)

  await wait_tx_status(
    str(hash_tf1), NODE_URL, "confirmed"
  )

  # 特定のアドレスからの受信禁止制限フラグ値
  # (restrictedAccount2に対してxymの受信を禁止)
  block_mosaic_flags_value: AccountRestrictionFlags = (
    AccountRestrictionFlags.MOSAIC_ID  # 制限対象 モザイク
    | AccountRestrictionFlags.BLOCK  # 制限内容 拒否
  )

  # アカウント制限トランザクション
  tx_rr2: (
    AccountMosaicRestrictionTransactionV1
  ) = facade.transaction_factory.create({
      "type": "account_mosaic_restriction_transaction_v1",
      "restriction_flags": block_mosaic_flags_value,  # フラグの指定
      "restriction_additions": [
        UnresolvedMosaicId(0x72C0212E67A08BCE)
      ],  # 対象モザイクリスト
      "restriction_deletions": [],  # 解除対象モザイクリスト
      # 署名者の公開鍵
      "signer_public_key": restricted_account2.public_key,
      "deadline": deadline_timestamp,
    })

  print("===モザイク受信禁止トランザクション===")
  hash_rr2: Hash256 = send_tx(tx_rr2, restricted_account2)

  await wait_tx_status(
    str(hash_rr2), NODE_URL, "confirmed"
  )

  # モザイク受信禁止トランザクションの確認
  # 制限がかかりエラーになることを確認する
  tx_tf2: (
    TransferTransactionV1
  ) = facade.transaction_factory.create({
      "type": "transfer_transaction_v1",
      "recipient_address": restricted_account2.address,
      "mosaics": [
        {
          "mosaic_id": 0x72C0212E67A08BCE,
          "amount": 1000000,  # 1xym
        }
      ],
      "signer_public_key": account_a.public_key,  # 署名者の公開鍵
      "deadline": deadline_timestamp,
    })

  print("===確認用モザイク受信禁止トランザクション===")
  print("承認結果がSuccessではなくFailure_xxxになれば成功")
  hash_tf2: Hash256 = send_tx(tx_tf2, account_a)

  await wait_tx_status(
    str(hash_tf2), NODE_URL, "confirmed"
  )

  # 特定のトランザクションの送信禁止制限フラグ
  # (restrictedAccount3の転送トランザクションの送信を禁止)
  accountOperationRestrictionFlagsValue: AccountRestrictionFlags = (
    AccountRestrictionFlags.TRANSACTION_TYPE  # 制限対象 トランザクションタイプ
    | AccountRestrictionFlags.BLOCK  # 制限内容 拒否
    | AccountRestrictionFlags.OUTGOING  # 制限の方向送信のみ
  )

  # トランザクション制限トランザクション
  tx_rr3: (
    AccountOperationRestrictionTransactionV1
  ) = facade.transaction_factory.create({
      "type": "account_operation_restriction_transaction_v1",
      # フラグの指定
      "restriction_flags": accountOperationRestrictionFlagsValue,
      "restriction_additions": [
        TransactionType.TRANSFER
      ],  # 対象のトランザクションタイプリスト
      "restriction_deletions": [],  # 解除対象のトランザクションタイプリスト
      # 署名者の公開鍵
      "signer_public_key": restricted_account3.public_key,
      "deadline": deadline_timestamp,
    })

  print("===トランザクション送信禁止トランザクション===")
  hash_rr3: Hash256 = send_tx(tx_rr3, restricted_account3)

  await wait_tx_status(
    str(hash_rr3), NODE_URL, "confirmed"
  )

  # トランザクション送信禁止トランザクションの確認
  # 制限がかかりエラーになることを確認する
  tx_tf3: (
    TransferTransactionV1
  ) = facade.transaction_factory.create({
      "type": "transfer_transaction_v1",
      "recipient_address": account_a.address,
      "mosaics": [],
      "message": b"\0Hello, accountA!!",
      # 署名者の公開鍵
      "signer_public_key": restricted_account3.public_key,
      "deadline": deadline_timestamp,
    })

  print("===確認用トランザクション送信禁止トランザクション===")
  print("承認結果がSuccessではなくFailure_xxxになれば成功")
  hash_tf3: Hash256 = send_tx(tx_tf3, restricted_account3)

  await wait_tx_status(
    str(hash_tf3), NODE_URL, "confirmed"
  )


if __name__ == "__main__":
  asyncio.run(main())
