import { createPublicClient, http } from "viem";
import { config } from "./config";
import { forestChainToViemChain, httpTransport } from "@forest-protocols/sdk";

export const rpcClient = createPublicClient({
  chain: forestChainToViemChain(config.CHAIN),
  transport: httpTransport(config.CHAIN, config.RPC_HOST),
});
