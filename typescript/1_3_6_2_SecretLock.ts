import { PrivateKey, utils } from "symbol-sdk"
import { Network, SymbolFacade, descriptors, models } from "symbol-sdk/symbol"

import dotenv from "dotenv"
import { awaitTransactionStatus } from "./functions/awaitTransactionStatus"
import sha3 from "js-sha3"

// dotenvの設定
dotenv.config()

// 事前準備
const NODE_URL = "https:// sym-test-03.opening-line.jp:3001"
const facade = new SymbolFacade(Network.TESTNET)
const privateKeyA = new PrivateKey(process.env.PRIVATE_KEY_A!)
const accountA = facade.createAccount(privateKeyA)
const privateKeyB = new PrivateKey(process.env.PRIVATE_KEY_B!)
const accountB = facade.createAccount(privateKeyB)

const proof = crypto.getRandomValues(new Uint8Array(20)) // ロック解除用
const proofHex = utils.uint8ToHex(proof) // 16進数の文字列 Uint8に戻す場合は utils.hexToUint8を使う

const hashObject = sha3.sha3_256.create()
hashObject.update(proof)

const secret = hashObject.digest() // ロック用
const secretHex = hashObject.hex() // 16進数の文字列 Uint8に戻す場合は utils.hexToUint8を使う

console.log(proofHex)
console.log(secretHex)

// シークレットロックトランザクション作成/署名/アナウンス
const secretLock1Descriptor = new descriptors.SecretLockTransactionV1Descriptor(
  accountB.address, // 解除先のアドレス
  secret as unknown as models.Hash256, // ロック用
  new descriptors.UnresolvedMosaicDescriptor(
    // ロックしておくモザイクを指定
    new models.UnresolvedMosaicId(0x72c0212e67a08bcen), // テストネットの基軸通貨のモザイクID
    new models.Amount(1000000n),
  ),
  new models.BlockDuration(480n), // ロックしておくブロック数（1ブロック約30秒）
  models.LockHashAlgorithm.SHA3_256, // ロック生成に使用したアルゴリズム
)

const txLock = facade.createTransactionFromTypedDescriptor(
  secretLock1Descriptor,
  accountA.publicKey,
  100,
  60 * 60 * 2,
)

const signatureLock = accountA.signTransaction(txLock) // 署名
const jsonPayloadLock = facade.transactionFactory.static.attachSignature(
  txLock,
  signatureLock,
) // ペイロード

const responseLock = await fetch(new URL("/transactions", NODE_URL), {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: jsonPayloadLock,
}).then((res) => res.json())

console.log({ responseLock })

const hashLock = facade.hashTransaction(txLock)

await awaitTransactionStatus(hashLock.toString(), NODE_URL, "confirmed")

// シークレットプルーフトランザクション作成/署名/
const proofDescriptor = new descriptors.SecretProofTransactionV1Descriptor(
  accountB.address, // 解除先のアドレス
  secret as unknown as models.Hash256, // ロック用
  models.LockHashAlgorithm.SHA3_256, // ロック生成に使用したアルゴリズム
  proof, // 解除用
)

const txProof = facade.createTransactionFromTypedDescriptor(
  proofDescriptor,
  accountB.publicKey, // 解除する側を指定
  100,
  60 * 60 * 2,
)

const signatureProof = accountB.signTransaction(txProof) // 署名
const jsonPayloadProof = facade.transactionFactory.static.attachSignature(
  txProof,
  signatureProof,
) // ペイロード

const responseProof = await fetch(new URL("/transactions", NODE_URL), {
  method: "PUT",
  headers: { "Content-Type": "application/json" },
  body: jsonPayloadProof,
}).then((res) => res.json())

console.log({ responseProof })

const hashProof = facade.hashTransaction(txProof)

await awaitTransactionStatus(hashProof.toString(), NODE_URL, "confirmed")
