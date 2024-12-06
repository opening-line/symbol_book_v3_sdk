import { utils } from "symbol-sdk"
import { Address } from "symbol-sdk/symbol"

// オブジェクト内のアドレス、メッセージ、メタデータの値を16進数文字列から元の値に変換する
export const convertHexValuesInObject = (obj: Record<string, any>): Record<string, any> => {
    return Object.entries(obj).reduce((acc, [key, value]) => {
      // アドレスの変換
      if (key.toLowerCase().includes('address')) {
        acc[key] = Address.fromDecodedAddressHexString(value).toString()
      // メッセージ、メタデータの値の変換
      } else if (key === 'message' || key === 'value') {
        acc[key] = new TextDecoder().decode(utils.hexToUint8(value))
      // ネストされたオブジェクトも再帰的に処理
      } else if (typeof value === 'object' && value !== null) {
        acc[key] = convertHexValuesInObject(value)
      } else {
        acc[key] = value
      }
      return acc
    }, {} as Record<string, any>)
  }