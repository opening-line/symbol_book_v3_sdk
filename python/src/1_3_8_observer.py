import os
import sys
import json
import asyncio
import requests
from websockets.legacy.client import connect
from dotenv import load_dotenv
from symbolchain.CryptoTypes import PrivateKey
from symbolchain.facade.SymbolFacade import SymbolFacade
from symbolchain.sc import TransferTransactionV1
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from functions.send_transaction import send_transaction

async def initialize_websocket(NODE_URL, account_a) -> None:
    ws_endpoint = NODE_URL.replace("http", "ws") + "/ws"

    # WebSocket接続
    async with connect(ws_endpoint) as websocket:
        # 接続時のレスポンスからUIDを取得
        response_json = json.loads(await websocket.recv())
        uid = response_json['uid']
        print(f'接続ID: {uid}')

        # 監視チャンネルの設定
        confirmed_channel_name = f'confirmedAdded/{account_a.address}'
        unconfirmed_channel_name = f'unconfirmedAdded/{account_a.address}'

        await websocket.send(json.dumps({'uid': uid, 'subscribe': f'{confirmed_channel_name}/{account_a.address}'}))
        await websocket.send(json.dumps({'uid': uid, 'subscribe': f'{unconfirmed_channel_name}/{account_a.address}'}))

        # トランザクションの状態変化を監視
        try:
            while True:
                response_json = json.loads(await websocket.recv())
                topic = response_json['topic']
                tx = response_json['data']
                # 承認済みトランザクションを検知した時の処理
                if topic.startswith('confirmedAdded'):
                    print(f'承認トランザクション検知: {tx}')
                    print("結果 Success", "エクスプローラー ", f"https://testnet.symbol.fyi/transactions/{tx['meta']['hash']}")
                    break
                # 未承認済みトランザクションを検知した時の処理
                elif topic.startswith('unconfirmedAdded'):
                    print(f'未承認トランザクション検知: {tx}')
        except Exception as e:
            print("WebSocketエラー:", e)

        print("WebSocket接続終了")
        uid = ""
        await websocket.close()
            
async def main() -> None:
    load_dotenv()

    NODE_URL = "https://sym-test-03.opening-line.jp:3001"    
    facade = SymbolFacade('testnet')
    private_key_a = os.getenv('PRIVATE_KEY_A') or ""
    account_a = facade.create_account(PrivateKey(private_key_a))
    private_key_b = os.getenv('PRIVATE_KEY_B') or ""
    account_b = facade.create_account(PrivateKey(private_key_b))

    network_time = requests.get(f"{NODE_URL}/node/time").json()
    current_timestamp: int = int(network_time['communicationTimestamps']['receiveTimestamp'])
    deadline_timestamp: int = current_timestamp + (2 * 60 * 60 * 1000)
    
    # 監視対象のトランザクション送信
    transfer_tx: TransferTransactionV1 = facade.transaction_factory.create({
        'type': 'transfer_transaction_v1',
        'recipient_address': account_b.address,
        'mosaics': [],
        'message': b'\0Hello, accountB!',
        'signer_public_key': account_a.public_key,
        'deadline': deadline_timestamp
    })

    send_transaction(transfer_tx, account_a)

    await initialize_websocket(NODE_URL, account_a)

if __name__ == "__main__":
    asyncio.run(main())