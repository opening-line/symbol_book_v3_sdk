// マルチシグアカウントの構成及びマルチシグアカウントからのトランザクションを行うコード
import { PrivateKey, utils } from "symbol-sdk"
import {
  Network,
  SymbolFacade,
  descriptors,
  models,
} from "symbol-sdk/symbol"

import dotenv from "dotenv"
import { 
  awaitTransactionStatus,
} from "../functions/awaitTransactionStatus"

dotenv.config()

const NODE_URL = "https://sym-test-03.opening-line.jp:3001"
const facade = new SymbolFacade(Network.TESTNET)
const privateKeyA = new PrivateKey(process.env.PRIVATE_KEY_A!)
const accountA = facade.createAccount(privateKeyA)

// 事前アカウント生成
const multisigAccount = facade.createAccount(PrivateKey.random())
const cosigAccount1 = facade.createAccount(PrivateKey.random())
const cosigAccount2 = facade.createAccount(PrivateKey.random())
const cosigAccount3 = facade.createAccount(PrivateKey.random())
const cosigAccount4 = facade.createAccount(PrivateKey.random())
console.log(
  "Multisig Account Address:",
  multisigAccount.address.toString(),
)
console.log(
  "Cosign Account 1 Address:",
  cosigAccount1.address.toString(),
)
console.log(
  "Cosign Account 2 Address:",
  cosigAccount2.address.toString(),
)
console.log(
  "Cosign Account 3 Address:",
  cosigAccount3.address.toString(),
)
console.log(
  "Cosign Account 4 Address:",
  cosigAccount4.address.toString(),
)

// 転送トランザクション1
// （マルチシグアカウントを構成する際に必要な手数料を送付）
const transferDescriptorPre1 =
  new descriptors.TransferTransactionV1Descriptor(
    multisigAccount.address,
    [
      new descriptors.UnresolvedMosaicDescriptor(
        new models.UnresolvedMosaicId(0x72C0212E67A08BCEn),
        new models.Amount(1000000n), // 1xym
      ),
    ],
  )

// 転送トランザクション2
// （マルチシグアカウントに対してトランザクションを起案する手数料を送付）
const transferDescriptorPre2 =
  new descriptors.TransferTransactionV1Descriptor(
    cosigAccount1.address,
    [
      new descriptors.UnresolvedMosaicDescriptor(
        new models.UnresolvedMosaicId(0x72C0212E67A08BCEn),
        new models.Amount(1000000n), // 1xym
      ),
    ],
  )

const txsPre = [
  {
    transaction: transferDescriptorPre1,
    signer: accountA.publicKey,
  },
  {
    transaction: transferDescriptorPre2,
    signer: accountA.publicKey,
  },
]

const innerTransactionsPre = txsPre.map((tx) =>
  facade.createEmbeddedTransactionFromTypedDescriptor(
    tx.transaction,
    tx.signer,
  ),
)

const innerTransactionHashPre = SymbolFacade.hashEmbeddedTransactions(
  innerTransactionsPre,
)

const aggregateDescriptorPre =
  new descriptors.AggregateCompleteTransactionV2Descriptor(
    innerTransactionHashPre,
    innerTransactionsPre,
  )

const txPre = facade.createTransactionFromTypedDescriptor(
  aggregateDescriptorPre,
  accountA.publicKey,
  100,
  60 * 60 * 2,
)

const signaturePre = accountA.signTransaction(txPre)
const jsonPayloadPre =
  facade.transactionFactory.static.attachSignature(
    txPre,
    signaturePre,
  )

const responsePre = await fetch(new URL("/transactions", NODE_URL), {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: jsonPayloadPre,
}).then((res) => res.json())

console.log({ responsePre })

const hashPre = facade.hashTransaction(txPre)

console.log("===事前手数料転送トランザクション===")
await awaitTransactionStatus(
  hashPre.toString(),
  NODE_URL,
  "confirmed",
)

const multisigAccountModificationDescriptor =
  // マルチシグアカウント構成トランザクション
  new descriptors.MultisigAccountModificationTransactionV1Descriptor(
    3, // マルチシグの除名に必要な署名数の増減値
    3, // マルチシグのトランザクションに必要な署名数の増減値
    [
      // 追加するアカウントのアドレスリスト
      cosigAccount1.address,
      cosigAccount2.address,
      cosigAccount3.address,
      cosigAccount4.address,
    ],
    [], // 除名するアカウントのアドレスリスト
  )

