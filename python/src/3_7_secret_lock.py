# シークレット（ロック用のキー）とプルーフ（解除用のキー）を使って特定のモザイクの送付をロックしておくコード
import os
import requests
import asyncio
import hashlib
from dotenv import load_dotenv
from symbolchain.CryptoTypes import PrivateKey
from symbolchain.facade.SymbolFacade import (
  SymbolFacade,
  SymbolAccount,
  Hash256,
)
from symbolchain.sc import (
  SecretLockTransactionV1,
  SecretProofTransactionV1,
)

from wait_tx_status import wait_tx_status
from send_tx import send_tx

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
  deadline_timestamp: int = receiveTimestamp + (
    2 * 60 * 60 * 1000
  )  # 2時間後（ミリ秒単位）

  # 乱数でプルーフを生成する
  random_uint8 = os.urandom(20)
  # 16進数の文字列に変換
  proof = random_uint8.hex()

  # SHA2-256の二重ハッシュオブジェクトを作成
  secret_hash = Hash256(
    hashlib.sha256(
      hashlib.sha256(proof.encode("utf8")).digest()
    ).digest()
  )

  # ハッシュオブジェクトからシークレット（ロック用のキー）を生成
  # 16進数の文字列に変換
  secret = str(secret_hash)

  print({"プルーフ": proof})
  print({"シークレット": secret})

  # シークレットロックトランザクションの生成
  secret_lock_tx: (
    SecretLockTransactionV1
  ) = facade.transaction_factory.create({
      "type": "secret_lock_transaction_v1",
      "recipient_address": account_b.address,  # 送付先（解除先）のアドレス
      "secret": Hash256(secret),  # シークレット
      # ロックしておくモザイクを指定
      "mosaic": {
        "mosaic_id": 0x72C0212E67A08BCE,
        "amount": 1000000,
      },
      "duration": 480,  # ロック期間（ブロック数）
      "hash_algorithm": "hash_256",  # ロック生成に使用するアルゴリズム
      "signer_public_key": account_a.public_key,  # 署名者の公開鍵
      "deadline": deadline_timestamp,
    })

  print("===シークレットロックトランザクション===")
  secret_lock_hash: Hash256 = send_tx(
    secret_lock_tx, account_a
  )

  await wait_tx_status(
    str(secret_lock_hash), NODE_URL, "confirmed"
  )

  # （実際はこれ以降は別のコード上で実装するものだが、便宜上同じコード上に記載）
  # ロックしているシークレット（オンチェーン上でも確認可能）を参照
  # メール等何かの方法でプルーフを確認

  # シークレットプルーフトランザクションの生成
  secret_proof_tx: (
    SecretProofTransactionV1
  ) = facade.transaction_factory.create({
      "type": "secret_proof_transaction_v1",
      "recipient_address": account_b.address,  # 送付先（解除先）のアドレス
      "secret": Hash256(secret),  # シークレット
      "proof": proof,  # プルーフ
      "hash_algorithm": "hash_256",  # ロック生成に使用するアルゴリズム
      "signer_public_key": account_b.public_key,  # 署名者の公開鍵
      "deadline": deadline_timestamp,
    })

  print("===シークレットプルーフトランザクション===")
  secret_proof_hash: Hash256 = send_tx(
    secret_proof_tx, account_b
  )

  await wait_tx_status(
    str(secret_proof_hash), NODE_URL, "confirmed"
  )


if __name__ == "__main__":
  asyncio.run(main())
