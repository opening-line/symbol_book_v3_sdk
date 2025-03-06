# メタデータをアカウントに紐づけるコード
import os
import json
import dotenv
import requests
import asyncio
from symbolchain.CryptoTypes import PrivateKey
from symbolchain.facade.SymbolFacade import (
  SymbolFacade,
  SymbolAccount,
  Hash256,
)
from symbolchain.symbol.Metadata import (
  metadata_generate_key,
  metadata_update_value,
)
from symbolchain.sc import (
  Amount,
  Signature,
  AccountMetadataTransactionV1,
  AggregateCompleteTransactionV2,
)

from convert_hex_values import convert_hex_values
from wait_tx_status import wait_tx_status

async def main() -> None:
  dotenv.load_dotenv()

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
  deadline_timestamp: int = receive_timestamp + (2 * 60 * 60 * 1000)

  # メタデータのキーの指定
  # 紐づける対象で同じキーを指定した場合は上書きとなる。今回はユニークなキーを指定する
  key_text = "key_" + os.urandom(5).hex()
  # メタデータの値の指定
  value_text = "test"
  # bigIntに変換
  metadata_key = metadata_generate_key(key_text)
  # 古い値を新しい値に更新するためのメタデータペイロードを作成
  metadata_value = metadata_update_value(
    "".encode("utf8"),  # 古い値を指定 （初回は空文字）
    value_text.encode("utf-8"),  # 新しい値を指定
  )

  # メタデータのトランザクションを生成
  metadata_tx: (
    AccountMetadataTransactionV1
  ) = facade.transaction_factory.create_embedded({
      "type": "account_metadata_transaction_v1",
      "target_address": account_a.address,  # 紐付ける対象のアカウントアドレス
      "scoped_metadata_key": metadata_key,  # 紐づけるメタデータのキー
      "value": metadata_value,  # 紐づけるメタデータの値
      "value_size_delta": len(metadata_value),  # 紐づけるメタデータの長さ
      "signer_public_key": account_a.public_key,  # 署名者の公開鍵
    })

  txs = [metadata_tx]

  inner_transaction_hash: Hash256 = (
    facade.hash_embedded_transactions(txs)
  )

  tx_agg: (
    AggregateCompleteTransactionV2
  ) = facade.transaction_factory.create({
      "type": "aggregate_complete_transaction_v2",
      "transactions": txs,
      "transactions_hash": inner_transaction_hash,
      "signer_public_key": account_a.public_key,
      "deadline": deadline_timestamp,
    })
  tx_agg.fee = Amount(100 * tx_agg.size)

  signature_agg: Signature = account_a.sign_transaction(tx_agg)

  json_payload_agg = facade.transaction_factory.attach_signature(
    tx_agg, signature_agg
  )

  print("===アカウントメタデータトランザクション===")
  print("アナウンス開始")  
  response_agg = requests.put(
    f"{NODE_URL}/transactions",
    headers={"Content-Type": "application/json"},
    data=json_payload_agg,
  ).json()

  print("アナウンス結果", response_agg)

  hash_agg: Hash256 = facade.hash_transaction(tx_agg)

  await wait_tx_status(
    str(hash_agg), NODE_URL, "confirmed"
  )

  # メタデータ情報を取得する(アドレスに設定されているメタデータ一覧)
  query1 = {
    "targetAddress": str(account_a.address),  # 設定されたアカウントアドレス
  }

  metadata_info1 = requests.get(
    f"{NODE_URL}/metadata", params=query1
  ).json()

  print(
    "メタデータ情報アドレス検索結果JSON表示",
    json.dumps(
      convert_hex_values(metadata_info1), indent=2
    )
  )

  # メタデータ情報を取得する(メタデータキーが指定されているメタデータ一覧)
  # targetAddressを見ることで、特定のメタデータキーが付与されたアドレス一覧を作成できる
  query2 = {
    "scopedMetadataKey": hex(metadata_key)[2:],  # '0x'を除去
    "metadataType": "0",  # アカウントメタデータは0
  }

  metadata_info2 = requests.get(
    f"{NODE_URL}/metadata", params=query2
  ).json()

  print(
    "メタデータ情報メタデータキー検索結果JSON表示",    
    json.dumps(
      convert_hex_values(metadata_info2), indent=2
    )
  )


if __name__ == "__main__":
  asyncio.run(main())
