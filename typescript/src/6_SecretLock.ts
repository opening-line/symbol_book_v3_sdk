// シークレット（ロック用のキー）とプルーフ（解除用のキー）を使って特定のモザイクの送付をロックしておくコード
import { PrivateKey, utils, Hash256 } from "symbol-sdk"
import {
  Network,
  SymbolFacade,
  descriptors,
  models,
} from "symbol-sdk/symbol"

import dotenv from "dotenv"
import sha3 from "js-sha3"
import {
  waitTransactionStatus,
  createAndSendTransaction,
} from "./functions"

dotenv.config()

const NODE_URL = process.env.NODE_URL!
const facade = new SymbolFacade(Network.TESTNET)
const privateKeyA = new PrivateKey(process.env.PRIVATE_KEY_A!)
const accountA = facade.createAccount(privateKeyA)
const privateKeyB = new PrivateKey(process.env.PRIVATE_KEY_B!)
const accountB = facade.createAccount(privateKeyB)

// 乱数でプルーフを生成する
const randomUint8 = crypto.getRandomValues(new Uint8Array(20))
// 16進数の文字列に変換
const proof = utils.uint8ToHex(randomUint8)

// SHA3-256ハッシュオブジェクトを作成
const hashObject = sha3.sha3_256.create()
// 同じ乱数をハッシュオブジェクトに追加
hashObject.update(randomUint8)

// ハッシュオブジェクトからシークレット（ロック用のキー）を生成
// 16進数の文字列に変換
const secret = hashObject.hex()

console.log({ proof })
console.log({ secret })

const secretLock1Descriptor =
  // シークレットロックトランザクション
  new descriptors.SecretLockTransactionV1Descriptor(
    accountB.address, // 送付先（解除先）のアドレス
    new Hash256(utils.hexToUint8(secret)), // シークレット
    new descriptors.UnresolvedMosaicDescriptor(
      // ロックしておくモザイクを指定
      new models.UnresolvedMosaicId(0x72C0212E67A08BCEn),
      new models.Amount(1000000n),
    ),
    new models.BlockDuration(480n), // ロック期間（ブロック数）
    models.LockHashAlgorithm.SHA3_256, // ロック生成に使用するアルゴリズム
  )

const hashLock = await createAndSendTransaction(
  secretLock1Descriptor,
  accountA,
)

console.log("===シークレットロックトランザクション===")
await waitTransactionStatus(
  hashLock.toString(),
  NODE_URL,
  "confirmed",
)

// （実際はこれ以降は別のコード上で実装するものだが、便宜上同じコード上に記載）
// ロックしているシークレット（オンチェーン上でも確認可能）を参照
// メール等何かの方法でプルーフを確認

const proofDescriptor =
  // シークレットプルーフトランザクション
  new descriptors.SecretProofTransactionV1Descriptor(
    accountB.address, // 解除先のアドレス
    new Hash256(utils.hexToUint8(secret)), // シークレット
    models.LockHashAlgorithm.SHA3_256, // ロック生成に使用したアルゴリズム
    utils.hexToUint8(proof), // プルーフ
  )

const hashProof = await createAndSendTransaction(
  proofDescriptor,
  accountB,
)

console.log("===シークレットプルーフトランザクション===")
await waitTransactionStatus(
  hashProof.toString(),
  NODE_URL,
  "confirmed",
)
