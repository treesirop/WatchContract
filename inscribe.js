const bitcoin = require("bitcoinjs-lib");
const axios = require("axios");
const tinySecp256k1 = require("tiny-secp256k1");
const ECPairFactory = require("ecpair").ECPairFactory;
const ECPair = ECPairFactory(tinySecp256k1);
require("dotenv").config();
// 使用比特币 testnet 网络
const network = bitcoin.networks.testnet;

// Step 1: 获取钱包的未花费 UTXO
async function getUnspentOutputs(address) {
  const url = `https://blockstream.info/testnet/api/address/${address}/utxo`;
  const response = await axios.get(url);
  console.log(response.data);
  return response.data;
}

// Step 2: 创建铭文交易 (用于部署 BRC-20 代币)
function createBRC20DeployTransaction(
  utxos,
  tick,
  maxSupply,
  mintLimit,
  keyPair
) {
  const psbt = new bitcoin.Psbt({ network });

  // 手动提供输出脚本地址
  const payment = bitcoin.payments.p2wpkh({
    pubkey: keyPair.publicKey,
    network,
  });

  const inputTotal = utxos.reduce((sum, utxo) => sum + utxo.value, 0); // 输入总和
  const fee = 5000; // 固定手续费

  // 添加输入，使用 UTXO
  utxos.forEach((utxo) => {
    psbt.addInput({
      hash: utxo.txid,
      index: utxo.vout,
      witnessUtxo: {
        script: payment.output, // 使用提供的公钥生成的脚本
        value: utxo.value,
      },
    });
  });

  // 创建 BRC-20 部署铭文内容
  const inscriptionContent = JSON.stringify({
    p: "brc-20", // BRC-20 协议
    op: "deploy", // 操作类型：部署
    tick: tick, // 代币符号
    max: maxSupply, // 最大供应量
    lim: mintLimit, // 每次 mint 的最大限额
  });

  // 创建铭文输出，包含铭文内容
  const inscriptionScript = bitcoin.script.compile([
    bitcoin.opcodes.OP_FALSE, // OP_FALSE 用于标记这是一个铭文
    bitcoin.opcodes.OP_IF, // OP_IF 后面跟随铭文数据
    Buffer.from("ord"), // Ordinals 标签
    Buffer.from(inscriptionContent), // 铭文的实际内容
    bitcoin.opcodes.OP_ENDIF, // OP_ENDIF 结束
  ]);

  const inscriptionValue = 546; // 锁定的铭文输出金额，通常最小为546 satoshis（dust limit）
  psbt.addOutput({
    script: inscriptionScript,
    value: inscriptionValue, // 输出设置铭文价值
  });

  // 设置找零地址和金额（输入 - 铭文输出 - 手续费）
  const changeValue = inputTotal - inscriptionValue - fee;
  if (changeValue < 0) {
    throw new Error("输入金额不足以支付铭文输出和手续费");
  }

  psbt.addOutput({
    address: payment.address, // 使用 keyPair 生成的地址
    value: changeValue,
  });

  return psbt;
}

// Step 3: 签名并发送交易
async function signAndSendTransaction(psbt, keyPair) {
  psbt.signAllInputs(keyPair);
  psbt.finalizeAllInputs();

  const txHex = psbt.extractTransaction().toHex();

  // 通过 API 广播交易
  const response = await axios.post(
    "https://blockstream.info/testnet/api/tx",
    txHex
  );
  return response.data;
}

// 主流程函数
(async () => {
  const key = process.env.BITCOIN_TESTNET_KEY;
  // 钱包地址和私钥（仅用于测试，实际使用时应妥善保护私钥）
  const keyPair = ECPair.fromWIF(key, network);
  const address = bitcoin.payments.p2wpkh({
    pubkey: keyPair.publicKey,
    network,
  }).address;

  // 获取 UTXO 和 BRC-20 部署参数
  const utxos = await getUnspentOutputs(address);
  const tick = "CAYRON"; // BRC-20 代币符号
  const maxSupply = "1000000"; // 最大供应量
  const mintLimit = "1000"; // 每笔 mint 的最大限额

  // 创建 BRC-20 部署交易
  const psbt = createBRC20DeployTransaction(
    utxos,
    tick,
    maxSupply,
    mintLimit,
    keyPair
  );

  // 签名并广播交易
  const txResult = await signAndSendTransaction(psbt, keyPair);
  console.log("Transaction Result:", txResult);
})();
