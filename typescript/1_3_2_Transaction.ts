import { PrivateKey } from "symbol-sdk"
import { Network, SymbolFacade, descriptors, models } from "symbol-sdk/symbol"
import dotenv from "dotenv"

//dotenvの設定
dotenv.config()

//事前準備
const NODE_URL = "https://sym-test-03.opening-line.jp:3001"
const facade = new SymbolFacade(Network.TESTNET)
const privateKeyA = new PrivateKey(process.env.PRIVATE_KEY_A!)
const accountA = facade.createAccount(privateKeyA)
const privateKeyB = new PrivateKey(process.env.PRIVATE_KEY_B!)
const accountB = facade.createAccount(privateKeyB)

const message = "\0Hello, Symbol!" // \0はエクスプローラーやデスクトップウォレットで識別するためのフラグ

const descriptor = new descriptors.TransferTransactionV1Descriptor(
  //転送トランザクション
  accountB.address, //送信先アカウントのアドレス
  [
    new descriptors.UnresolvedMosaicDescriptor(
      new models.UnresolvedMosaicId(0x72c0212e67a08bcen), //テストネットのモザイクID
      new models.Amount(1000000n), //1xym
    ),
  ],
  message, //メッセージ
)

const tx = facade.createTransactionFromTypedDescriptor(
  descriptor, //Txの中身
  accountA.publicKey, //送信元アカウントの公開鍵
  100,
  60 * 60 * 2,
)

const signature = accountA.signTransaction(tx) //署名
const jsonPayload = facade.transactionFactory.static.attachSignature(tx, signature) //ペイロード

const response = await fetch(new URL("/transactions", NODE_URL), {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: jsonPayload,
}).then((res) => res.json())

console.log({response})

const hash = facade.hashTransaction(tx).toString()

// Txがconfirmed状態になるまで10秒ごとに状態を確認
let txInfo;
do {
    txInfo = await fetch(
        new URL(`/transactions/confirmed/${hash}`, NODE_URL),
        {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        }
    ).then((res) => res.json());

    console.log({ txInfo });
    await new Promise(resolve => setTimeout(resolve, 10000)); // 10秒待機
} while (txInfo.code === 'ResourceNotFound');
