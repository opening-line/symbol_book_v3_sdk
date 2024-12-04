
# モザイクを生成し送付するコード
import os
import sys
import json
import random
import requests
import asyncio
from dotenv import load_dotenv
from symbolchain.CryptoTypes import PrivateKey
from symbolchain.facade.SymbolFacade import SymbolFacade, SymbolAccount, Hash256
from symbolchain.symbol.IdGenerator import generate_mosaic_id
from symbolchain.sc import MosaicNonce, MosaicFlags, Signature, TransferTransactionV1, MosaicDefinitionTransactionV1, MosaicSupplyChangeTransactionV1, AggregateCompleteTransactionV2
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
    private_key_b: str = os.getenv('PRIVATE_KEY_B') or ""
    account_b: SymbolAccount = facade.create_account(PrivateKey(private_key_b))

    network_time: Dict[str, Any] = requests.get(f"{NODE_URL}/node/time").json()
    current_timestamp: int = int(network_time['communicationTimestamps']['receiveTimestamp'])
    deadline_timestamp: int = current_timestamp + (2 * 60 * 60 * 1000)  # 2時間後（ミリ秒単位）

    # モザイク定義用のフラグ値
    mosaic_flags: MosaicFlags = MosaicFlags.TRANSFERABLE  # 第三者に転送可能
    # モザイクID生成時のノンスの生成
    nonce: int = random.randint(0, 0xffffffff)
    # モザイクIDの生成
    mosaic_id: int = generate_mosaic_id(account_a.address, nonce)

    # モザイク定義トランザクション
    mosaic_definition_tx: MosaicDefinitionTransactionV1 = facade.transaction_factory.create_embedded({
        'type': 'mosaic_definition_transaction_v1', # トランザクションタイプの指定
        'id': mosaic_id, # モザイクID
        'duration': 0,  # 有効期限
        'nonce': MosaicNonce(nonce), # ナンス
        'flags': mosaic_flags, # モザイク定義用のフラグ
        'divisibility': 0,  # 可分性 小数点以下の桁数
        'signer_public_key': account_a.public_key, # 署名者の公開鍵
    })

    # モザイク供給量変更トランザクション
    mosaic_supply_change_tx: MosaicSupplyChangeTransactionV1 = facade.transaction_factory.create_embedded({
        'type': 'mosaic_supply_change_transaction_v1', # トランザクションタイプの指定
        'mosaic_id': mosaic_id, # モザイクID
        'delta': 100,  # 供給量
        'action': 'increase',  # 増やす(increase)減らす(decrease)
        'signer_public_key': account_a.public_key, # 署名者の公開鍵
    })

    # 転送トランザクション
    transfer_tx: TransferTransactionV1 = facade.transaction_factory.create_embedded({
        'type': 'transfer_transaction_v1', # トランザクションタイプの指定
        'recipient_address': account_b.address,  # 送信先アカウントのアドレス
        'mosaics': [{
            'mosaic_id': mosaic_id,  # 生成したモザイクID
            'amount': 1  # 1mosaic
        }],
        'signer_public_key': account_a.public_key, # 署名者の公開鍵
    })

    txs = [
            mosaic_definition_tx,
            mosaic_supply_change_tx,
            transfer_tx
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
    
    print("===モザイク発行及び転送トランザクション===")

    # トランザクションの状態を確認する処理を関数化
    await await_transaction_status(
        str(hash),
        NODE_URL,
        "confirmed"
    )

    # モザイク情報を取得する
    mosaic_id_hex = hex(mosaic_id)[2:]  # '0x'を除去
    mosaic_info = requests.get(
        f"{NODE_URL}/mosaics/{mosaic_id_hex}",
        headers={"Content-Type": "application/json"}
    ).json()

    print(json.dumps(convert_hex_values_in_object(mosaic_info), indent=2))

if __name__ == "__main__":
    asyncio.run(main())  # asyncio.runを使用して非同期関数を実行