const innerTransactionsMod = [
  facade.createEmbeddedTransactionFromTypedDescriptor(
    multisigAccountModificationDescriptor,
    multisigAccount.publicKey, // マルチシグ化するアカウントの公開鍵を指定
  ),
]

const innerTransactionHashMod = SymbolFacade.hashEmbeddedTransactions(
  innerTransactionsMod,
)

const aggregateDescriptorMod =
  new descriptors.AggregateCompleteTransactionV2Descriptor(
    innerTransactionHashMod,
    innerTransactionsMod,
  )

const txMod = models.AggregateCompleteTransactionV2.deserialize(
  facade
    .createTransactionFromTypedDescriptor(
      aggregateDescriptorMod,
      multisigAccount.publicKey,
      100,
      60 * 60 * 2,
      4, // 連署者数（マルチシグの構成アカウント数分が必要）
    )
    .serialize(),
)

const signatureMod = multisigAccount.signTransaction(txMod)

//署名の付与
facade.transactionFactory.static.attachSignature(txMod, signatureMod)

//マルチシグ構成アカウントの連署
const cosign1 = facade.cosignTransaction(cosigAccount1.keyPair, txMod)
//連署者の署名追加
txMod.cosignatures.push(cosign1)
const cosign2 = facade.cosignTransaction(cosigAccount2.keyPair, txMod)
txMod.cosignatures.push(cosign2)
const cosign3 = facade.cosignTransaction(cosigAccount3.keyPair, txMod)
txMod.cosignatures.push(cosign3)
const cosign4 = facade.cosignTransaction(cosigAccount4.keyPair, txMod)
txMod.cosignatures.push(cosign4)

//トランザクションをペイロード化 => 文字列に整形
const jsonPayloadMod = JSON.stringify({
  payload: utils.uint8ToHex(txMod.serialize()),
})

const responseMod = await fetch(new URL("/transactions", NODE_URL), {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: jsonPayloadMod,
}).then((res) => res.json())

console.log({ responseMod })

const hashMod = facade.hashTransaction(txMod)

console.log("===マルチシグアカウント構成トランザクション===")
await awaitTransactionStatus(
  hashMod.toString(),
  NODE_URL,
  "confirmed",
)

// 転送トランザクション(multisigAccount=>accountA)
const transferDescriptor =
  new descriptors.TransferTransactionV1Descriptor(
    accountA.address,
    [],
    "\0Hello accountA From Multisig Account!",
  )

const innerTransactionsTf = [
  facade.createEmbeddedTransactionFromTypedDescriptor(
    transferDescriptor,
    multisigAccount.publicKey,
  ),
]

const innerTransactionHashTf = SymbolFacade.hashEmbeddedTransactions(
  innerTransactionsTf,
)

const aggregateDescriptorTf =
  new descriptors.AggregateCompleteTransactionV2Descriptor(
    innerTransactionHashTf,
    innerTransactionsTf,
  )

const txTf = models.AggregateCompleteTransactionV2.deserialize(
  facade
    .createTransactionFromTypedDescriptor(
      aggregateDescriptorTf,
      cosigAccount1.publicKey, // 起案者であるcosigAccount1を指定
      100,
      60 * 60 * 2,
      2, // 連署者数（起案者を除く、トランザクション承認に必要な数）
    )
    .serialize(),
)

const signatureTf = cosigAccount1.signTransaction(txTf)

facade.transactionFactory.static.attachSignature(txTf, signatureTf)

const cosign2Tf = facade.cosignTransaction(
  cosigAccount2.keyPair,
  txTf,
)
txTf.cosignatures.push(cosign2Tf)
const cosign3Tf = facade.cosignTransaction(
  cosigAccount3.keyPair,
  txTf,
)
txTf.cosignatures.push(cosign3Tf)

const jsonPayloadTf = JSON.stringify({
  payload: utils.uint8ToHex(txTf.serialize()),
})

const responseTf = await fetch(new URL("/transactions", NODE_URL), {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: jsonPayloadTf,
}).then((res) => res.json())

console.log({ responseTf })

const hashTf = facade.hashTransaction(txTf)

console.log("===転送トランザクション（マルチシグアカウントから）===")
await awaitTransactionStatus(hashTf.toString(), NODE_URL, "confirmed")
