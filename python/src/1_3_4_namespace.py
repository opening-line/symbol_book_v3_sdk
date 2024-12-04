
# ネームスペースを登録しアカウントに紐づけるコード
import os
import sys
import json
import random
import requests
import asyncio
from dotenv import load_dotenv
from symbolchain.CryptoTypes import PrivateKey
from symbolchain.facade.SymbolFacade import SymbolFacade, SymbolAccount, Hash256
from symbolchain.symbol.IdGenerator import generate_namespace_id
from symbolchain.sc import NamespaceId, AliasAction, Signature, NamespaceRegistrationTransactionV1, AddressAliasTransactionV1, AggregateCompleteTransactionV2
from typing import Any, Dict
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from functions.convert_hex_values_in_object import convert_hex_values_in_object
from functions.await_transaction_status import await_transaction_status

async def main() -> None:
    load_dotenv()

    NODE_URL: str = "https://sym-test-03.opening-line.jp:3001"
    facade: SymbolFacade = SymbolFacade('testnet')

    private_key_a: str = os.getenv('PRIVATE_KEY_A') or ""
    account_a: SymbolAccount = facade.create_account(PrivateKey(private_key_a))

    network_time: Dict[str, Any] = requests.get(f"{NODE_URL}/node/time").json()
    current_timestamp: int = int(network_time['communicationTimestamps']['receiveTimestamp'])
    deadline_timestamp: int = current_timestamp + (2 * 60 * 60 * 1000)  # 2時間後（ミリ秒単位）

    # ルートネームスペース名の指定
    # ブロックチェーン内でユニークである必要があるので、ランダムな英数字文字列を追加する
    root_namespace: str = "namespace_" + ''.join(random.sample('abcdefghijklmnopqrstuvwxyz0123456789', 5))
    # ネームスペースIDの生成
    root_namespace_id: int = generate_namespace_id(root_namespace, 0)

    # ネームスペース登録トランザクション
    namespace_registration_tx: NamespaceRegistrationTransactionV1 = facade.transaction_factory.create_embedded({
        'type': 'namespace_registration_transaction_v1', # トランザクションタイプの指定
        'id': root_namespace_id, # ネームスペースID
        'registration_type': 'root',  # ルートネームスペースとして登録
        'duration': 86400,  # レンタル期間（ブロック数）
        'parent_id': 0, # ルートネームスペースの場合は0
        'name': root_namespace, # レンタルするネームスペース名
        'signer_public_key': account_a.public_key, # 署名者の公開鍵        
    })

    sub_namespace = "tarou"  # サブネームスペース名の指定
    sub_namespace_id = generate_namespace_id(sub_namespace, root_namespace_id)  # サブネームスペースIDの生成

    sub_namespace_registration_tx: NamespaceRegistrationTransactionV1 = facade.transaction_factory.create_embedded({
        'type': 'namespace_registration_transaction_v1',  # トランザクションタイプの指定
        'id': sub_namespace_id,  # サブネームスペースID
        'registration_type': 'child',  # サブネームスペースとして登録
        'duration': 86400,  # レンタル期間（ブロック数）
        'parent_id': root_namespace_id,  # 親に当たるネームスペースIDを指定
        'name': sub_namespace,  # レンタルするサブネームスペース名
        'signer_public_key': account_a.public_key, # 署名者の公開鍵        
    })

    address_alias_tx: AddressAliasTransactionV1 = facade.transaction_factory.create_embedded({
        'type': 'address_alias_transaction_v1',  # ネームスペースをアドレスにリンクするトランザクション
        'namespace_id': root_namespace_id,  # リンクするネームスペースID
        'address': account_a.address,  # リンクするアカウントのアドレス
        'alias_action': AliasAction.LINK, # リンクする（LINK）、リンクを外す（UNLINK）
        'signer_public_key': account_a.public_key, # 署名者の公開鍵        
    })

    txs = [
        namespace_registration_tx,
        sub_namespace_registration_tx,
        address_alias_tx,
    ]

    # インナー（アグリゲートに内包する）トランザクションのハッシュを生成
    inner_transaction_hash: Hash256 = facade.hash_embedded_transactions(txs)

    # アグリゲートトランザクションを生成
    agg_tx: AggregateCompleteTransactionV2 = facade.transaction_factory.create({
        'type': 'aggregate_complete_transaction_v2', # トランザクションタイプの指定
        'transactions': txs, # インナートランザクションを指定
        'transactions_hash': inner_transaction_hash, # インナートランザクションのハッシュを指定
        'signer_public_key': account_a.public_key, # 署名者の公開鍵
        'fee': 1000000, # 手数料はアグリゲートトランザクション側で指定する
        'deadline': deadline_timestamp # 有効期限はアグリゲートトランザクション側で指定する
    })

    agg_signature: Signature = account_a.sign_transaction(agg_tx)
    
    # ペイロードの生成
    agg_json_payload = facade.transaction_factory.attach_signature(agg_tx, agg_signature)

    # ノードにアナウンスを行う
    agg_response = requests.put(
        f"{NODE_URL}/transactions",
        headers={"Content-Type": "application/json"},
        data=agg_json_payload
    ).json()

    print("Response:", agg_response)

    # トランザクションハッシュの生成
    hash: Hash256 = facade.hash_transaction(agg_tx)
    
    print("===ネームスペース登録及びリンクトランザクション===")

    # トランザクションの状態を確認する処理を関数化
    await await_transaction_status(
        str(hash),
        NODE_URL,
        "confirmed"
    )

    # ネームスペース情報を取得する（サブネームスペースの情報）
    namespace_id_hex = hex(sub_namespace_id)[2:]  # '0x'を除去
    namespace_info = requests.get(
        f"{NODE_URL}/namespaces/{namespace_id_hex}",
        headers={"Content-Type": "application/json"}
    ).json()

    print(json.dumps(convert_hex_values_in_object(namespace_info), indent=2))

if __name__ == "__main__":
    asyncio.run(main())