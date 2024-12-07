// アカウントを生成するコード
import { PrivateKey } from "symbol-sdk"
import { SymbolFacade, Network } from "symbol-sdk/symbol"

const facade = new SymbolFacade(Network.TESTNET) //SymbolSDKの機能を呼び出す窓口
const account = facade.createAccount(PrivateKey.random()) //新規アカウントの生成

console.log("秘密鍵", account.keyPair.privateKey.toString()) //秘密鍵の導出
//フォーセットへのURLを表示
console.log(
  "フォーセット",
  `https://testnet.symbol.tools/?recipient=${account.address.toString()}`, //アドレスの導出
)
//エクスプローラーへのURLを表示
console.log(
  "エクスプローラー",
  `https://testnet.symbol.fyi/accounts/${account.address.toString()}`, //アドレスの導出
)
