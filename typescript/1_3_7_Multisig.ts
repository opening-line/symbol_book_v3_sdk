import { PrivateKey } from "symbol-sdk"
import {
  Network,
  SymbolFacade,
  descriptors,
  models,
} from "symbol-sdk/symbol"

import dotenv from "dotenv"
import { awaitTransactionStatus } from "./functions/awaitTransactionStatus"

//dotenvの設定
dotenv.config()

//事前準備
const NODE_URL = "https://sym-test-03.opening-line.jp:3001"
const facade = new SymbolFacade(Network.TESTNET)
const privateKeyA = new PrivateKey(process.env.PRIVATE_KEY_A!)
const accountA = facade.createAccount(privateKeyA)

//事前アカウント作成
const multisigAccount = facade.createAccount(PrivateKey.random())
const cosigAccount1 = facade.createAccount(PrivateKey.random())
const cosigAccount2 = facade.createAccount(PrivateKey.random())
const cosigAccount3 = facade.createAccount(PrivateKey.random())
const cosigAccount4 = facade.createAccount(PrivateKey.random())

//転送トランザクション1（手数料分のxym送付）
const transferDescriptor1 = new descriptors.TransferTransactionV1Descriptor(
  multisigAccount.address, //送信先アカウントのアドレス
  [
    new descriptors.UnresolvedMosaicDescriptor(
      new models.UnresolvedMosaicId(0x72c0212e67a08bcen), //テストネットの基軸通貨のモザイクID
      new models.Amount(10000000n), //10xym
    ),
  ],
)

//転送トランザクション2（手数料分のxym送付）
const transferDescriptor2 = new descriptors.TransferTransactionV1Descriptor(
  cosigAccount1.address, //送信先アカウントのアドレス
  [
    new descriptors.UnresolvedMosaicDescriptor(
      new models.UnresolvedMosaicId(0x72c0212e67a08bcen), //テストネットの基軸通貨のモザイクID
      new models.Amount(10000000n), //10xym
    ),
  ],
)

const txs = [
  {
    transaction: transferDescriptor1,
    signer: accountA.publicKey,
  },
  {
    transaction: transferDescriptor2,
    signer: accountA.publicKey,
  }
]

const innerTransactions = txs.map((tx) =>
  facade.createEmbeddedTransactionFromTypedDescriptor(
    tx.transaction,
    tx.signer,
  ),
)

const innerTransactionHash =
  SymbolFacade.hashEmbeddedTransactions(innerTransactions)

const aggregateDescriptor = new descriptors.AggregateCompleteTransactionV2Descriptor(
  innerTransactionHash,
  innerTransactions,
)

const tx = models.AggregateCompleteTransactionV2.deserialize(
  facade
    .createTransactionFromTypedDescriptor(
      aggregateDescriptor,
      accountA.publicKey,
      100,
      60 * 60 * 2,
    )
    .serialize(),
)

const signature = accountA.signTransaction(tx) //署名
const jsonPayload = facade.transactionFactory.static.attachSignature(
  tx,
  signature,
) //ペイロード

const response = await fetch(new URL("/transactions", NODE_URL), {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: jsonPayload,
}).then((res) => res.json())

console.log({ response })

const hash = facade.hashTransaction(tx)

await awaitTransactionStatus(hash.toString(), NODE_URL, "confirmed");

// マルチシグアカウント構成トランザクション作成/署名/アナウンス
const multisigAccountModificationDescriptor = new descriptors.MultisigAccountModificationTransactionV1Descriptor(
  3,  // マルチシグ構成除名に必要な署名数の増減値
  3,  // マルチシグアカウントでのトランザクションに必要な署名数の増減値
  [   // 追加するアドレスのリスト
    cosigAccount1.address,
    cosigAccount2.address,
    cosigAccount3.address,
    cosigAccount4.address,
  ],
  []  // 除名するアドレスのリスト
);

