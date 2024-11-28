import { PrivateKey } from "symbol-sdk"
import { SymbolFacade, Network } from "symbol-sdk/symbol"

const facade = new SymbolFacade(Network.TESTNET)
const account = facade.createAccount(PrivateKey.random())

console.log("秘密鍵", account.keyPair.privateKey.toString())
console.log(
  "フォーセット",
  `https://testnet.symbol.tools/?recipient=${account.address.toString()}`,
)
console.log(
  "エクスプローラー",
  `https://testnet.symbol.fyi/accounts/${account.address.toString()}`,
)
