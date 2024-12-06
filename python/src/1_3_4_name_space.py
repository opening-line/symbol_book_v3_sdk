# ネームスペースを登録しアカウントに紐づけるコード
import os
import sys
import json
import requests
import asyncio
from dotenv import load_dotenv
from symbolchain.CryptoTypes import PrivateKey
from symbolchain.facade.SymbolFacade import SymbolFacade, SymbolAccount, Hash256
from symbolchain.symbol.IdGenerator import generate_namespace_id
from symbolchain.sc import Amount, Signature, AliasAction, NamespaceRegistrationTransactionV1, AddressAliasTransactionV1, AggregateCompleteTransactionV2
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from functions.convert_hex_values_in_object import convert_hex_values_in_object
from functions.await_transaction_status import await_transaction_status

async def main() -> None:
    load_dotenv()

    NODE_URL: str = "https://sym-test-03.opening-line.jp:3001"
    facade: SymbolFacade = SymbolFacade('testnet')

    private_key_a: str = os.getenv('PRIVATE_KEY_A') or ""
    account_a: SymbolAccount = facade.create_account(PrivateKey(private_key_a))

    network_time = requests.get(f"{NODE_URL}/node/time").json()
    current_timestamp: int = int(network_time['communicationTimestamps']['receiveTimestamp'])
    deadline_timestamp: int = current_timestamp + (2 * 60 * 60 * 1000)  # 2時間後（ミリ秒単位）

    # ルートネームスペース名の指定
    # ブロックチェーン内でユニークである必要があるので、ランダムな英数字文字列を追加する
    root_name_space: str = "namespace_" + os.urandom(5).hex()
    # ネームスペースIDの生成
    root_name_space_id: int = generate_namespace_id(root_name_space, 0)

    # ネームスペース登録トランザクション
    name_space_registration_tx: NamespaceRegistrationTransactionV1 = facade.transaction_factory.create_embedded({
        'type': 'namespace_registration_transaction_v1', # トランザクションタイプの指定
        'id': root_name_space_id, # ネームスペースID
        'registration_type': 'root',  # ルートネームスペースとして登録
        'duration': 86400,  # レンタル期間（ブロック数）
        'parent_id': 0, # ルートネームスペースの場合は0
        'name': root_name_space, # レンタルするネームスペース名
        'signer_public_key': account_a.public_key, # 署名者の公開鍵        
    })

    sub_name_space = "tarou"  # サブネームスペース名の指定
    sub_name_space_id = generate_namespace_id(sub_name_space, root_name_space_id)  # サブネームスペースIDの生成

    sub_name_space_registration_tx: NamespaceRegistrationTransactionV1 = facade.transaction_factory.create_embedded({
        'type': 'namespace_registration_transaction_v1',  # トランザクションタイプの指定
        'id': sub_name_space_id,  # サブネームスペースID
        'registration_type': 'child',  # サブネームスペースとして登録
        'duration': 86400,  # レンタル期間（ブロック数）
        'parent_id': root_name_space_id,  # 親に当たるネームスペースIDを指定
        'name': sub_name_space,  # レンタルするサブネームスペース名
        'signer_public_key': account_a.public_key, # 署名者の公開鍵        
    })

    address_alias_tx: AddressAliasTransactionV1 = facade.transaction_factory.create_embedded({
        'type': 'address_alias_transaction_v1',  # ネームスペースをアドレスにリンクするトランザクション
        'namespace_id': root_name_space_id,  # リンクするネームスペースID
        'address': account_a.address,  # リンクするアカウントのアドレス
        'alias_action': AliasAction.LINK, # リンクする（LINK）、リンクを外す（UNLINK）
        'signer_public_key': account_a.public_key, # 署名者の公開鍵        
    })

    txs = [
        name_space_registration_tx,
        sub_name_space_registration_tx,
        address_alias_tx,
    ]

    inner_transaction_hash: Hash256 = facade.hash_embedded_transactions(txs)

    tx_agg: AggregateCompleteTransactionV2 = facade.transaction_factory.create({
        'type': 'aggregate_complete_transaction_v2',
        'transactions': txs,
        'transactions_hash': inner_transaction_hash,
        'signer_public_key': account_a.public_key,
        'deadline': deadline_timestamp
    })
    tx_agg.fee = Amount(100 * tx_agg.size)

    signature_agg: Signature = account_a.sign_transaction(tx_agg)
    
    json_payload_agg = facade.transaction_factory.attach_signature(tx_agg, signature_agg)

    response_agg = requests.put(
        f"{NODE_URL}/transactions",
        headers={"Content-Type": "application/json"},
        data=json_payload_agg
    ).json()

    print("Response:", response_agg)

    hash_agg: Hash256 = facade.hash_transaction(tx_agg)
    
    print("===ネームスペース登録及びリンクトランザクション===")
    # トランザクションの状態を確認する処理を関数化
    await await_transaction_status(
        str(hash_agg),
        NODE_URL,
        "confirmed"
    )

    # ネームスペース情報を取得する（サブネームスペースの情報）
    name_space_id_hex = hex(sub_name_space_id)[2:]  # '0x'を除去
    name_space_info = requests.get(
        f"{NODE_URL}/namespaces/{name_space_id_hex}",
        headers={"Content-Type": "application/json"}
    ).json()

    print(json.dumps(convert_hex_values_in_object(name_space_info), indent=2))

if __name__ == "__main__":
    asyncio.run(main())