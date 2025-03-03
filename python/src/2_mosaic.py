# モザイクを生成し送付するコード
import os
import json
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
from symbolchain.sc import (
  Amount,
  Signature,
  MosaicNonce,
  MosaicFlags,
  TransferTransactionV1,
  MosaicDefinitionTransactionV1,
  MosaicSupplyChangeTransactionV1,
  AggregateCompleteTransactionV2,
)

from functions import (
  convert_hex_values_in_object,
  wait_transaction_status,
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
  receiveTimestamp: int = int(
    network_time["communicationTimestamps"]["receiveTimestamp"]
  )
  deadline_timestamp: int = receiveTimestamp + (2 * 60 * 60 * 1000)

  # モザイク定義用のフラグ値
  mosaic_flags_value: MosaicFlags = (
    MosaicFlags.TRANSFERABLE
  )  # 第三者に転送可能
  # モザイクID生成時のノンスの生成
  nonce: int = random.randint(0, 0xFFFFFFFF)
  # モザイクIDの生成
  mosaic_id: int = generate_mosaic_id(account_a.address, nonce)

  # モザイク定義トランザクション
  mosaic_definition_tx: (
    MosaicDefinitionTransactionV1
  ) = facade.transaction_factory.create_embedded({
      "type": "mosaic_definition_transaction_v1",
      "id": mosaic_id,  # モザイクID
      "duration": 0,  # 有効期限
      "nonce": MosaicNonce(nonce),  # ナンス
      "flags": mosaic_flags_value,  # モザイク定義用のフラグ
      "divisibility": 0,  # 可分性 小数点以下の桁数
      "signer_public_key": account_a.public_key,  # 署名者の公開鍵
    })

  # モザイク供給量変更トランザクション
  mosaic_supply_change_tx: (
    MosaicSupplyChangeTransactionV1
  ) = facade.transaction_factory.create_embedded({
      "type": "mosaic_supply_change_transaction_v1",
      "mosaic_id": mosaic_id,  # モザイクID
      "delta": 100,  # 供給量
      "action": "increase",  # 増やす(increase)減らす(decrease)
      "signer_public_key": account_a.public_key,  # 署名者の公開鍵
    })

  # 転送トランザクション
  transfer_tx: (
    TransferTransactionV1
  ) = facade.transaction_factory.create_embedded({
      "type": "transfer_transaction_v1",
      "recipient_address": account_b.address,  # 送信先アカウントのアドレス
      "mosaics": [
        {
          "mosaic_id": mosaic_id,  # 生成したモザイクID
          "amount": 1,  # 1mosaic
        }
      ],
      "signer_public_key": account_a.public_key,  # 署名者の公開鍵
    })

  txs = [mosaic_definition_tx, mosaic_supply_change_tx, transfer_tx]

  # インナー（アグリゲートに内包する）トランザクションのハッシュを生成
  inner_transaction_hash: Hash256 = (
    facade.hash_embedded_transactions(txs)
  )

  # アグリゲートトランザクションを生成
  tx_agg: (
    AggregateCompleteTransactionV2
  ) = facade.transaction_factory.create({
      "type": "aggregate_complete_transaction_v2",
      "transactions": txs,  # インナートランザクションを指定
      # インナートランザクションのハッシュを指定
      "transactions_hash": inner_transaction_hash,
      "signer_public_key": account_a.public_key,  # 署名者の公開鍵
      # 有効期限はアグリゲートトランザクション側で指定する
      "deadline": deadline_timestamp,
    })
  tx_agg.fee = Amount(100 * tx_agg.size)

  signature_agg: Signature = account_a.sign_transaction(tx_agg)

  # ペイロードの生成
  json_payload_agg = facade.transaction_factory.attach_signature(
    tx_agg, signature_agg
  )

  print("===モザイク発行及び転送トランザクション===")
  # ノードにアナウンスを行う
  print("アナウンス開始")  
  response_agg = requests.put(
    f"{NODE_URL}/transactions",
    headers={"Content-Type": "application/json"},
    data=json_payload_agg,
  ).json()

  print("アナウンス結果", response_agg)

  # トランザクションハッシュの生成
  hash_agg: Hash256 = facade.hash_transaction(tx_agg)

  # トランザクションの状態を確認する処理を関数化
  await wait_transaction_status(
    str(hash_agg), NODE_URL, "confirmed"
  )

  # モザイク情報を取得する
  await asyncio.sleep(5) # モザイクが生成されるまでの時差があるため数秒程度待つ

  mosaic_id_hex = hex(mosaic_id)[2:]  # '0x'を除去
  mosaic_info = requests.get(
    f"{NODE_URL}/mosaics/{mosaic_id_hex}",
    headers={"Content-Type": "application/json"},
  ).json()

  print(
    "モザイク情報JSON表示",    
    json.dumps(
      convert_hex_values_in_object(mosaic_info), indent=2
    )
  )


if __name__ == "__main__":
  asyncio.run(main())  # asyncio.runを使用して非同期関数を実行
