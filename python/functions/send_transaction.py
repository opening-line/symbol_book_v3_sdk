import requests
from symbolchain.facade.SymbolFacade import (
  SymbolFacade,
  SymbolAccount,
  Hash256,
)
from typing import Any
from symbolchain.sc import Amount, Signature


# トランザクションを受け取り、署名し、トランザクションハッシュを返す関数
def send_transaction(tx: Any, signAccount: SymbolAccount) -> Hash256:
  NODE_URL: str = "https://sym-test-03.opening-line.jp:3001"
  facade: SymbolFacade = SymbolFacade("testnet")

  tx.fee = Amount(100 * tx.size)

  signature: Signature = signAccount.sign_transaction(tx)

  json_payload: str = facade.transaction_factory.attach_signature(
    tx, signature
  )

  response = requests.put(
    f"{NODE_URL}/transactions",
    headers={"Content-Type": "application/json"},
    data=json_payload,
  ).json()

  print("Response:", response)

  hash: Hash256 = facade.hash_transaction(tx)

  return hash
