# ネームスペースを登録しアカウントに紐づけるコード
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
from symbolchain.symbol.IdGenerator import generate_namespace_id
from symbolchain.sc import (
  Amount,
  NetworkType,
  NamespaceId,
  AliasAction,
  Signature,
  NamespaceRegistrationTransactionV1,
  AddressAliasTransactionV1,
  AggregateCompleteTransactionV2,
  TransferTransactionV1
)

from convert_hex_values import convert_hex_values
from wait_tx_status import wait_tx_status

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
  deadline_timestamp: int = receive_timestamp + (2 * 60 * 60 * 1000)

  # ルートネームスペース名の指定
  # ブロックチェーン内でユニークである必要があるので、ランダムな英数字文字列を追加する
  root_namespace: str = "namespace_" + os.urandom(5).hex()
  # ネームスペースIDの生成
  root_namespace_id: int = generate_namespace_id(
    root_namespace, 0
  )

  # ネームスペース登録トランザクション
  namespace_registration_tx: (
    NamespaceRegistrationTransactionV1
  ) = facade.transaction_factory.create_embedded({
      "type": "namespace_registration_transaction_v1",
      "id": root_namespace_id,  # ネームスペースID
      "registration_type": "root",  # ルートネームスペースとして登録
      "duration": 86400,  # レンタル期間（ブロック数）
      "parent_id": 0,  # ルートネームスペースの場合は0
      "name": root_namespace,  # レンタルするネームスペース名
      "signer_public_key": account_a.public_key,  # 署名者の公開鍵
    })

  sub_namespace = "tarou"  # サブネームスペース名の指定
  sub_namespace_id = generate_namespace_id(
    sub_namespace, root_namespace_id
  )  # サブネームスペースIDの生成

  sub_namespace_registration_tx: (
    NamespaceRegistrationTransactionV1
  ) = facade.transaction_factory.create_embedded({
      "type": "namespace_registration_transaction_v1",
      "id": sub_namespace_id,  # サブネームスペースID
      "registration_type": "child",  # サブネームスペースとして登録
      "duration": 86400,  # レンタル期間（ブロック数）
      "parent_id": root_namespace_id,  # 親に当たるネームスペースIDを指定
      "name": sub_namespace,  # レンタルするサブネームスペース名
      "signer_public_key": account_a.public_key,  # 署名者の公開鍵
    })

  address_alias_tx: (
    AddressAliasTransactionV1
  ) = facade.transaction_factory.create_embedded({
      "type": "address_alias_transaction_v1",
      "namespace_id": sub_namespace_id,  # リンクするネームスペースID
      "address": account_a.address,  # リンクするアカウントのアドレス
      # リンクする（LINK）、リンクを外す（UNLINK）
      "alias_action": AliasAction.LINK,
      "signer_public_key": account_a.public_key,  # 署名者の公開鍵
    })

  transfer_tx: (
    TransferTransactionV1
  ) = facade.transaction_factory.create_embedded({
      "type": "transfer_transaction_v1",
      "recipient_address": facade.Address.from_namespace_id(
        NamespaceId(sub_namespace_id), NetworkType.TESTNET.value
        ),  # 送信先アカウントをネームスペースで指定
      "mosaics": [],
      "message": b"\0Hello, AccountA!",      
      "signer_public_key": account_a.public_key,  # 署名者の公開鍵
    })

  txs = [
    namespace_registration_tx,
    sub_namespace_registration_tx,
    address_alias_tx,
    transfer_tx
  ]

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

  print("===ネームスペース登録及びリンクトランザクション===")
  print("アナウンス開始")  
  response_agg = requests.put(
    f"{NODE_URL}/transactions",
    headers={"Content-Type": "application/json"},
    data=json_payload_agg,
  ).json()

  print("アナウンス結果", response_agg)

  hash_agg: Hash256 = facade.hash_transaction(tx_agg)

  # トランザクションの状態を確認する処理を関数化
  await wait_tx_status(
    str(hash_agg), NODE_URL, "confirmed"
  )

  # ネームスペース情報を取得する（サブネームスペースの情報）
  await asyncio.sleep(5) # ネームスペース情報が登録されるまでの時差があるため数秒程度待つ  
  
  namespace_id_hex = hex(sub_namespace_id)[2:]  # '0x'を除去
  namespace_info = requests.get(
    f"{NODE_URL}/namespaces/{namespace_id_hex}",
    headers={"Content-Type": "application/json"},
  ).json()

  print(
    "ネームスペース情報JSON表示",
    json.dumps(
      convert_hex_values(namespace_info), indent=2
    )
  )


if __name__ == "__main__":
  asyncio.run(main())
