from symbolchain.facade.SymbolFacade import SymbolFacade
from symbolchain.sc import UnresolvedAddress
from binascii import unhexlify

# オブジェクト内のアドレス、メッセージ、メタデータの値を16進数文字列から元の値に変換する
def convert_hex_values_in_object(obj):
    facade = SymbolFacade('testnet')

    if isinstance(obj, dict):
        result = {}
        for key, value in obj.items():
            # アドレスの変換
            if 'address' in key.lower():
                try:
                    # 16進数文字列からアドレスオブジェクトを生成し、文字列に変換
                    result[key] = str(facade.Address(UnresolvedAddress(value).bytes))
                except:
                    result[key] = value
            # メッセージ、メタデータの値の変換
            elif key in ['message', 'value']:
                try:
                    # 16進数文字列をバイトに変換し、UTF-8でデコード
                    result[key] = unhexlify(value).decode('utf-8')
                except:
                    result[key] = value
            # ネストされたオブジェクトも再帰的に処理
            elif isinstance(value, (dict, list)):
                result[key] = convert_hex_values_in_object(value)
            else:
                result[key] = value
        return result
    elif isinstance(obj, list):
        return [convert_hex_values_in_object(item) for item in obj]
    else:
        return obj