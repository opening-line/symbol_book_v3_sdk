
# マルチシグアカウントの構成及びマルチシグアカウントからのトランザクションを行うコード
import os
import sys
import json
import requests
import asyncio
from dotenv import load_dotenv
from symbolchain.CryptoTypes import PrivateKey
from symbolchain.facade.SymbolFacade import SymbolFacade, SymbolAccount, Hash256
from symbolchain.sc import Amount, Signature, TransferTransactionV1, AggregateCompleteTransactionV2, MultisigAccountModificationTransactionV1, Cosignature
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
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

    # 事前アカウント生成
    multisig_account = facade.create_account(PrivateKey.random())
    cosig_account1 = facade.create_account(PrivateKey.random())
    cosig_account2 = facade.create_account(PrivateKey.random())
    cosig_account3 = facade.create_account(PrivateKey.random())
    cosig_account4 = facade.create_account(PrivateKey.random())

    print("Multisig Account Address:", multisig_account.address)
    print("Cosign Account 1 Address:", cosig_account1.address)
    print("Cosign Account 2 Address:", cosig_account2.address)
    print("Cosign Account 3 Address:", cosig_account3.address)
    print("Cosign Account 4 Address:", cosig_account4.address)

    # 転送トランザクション1
    # （マルチシグアカウントを構成する際に必要な手数料を送付）
    transfer_tx_pre_1: TransferTransactionV1 = facade.transaction_factory.create_embedded({
        'type': 'transfer_transaction_v1', # トランザクションタイプの指定
        'recipient_address': multisig_account.address,
        'mosaics': [{
            'mosaic_id': 0x72C0212E67A08BCE,
            'amount': 1000000  # 1xym
        }],
        'signer_public_key': account_a.public_key, # 署名者の公開鍵
    })

    # 転送トランザクション2
    # （マルチシグアカウントに対してトランザクションを起案する手数料を送付）
    transfer_tx_pre_2: TransferTransactionV1 = facade.transaction_factory.create_embedded({
        'type': 'transfer_transaction_v1', # トランザクションタイプの指定
        'recipient_address': cosig_account1.address,
        'mosaics': [{
            'mosaic_id': 0x72C0212E67A08BCE,
            'amount': 1000000  # 1xym
        }],
        'signer_public_key': account_a.public_key, # 署名者の公開鍵
    })

    txs_pre = [
            transfer_tx_pre_1,
            transfer_tx_pre_2
        ]

    inner_transaction_hash_pre: Hash256 = facade.hash_embedded_transactions(txs_pre)

    tx_pre: AggregateCompleteTransactionV2 = facade.transaction_factory.create({
        'type': 'aggregate_complete_transaction_v2', # トランザクションタイプの指定
        'transactions': txs_pre,
        'transactions_hash': inner_transaction_hash_pre,
        'signer_public_key': account_a.public_key,
        'deadline': deadline_timestamp
    })
    tx_pre.fee = Amount(100 * tx_pre.size)

    signature_pre: Signature = account_a.sign_transaction(tx_pre)

    json_payload_pre = facade.transaction_factory.attach_signature(tx_pre, signature_pre)

    response_pre = requests.put(
        f"{NODE_URL}/transactions",
        headers={"Content-Type": "application/json"},
        data=json_payload_pre
    ).json()

    print("Response:", response_pre)

    hash_pre: Hash256 = facade.hash_transaction(tx_pre)

    print("===事前手数料転送トランザクション===")
    await await_transaction_status(
        str(hash_pre),
        NODE_URL,
        "confirmed"
    )

    # マルチシグアカウント構成トランザクション
    multisig_account_modification_tx: MultisigAccountModificationTransactionV1 = facade.transaction_factory.create_embedded({
        'type': 'multisig_account_modification_transaction_v1', # トランザクションタイプの指定
        'min_removal_delta': 3,  # マルチシグのトランザクションに必要な署名数の増減値
        'min_approval_delta': 3,  # マルチシグの除名に必要な署名数の増減値
        # 追加するアカウントのアドレスリスト
        'address_additions': [
            cosig_account1.address,
            cosig_account2.address,
            cosig_account3.address,
            cosig_account4.address,
        ],
        'signer_public_key': multisig_account.public_key, # マルチシグ化するアカウントの公開鍵を指定
    })

    txs_mod = [
            multisig_account_modification_tx
        ]

    inner_transaction_hash_mod: Hash256 = facade.hash_embedded_transactions(txs_mod)

    tx_mod: AggregateCompleteTransactionV2 = facade.transaction_factory.create({
        'type': 'aggregate_complete_transaction_v2', # トランザクションタイプの指定
        'transactions': txs_mod,
        'transactions_hash': inner_transaction_hash_mod,
        'signer_public_key': multisig_account.public_key,
        'deadline': deadline_timestamp
    })
    tx_mod.fee = Amount(100 * (tx_mod.size + 4*104)) # 連署者の署名分のサイズ （連署者 ＊ 104）を追加

    signature_mod: Signature = multisig_account.sign_transaction(tx_mod)
    # 署名の付与
    facade.transaction_factory.attach_signature(tx_mod, signature_mod)

    #マルチシグ構成アカウントの連署
    cosign1: Cosignature = cosig_account1.cosign_transaction(tx_mod)
    #連署者の署名追加
    tx_mod.cosignatures.append(cosign1)
    cosign2: Cosignature = cosig_account2.cosign_transaction(tx_mod)
    tx_mod.cosignatures.append(cosign2)    
    cosign3: Cosignature = cosig_account3.cosign_transaction(tx_mod)
    tx_mod.cosignatures.append(cosign3)
    cosign4: Cosignature = cosig_account4.cosign_transaction(tx_mod)
    tx_mod.cosignatures.append(cosign4)

    # トランザクションをペイロード化 => 文字列に整形
    json_payload_mod = json.dumps({
        "payload": (tx_mod.serialize()).hex(),
    })

    response_mod = requests.put(
        f"{NODE_URL}/transactions",
        headers={"Content-Type": "application/json"},
        data=json_payload_mod
    ).json()

    print("Response:", response_mod)

    hash_mod: Hash256 = facade.hash_transaction(tx_mod)

    print("===マルチシグアカウント構成トランザクション===")
    await await_transaction_status(
        str(hash_mod),
        NODE_URL,
        "confirmed"
    )

    # 転送トランザクション(multisigAccount=>accountA)
    transfer_tx_1: TransferTransactionV1 = facade.transaction_factory.create_embedded({
        'type': 'transfer_transaction_v1', # トランザクションタイプの指定
        'recipient_address': account_a.address,
        'mosaics': [],
        'message': b'\0Hello accountA From Multisig Account!',
        'signer_public_key': multisig_account.public_key, # 署名者の公開鍵
    })


    txs_tf = [
            transfer_tx_1
        ]

    inner_transaction_hash_tf: Hash256 = facade.hash_embedded_transactions(txs_tf)

    tx_tf: AggregateCompleteTransactionV2 = facade.transaction_factory.create({
        'type': 'aggregate_complete_transaction_v2', # トランザクションタイプの指定
        'transactions': txs_tf,
        'transactions_hash': inner_transaction_hash_tf,
        'signer_public_key': cosig_account1.public_key, # 起案者であるcosigAccount1を指定
        'deadline': deadline_timestamp
    })
    tx_tf.fee = Amount(100 * (tx_tf.size + 2*104)) # 連署者の署名分のサイズ （連署者 ＊ 104）を追加

    signature_tf: Signature = cosig_account1.sign_transaction(tx_tf)
    # 署名の付与
    facade.transaction_factory.attach_signature(tx_tf, signature_tf)

    cosign2_tf: Cosignature = cosig_account2.cosign_transaction(tx_tf)
    tx_tf.cosignatures.append(cosign2_tf)    
    cosign3_tf: Cosignature = cosig_account3.cosign_transaction(tx_tf)
    tx_tf.cosignatures.append(cosign3_tf)

    json_payload_tf = json.dumps({
        "payload": (tx_tf.serialize()).hex(),
    })

    response_tf = requests.put(
        f"{NODE_URL}/transactions",
        headers={"Content-Type": "application/json"},
        data=json_payload_tf
    ).json()

    print("Response:", response_tf)

    hash_tf: Hash256 = facade.hash_transaction(tx_tf)

    print("===転送トランザクション（マルチシグアカウントから）===")
    await await_transaction_status(
        str(hash_tf),
        NODE_URL,
        "confirmed"
    )    
    
if __name__ == "__main__":
    asyncio.run(main())  # asyncio.runを使用して非同期関数を実行