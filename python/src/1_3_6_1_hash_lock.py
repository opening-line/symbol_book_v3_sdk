
# アグリゲートボンデッドトランザクションをハッシュロックし、オンチェーン上で連署を行う
import os
import sys
import json
import requests
import asyncio
from dotenv import load_dotenv
from symbolchain.CryptoTypes import PrivateKey
from symbolchain.facade.SymbolFacade import SymbolFacade, SymbolAccount, Hash256
from symbolchain.sc import Amount, Signature, TransferTransactionV1, AggregateBondedTransactionV2, HashLockTransactionV1
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from functions.send_transaction import send_transaction
from functions.await_transaction_status import await_transaction_status

async def main() -> None:
    load_dotenv()

    NODE_URL: str = "https://sym-test-03.opening-line.jp:3001"
    facade: SymbolFacade = SymbolFacade('testnet')

    private_key_a: str = os.getenv('PRIVATE_KEY_A') or ""
    account_a: SymbolAccount = facade.create_account(PrivateKey(private_key_a))
    private_key_b: str = os.getenv('PRIVATE_KEY_B') or ""
    account_b: SymbolAccount = facade.create_account(PrivateKey(private_key_b))

    network_time = requests.get(f"{NODE_URL}/node/time").json()
    current_timestamp: int = int(network_time['communicationTimestamps']['receiveTimestamp'])
    deadline_timestamp: int = current_timestamp + (2 * 60 * 60 * 1000)  # 2時間後（ミリ秒単位）


    # 転送トランザクション1(accountA=>accountB)
    transfer_tx1: TransferTransactionV1 = facade.transaction_factory.create_embedded({
        'type': 'transfer_transaction_v1', # トランザクションタイプの指定
        'recipient_address': account_b.address,
        'mosaics': [{
            'mosaic_id': 0x72C0212E67A08BCE,
            'amount': 1000000  # 1xym
        }],
        'message': b'\0Send 1xym',
        'signer_public_key': account_a.public_key, # 署名者の公開鍵
    })

    # 転送トランザクション2(accountA=>accountB)
    transfer_tx2: TransferTransactionV1 = facade.transaction_factory.create_embedded({
        'type': 'transfer_transaction_v1', # トランザクションタイプの指定
        'recipient_address': account_a.address,
        'mosaics': [],
        'message': b'\0Thank you!',
        'signer_public_key': account_b.public_key, # 署名者の公開鍵
    })

    txs = [
            transfer_tx1,
            transfer_tx2
        ]

    inner_transaction_hash: Hash256 = facade.hash_embedded_transactions(txs)

    # アグリゲート本デッドトランザクションを生成
    tx_agg: AggregateBondedTransactionV2 = facade.transaction_factory.create({
        'type': 'aggregate_bonded_transaction_v2', # トランザクションタイプの指定
        'transactions': txs,
        'transactions_hash': inner_transaction_hash,
        'signer_public_key': account_a.public_key,
        'deadline': deadline_timestamp
    })
    tx_agg.fee = Amount(100 * tx_agg.size + 1*104) # 連署者分の手数料 ＊ 104を追加

    signature_agg: Signature = account_a.sign_transaction(tx_agg)    
    json_payload_agg = facade.transaction_factory.attach_signature(tx_agg, signature_agg)

    # ハッシュロックに必要なトランザクションハッシュの生成
    hash_agg: Hash256 = facade.hash_transaction(tx_agg)

    # ハッシュロックトランザクションの生成
    hash_lock_tx: HashLockTransactionV1 = facade.transaction_factory.create({
        'type': 'hash_lock_transaction_v1', # トランザクションタイプの指定
        'mosaic': {
            'mosaic_id': 0x72C0212E67A08BCE,
            'amount': 10000000  # ロック用に固定で10xymを預ける
        },
        'duration': 5760, # ロック期間（ブロック数）
        'hash': hash_agg, # ロックしたいトランザクションのハッシュ
        'signer_public_key': account_a.public_key, # 署名者の公開鍵
        'deadline': deadline_timestamp
    })

    # アグリゲートでないトランザクションは生成からアナウンスまで同じ処理なので関数化 
    hash_lock_hash: Hash256 = send_transaction(hash_lock_tx, account_a)

    print("===ハッシュロックトランザクション===")
    await await_transaction_status(
        str(hash_lock_hash),
        NODE_URL,
        "confirmed"
    )

    # ハッシュロックトランザクションが全ノードに伝播されるまで一秒ほど時間を置く
    await asyncio.sleep(1)

    # アグリゲートボンデッドトランザクションのアナウンス
    response_agg = requests.put(
        # エンドポイントがに/transactions/partialであることに注意
        f"{NODE_URL}/transactions/partial",
        headers={"Content-Type": "application/json"},
        data=json_payload_agg
    ).json()

    print("Response:", response_agg)

    # partial（オンチェーン上で連署待ちの状態）の確認
    print("===アグリゲートボンデッドトランザクション===")
    await await_transaction_status(
        str(hash_agg),
        NODE_URL,
        "partial"
    )

    # （実際はこれ以降は別のコード上で実装するものだが、便宜上同じコード上に記載）
    # ロックされたトランザクションハッシュ（オンチェーン上でも確認可能）から連署を行う

    hash_agg_string = str(hash_agg)
    hash_agg_restore: Hash256 = Hash256(hash_agg_string)

    # 連署者による署名
    cosignB = account_b.key_pair.sign(hash_agg_restore.bytes)

    cosignature_request = json.dumps({
        # 連署するアグリゲートボンデッドトランザクションのトランザクションハッシュ値
        'parentHash': hash_agg_string,
        # 署名部分
        'signature': str(cosignB),
        # 連署者の公開鍵
        'signerPublicKey': str(account_b.public_key),
        # 署名したトランザクションのバージョン
        'version': "0",
    })

    response_cos = requests.put(
        # エンドポイントが/transactions/cosignatureであることに注意  
        f"{NODE_URL}/transactions/cosignature",
        headers={"Content-Type": "application/json"},
        data=cosignature_request,
    ).json()

    print("Response:", response_cos)

    print("===アグリゲートボンデッドトランザクションへの連署===")
    await await_transaction_status(
        hash_agg_string,
        NODE_URL,
        "confirmed",
    )

    
if __name__ == "__main__":
    asyncio.run(main())  # asyncio.runを使用して非同期関数を実行