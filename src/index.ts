#!/usr/bin/env node
/**
 * Lido Finance MCP Server
 *
 * Gives any AI agent the ability to stake ETH, manage stETH positions,
 * request withdrawals, and monitor Lido protocol stats — all through
 * natural language via the Model Context Protocol.
 *
 * Think of this as the universal control interface between AI and Lido:
 * like a PLC that speaks plain English instead of ladder logic.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { LidoClient } from "./lido-client.js";
import type { Network } from "./types.js";

// ── Configuration from environment ──────────────────────────────────────────
const NETWORK = (process.env.LIDO_NETWORK ?? "holesky") as Network;
const RPC_URL =
  process.env.ETH_RPC_URL ??
  (NETWORK === "mainnet"
    ? "https://eth.llamarpc.com"
    : NETWORK === "holesky"
    ? "https://holesky.beaconcha.in/api/eth/execution/holesky"
    : "https://rpc.ankr.com/eth_goerli");
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const REFERRAL_ADDRESS = process.env.LIDO_REFERRAL ?? undefined;

// ── Lido client ──────────────────────────────────────────────────────────────
const lido = new LidoClient({
  network: NETWORK,
  rpcUrl: RPC_URL,
  privateKey: PRIVATE_KEY,
  referralAddress: REFERRAL_ADDRESS,
});

// ── MCP Server ───────────────────────────────────────────────────────────────
const server = new Server(
  {
    name: "lido-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ── Tool definitions ─────────────────────────────────────────────────────────
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_staking_position",
      description:
        "Get the complete Lido staking position for a wallet address. " +
        "Returns ETH balance, stETH balance, wstETH balance, underlying ETH value, and shares held. " +
        "Use this to check how much someone has staked and what it's worth.",
      inputSchema: {
        type: "object",
        properties: {
          address: {
            type: "string",
            description: "Ethereum wallet address (0x...)",
          },
        },
        required: ["address"],
      },
    },
    {
      name: "stake_eth",
      description:
        "Stake ETH with Lido to receive stETH. The ETH is deposited into Lido's staking pool and " +
        "you receive stETH tokens that automatically earn staking rewards (~3-4% APY). " +
        "Requires PRIVATE_KEY environment variable to be set. " +
        "Use on testnet first to verify the integration works.",
      inputSchema: {
        type: "object",
        properties: {
          eth_amount: {
            type: "string",
            description:
              "Amount of ETH to stake as a decimal string (e.g. '0.1' for 0.1 ETH)",
          },
        },
        required: ["eth_amount"],
      },
    },
    {
      name: "request_withdrawal",
      description:
        "Request withdrawal of stETH back to ETH. Creates a withdrawal NFT that can be claimed " +
        "once the withdrawal is finalized by Lido's oracle (typically 1-5 days). " +
        "Requires PRIVATE_KEY environment variable. Minimum withdrawal is 100 wei of stETH.",
      inputSchema: {
        type: "object",
        properties: {
          steth_amount: {
            type: "string",
            description: "Amount of stETH to withdraw as a decimal string (e.g. '0.5')",
          },
        },
        required: ["steth_amount"],
      },
    },
    {
      name: "get_withdrawal_requests",
      description:
        "Get all pending withdrawal requests for a wallet address. " +
        "Shows request IDs, amounts, timestamps, and whether they are finalized and claimable.",
      inputSchema: {
        type: "object",
        properties: {
          address: {
            type: "string",
            description: "Ethereum wallet address (0x...)",
          },
        },
        required: ["address"],
      },
    },
    {
      name: "claim_withdrawal",
      description:
        "Claim a finalized withdrawal request to receive ETH back in your wallet. " +
        "The request must be finalized first (check get_withdrawal_requests). " +
        "Requires PRIVATE_KEY environment variable.",
      inputSchema: {
        type: "object",
        properties: {
          request_id: {
            type: "string",
            description: "The withdrawal request ID (from request_withdrawal or get_withdrawal_requests)",
          },
        },
        required: ["request_id"],
      },
    },
    {
      name: "wrap_to_wsteth",
      description:
        "Wrap stETH into wstETH (wrapped staked ETH). " +
        "wstETH is the non-rebasing version of stETH — useful for DeFi protocols that " +
        "can't handle rebasing tokens. The rewards are reflected in the exchange rate instead. " +
        "Requires PRIVATE_KEY environment variable.",
      inputSchema: {
        type: "object",
        properties: {
          steth_amount: {
            type: "string",
            description: "Amount of stETH to wrap (e.g. '1.0')",
          },
        },
        required: ["steth_amount"],
      },
    },
    {
      name: "get_lido_apy",
      description:
        "Get the current Lido staking APY (Annual Percentage Yield). " +
        "Returns the simple moving average APR and the most recent epoch APR.",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
      },
    },
    {
      name: "get_protocol_stats",
      description:
        "Get Lido protocol-wide statistics: total ETH staked, number of stakers, " +
        "market cap, stETH price, and current APY.",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
      },
    },
    {
      name: "convert_steth_to_eth",
      description:
        "Convert a stETH amount to its current ETH equivalent value using the live exchange rate. " +
        "Useful for calculating the real ETH value of a staking position.",
      inputSchema: {
        type: "object",
        properties: {
          steth_amount: {
            type: "string",
            description: "Amount of stETH to convert (e.g. '2.5')",
          },
        },
        required: ["steth_amount"],
      },
    },
    {
      name: "resolve_ens_name",
      description:
        "Resolve an ENS name (e.g. \'vitalik.eth\') to an Ethereum address. " +
        "Useful for agent identity — agents can be referenced by human-readable names " +
        "rather than 42-character hex strings.",
      inputSchema: {
        type: "object",
        properties: {
          ens_name: {
            type: "string",
            description: "ENS name to resolve (e.g. \'vitalik.eth\', \'lido.eth\')",
          },
        },
        required: ["ens_name"],
      },
    },
        {
      name: "get_network_info",
      description:
        "Get information about the current network configuration and contract addresses the server is connected to.",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  ],
}));

// ── Tool handlers ─────────────────────────────────────────────────────────────
server.setRequestHandler(CallToolRequestSchema, async (request: { params: { name: string; arguments?: Record<string, unknown> } }) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "get_staking_position": {
        const position = await lido.getPosition(args!.address as string);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  ...position,
                  summary: `${position.stETHBalance} stETH (≈ ${position.stETHBalanceETH} ETH) + ${position.wstETHBalance} wstETH on ${position.network}`,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "stake_eth": {
        const result = await lido.stakeETH(args!.eth_amount as string);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  ...result,
                  summary: `Successfully staked ${result.ethStaked} ETH and received ${result.stETHReceived} stETH. View on Etherscan: ${result.explorerUrl}`,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "request_withdrawal": {
        const result = await lido.requestWithdrawal(args!.steth_amount as string);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  ...result,
                  summary: `Withdrawal requested for ${result.stETHAmount} stETH. Request IDs: ${result.requestIds.join(", ")}. Withdrawal typically takes 1-5 days to finalize.`,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_withdrawal_requests": {
        const requests = await lido.getWithdrawalRequests(args!.address as string);
        const claimable = requests.filter((r) => r.isFinalized && !r.isClaimed);
        const pending = requests.filter((r) => !r.isFinalized);
        const claimed = requests.filter((r) => r.isClaimed);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  requests,
                  summary: {
                    total: requests.length,
                    claimable: claimable.length,
                    pending: pending.length,
                    claimed: claimed.length,
                  },
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "claim_withdrawal": {
        const result = await lido.claimWithdrawal(args!.request_id as string);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  ...result,
                  summary: `Successfully claimed ${result.ethClaimed} ETH for request ${result.requestId}. View on Etherscan: ${result.explorerUrl}`,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "wrap_to_wsteth": {
        const result = await lido.wrapToWstETH(args!.steth_amount as string);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  ...result,
                  summary: `Wrapped ${result.stETHWrapped} stETH into ${result.wstETHReceived} wstETH.`,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_lido_apy": {
        const apy = await lido.getAPY();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  ...apy,
                  summary: `Current Lido staking APY: ${apy.smaApr.toFixed(2)}% (7-day SMA). Most recent epoch: ${apy.lastApr.toFixed(2)}%`,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_protocol_stats": {
        const stats = await lido.getProtocolStats();
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(stats, null, 2),
            },
          ],
        };
      }

      case "convert_steth_to_eth": {
        const eth = await lido.stETHToETH(args!.steth_amount as string);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  stETHAmount: args!.steth_amount,
                  ethValue: eth,
                  summary: `${args!.steth_amount} stETH is worth approximately ${eth} ETH at current rates`,
                },
                null,
                2
              ),
            },
          ],
        };
      }


      case "resolve_ens_name": {
        const name = args!.ens_name as string;
        const { ethers } = await import("ethers");
        const resolved = await lido["provider"].resolveName(name);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  ensName: name,
                  address: resolved,
                  resolved: resolved !== null,
                  summary: resolved
                    ? `${name} resolves to ${resolved}`
                    : `${name} could not be resolved — name may not exist or have no ETH record`,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      case "get_network_info": {
        const { LIDO_ADDRESSES } = await import("./contracts.js");
        const addresses = LIDO_ADDRESSES[NETWORK];
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  network: NETWORK,
                  rpcUrl: RPC_URL,
                  readOnly: !PRIVATE_KEY,
                  contracts: addresses,
                  summary: `Connected to ${NETWORK} in ${PRIVATE_KEY ? "read-write" : "read-only"} mode`,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new McpError(ErrorCode.InternalError, `Tool execution failed: ${message}`);
  }
});

// ── Start server ─────────────────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Lido MCP Server running on ${NETWORK} (${PRIVATE_KEY ? "read-write" : "read-only mode"})`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
