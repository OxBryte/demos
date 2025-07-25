import type { PoolKey } from "@uniswap/v4-sdk";
import { publicClient } from "./chain";
import { UniswapV4ABI, UniswapV4PoolManager } from "./univ4";
import { loadData } from "./utils";
import { SqrtPriceMath, TickMath } from "@uniswap/v3-sdk";
import { formatUnits } from "viem";

const START_BLOCK_NUMBER = 32964917n;
const END_BLOCK_NUMBER = START_BLOCK_NUMBER + 1000n;

const TBA_PAIRINGS = [
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC
  "0x4200000000000000000000000000000000000006", // WETH
];

// Helper function to create a delay
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const latestBlock = await publicClient.getBlockNumber();

  // Use latest block as starting point, or adjust as needed
  const startBlock = latestBlock - 1000n;
  const endBlock = latestBlock;

  const logs = await publicClient.getContractEvents({
    abi: UniswapV4ABI,
    address: UniswapV4PoolManager,
    fromBlock: START_BLOCK_NUMBER,
    toBlock: END_BLOCK_NUMBER,
    eventName: "Initialize",
  });

  const poolKeys = logs.map((log) => {
    return {
      currency0: log.args.currency0,
      currency1: log.args.currency1,
      fee: log.args.fee,
      tickSpacing: log.args.tickSpacing,
      hooks: log.args.hooks,
    };
  }) as PoolKey[];

  // const priceUpper = TickMath.getSqrtRatioAtTick(TickMath.MAX_TICK)
  // const priceLower = TickMath.getSqrtRatioAtTick(TickMath.MIN_TICK)

  // const amount0 = SqrtPriceMath.getAmount0Delta(pool.sqrtRatioX96, priceUpper, pool.liquidity, true);
  // const amount1 = SqrtPriceMath.getAmount1Delta(priceLower, pool.sqrtRatioX96, pool.liquidity, true)

  // const amount0HumanReadable = formatUnits(BigInt(amount0.toString()), pool.currency0.decimals);
  // const amount1HumanReadable = formatUnits(BigInt(amount1.toString()), pool.currency1.decimals);

  // const metadata = {
  //     id: pool.poolId,
  //     key: pool.poolKey,
  //     currency0: {
  //         name: pool.currency0.name,
  //         symbol: pool.currency0.symbol,
  //         decimals: pool.currency0.decimals,
  //         address: pool.currency0.wrapped.address,
  //     },
  //     currency1: {
  //         name: pool.currency1.name,
  //         symbol: pool.currency1.symbol,
  //         decimals: pool.currency1.decimals,
  //         address: pool.currency1.wrapped.address,
  //     },
  //     sqrtPriceX96: pool.sqrtRatioX96.toString(),
  //     tick: pool.tickCurrent,
  //     liquidity: pool.liquidity.toString(),
  //     liquidityCurrency0: amount0.toString(),
  //     liquidityCurrency1: amount1.toString(),
  //     liquidityCurrency0HumanReadable: `${amount0HumanReadable} ${pool.currency0.symbol}`,
  //     liquidityCurrency1HumanReadable: `${amount1HumanReadable} ${pool.currency1.symbol}`,
  //     currency0Price,
  //     currency1Price,
  //     currency0PriceHumanReadable: `1 ${pool.currency0.symbol} = ${currency0Price} ${pool.currency1.symbol}`,
  //     currency1PriceHumanReadable: `1 ${pool.currency1.symbol} = ${currency1Price} ${pool.currency0.symbol}`,
  //     coinType,
  //     appType
  // }

  // console.log(metadata)

  console.log(`Found ${poolKeys.length} pools to process`);

  for (let i = 0; i < poolKeys.length; i++) {
    const key = poolKeys[i];

    try {
      console.log(`Processing pool ${i + 1}/${poolKeys.length}...`);

      // Rate limit: add a delay of 10 seconds between requests
      if (i > 0) {
        console.log("Waiting 10 seconds before next request...");
        await sleep(10000);
      }

      if (!key) {
        console.error(`Skipping undefined pool key at index ${i}`);
        continue;
      }
      const pool = await loadData(key);

      const currency0Price = pool.currency0Price.toSignificant(6);
      const currency1Price = pool.currency1Price.toSignificant(6);

      let coinType: string | undefined;
      let appType = "ZORA";
      if (key?.hooks === "0xd61A675F8a0c67A73DC3B54FB7318B4D91409040") {
        coinType = "ZORA_CREATOR_COIN";
      } else if (key && key.hooks === "0x9ea932730A7787000042e34390B8E435dD839040") {
        coinType = "ZORA_V4_COIN";
      }
      // if it's not a zora coin, skip
      if (!coinType) continue;

      if (
        TBA_PAIRINGS.includes(pool.currency0.wrapped.address) ||
        TBA_PAIRINGS.includes(pool.currency1.wrapped.address)
      ) {
        appType = "TBA";
      }

      // Determine which currency is not in TBA_PAIRINGS
      let tokenCurrency;
      let price;

      if (TBA_PAIRINGS.includes(pool.currency0.wrapped.address)) {
        // Currency1 is the token we're interested in
        tokenCurrency = pool.currency1;
        price = currency1Price; // Price of currency1 in terms of currency0
      } else {
        // Currency0 is the token we're interested in
        tokenCurrency = pool.currency0;
        price = currency0Price; // Price of currency0 in terms of currency1
      }

      const metadata = {
        id: pool.poolId,
        name: tokenCurrency.name,
        symbol: tokenCurrency.symbol,
        decimals: tokenCurrency.decimals,
        address: tokenCurrency.wrapped.address,
        tick: pool.tickCurrent,
        sqrtPriceX96: pool.sqrtRatioX96.toString(),
        price: price,
        coinType,
        appType,
      };

      console.log(metadata);
    } catch (error) {
      console.error(`Error processing pool ${i + 1}:`, error);
      // Wait before trying the next pool
      console.log("Waiting 15 seconds before continuing...");
      await sleep(15000);
    }
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
