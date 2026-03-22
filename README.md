# Lido MCP Server

> **Synthesis Hackathon submission — Lido Finance bounty ($5,000 track)**

An MCP (Model Context Protocol) server that gives any AI agent full access to Lido Finance's staking infrastructure through natural language. Stake ETH, manage positions, request withdrawals, and monitor protocol stats — all without writing a single line of smart contract code.

---

## What Is This?

Think of this like a universal control interface between AI agents and Lido's staking contracts. Like a PLC that speaks plain English instead of ladder logic — the complexity of ABI encoding, gas estimation, and checkpoint hints is abstracted behind simple tool calls.

Any MCP-compatible AI (Claude, GPT-4, etc.) can now say:
- *"Stake 0.5 ETH for me"*
- *"What's my current staking position?"*
- *"Request a withdrawal of 1 stETH"*
- *"What's the current APY?"*
- *"Wrap my stETH into wstETH for use in Aave"*

---

## Architecture

```
AI Agent (Claude/GPT)
       │  MCP Protocol (stdio)
       ▼
┌─────────────────────────┐
│   Lido MCP Server       │
│  ┌───────────────────┐  │
│  │  Tool Registry    │  │  ← 10 tools exposed
│  │  (index.ts)       │  │
│  └────────┬──────────┘  │
│           │              │
│  ┌────────▼──────────┐  │
│  │   Lido Client     │  │  ← ethers.js blockchain calls
│  │  (lido-client.ts) │  │
│  └────────┬──────────┘  │
└───────────┼─────────────┘
            │  JSON-RPC
            ▼
    Ethereum Node (RPC)
            │
            ▼
    Lido Smart Contracts
    ├── stETH (0xae7ab96...)
    ├── wstETH (0x7f39C5...)
    └── WithdrawalQueue (0x889ed...)
```

---

## Available Tools

| Tool | Description | Requires Wallet |
|------|-------------|-----------------|
| `get_staking_position` | Full position: ETH, stETH, wstETH balances | No |
| `stake_eth` | Deposit ETH → receive stETH | Yes |
| `request_withdrawal` | stETH → withdrawal NFT | Yes |
| `get_withdrawal_requests` | List all pending/finalized requests | No |
| `claim_withdrawal` | Claim finalized withdrawal → ETH | Yes |
| `wrap_to_wsteth` | stETH → wstETH (for DeFi protocols) | Yes |
| `get_lido_apy` | Current staking APY (SMA + last epoch) | No |
| `get_protocol_stats` | Total staked, stakers, market cap | No |
| `convert_steth_to_eth` | stETH amount → ETH value at live rate | No |
| `get_network_info` | Connected network and contract addresses | No |

---

## Setup

### Prerequisites
- Node.js 18+
- An Ethereum RPC URL (free tier: [Alchemy](https://alchemy.com), [Infura](https://infura.io), or public RPCs)

### Install

```bash
git clone <this-repo>
cd lido-mcp-server
npm install
npm run build
```

### Environment Variables

```bash
# Required
ETH_RPC_URL=https://eth-holesky.g.alchemy.com/v2/YOUR_KEY

# Network (mainnet | holesky | goerli) — default: holesky
LIDO_NETWORK=holesky

# Optional — enables staking/withdrawal transactions
PRIVATE_KEY=0xYOUR_PRIVATE_KEY

# Optional — referral address for Lido (get a cut of fees)
LIDO_REFERRAL=0xYOUR_REFERRAL_ADDRESS
```

> ⚠️ **Security**: Never expose your private key. Use a dedicated wallet for the agent with only the ETH you're comfortable having it manage. This is like giving someone a company card with a spending limit — not your main account.

### Run

```bash
# Production
npm start

# Development
npm run dev
```

### Connect to Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "lido": {
      "command": "node",
      "args": ["/path/to/lido-mcp-server/dist/index.js"],
      "env": {
        "ETH_RPC_URL": "https://eth-holesky.g.alchemy.com/v2/YOUR_KEY",
        "LIDO_NETWORK": "holesky",
        "PRIVATE_KEY": "0x..."
      }
    }
  }
}
```

### Connect to Claude Code / Any MCP Client

```bash
ETH_RPC_URL=<rpc> LIDO_NETWORK=holesky PRIVATE_KEY=0x... node dist/index.js
```

---

## Example Conversations

### Checking a position
```
User: How much have I staked on Lido?
Claude: [calls get_staking_position with your address]
→ "You have 2.4731 stETH (worth ~2.4819 ETH) and 0 wstETH on holesky."
```

### Staking ETH
```
User: Stake 0.1 ETH for me
Claude: [calls stake_eth with eth_amount: "0.1"]
→ "Successfully staked 0.1 ETH and received 0.0997 stETH.
   Transaction: https://holesky.etherscan.io/tx/0x..."
```

### Monitoring APY
```
User: What's the current Lido yield?
Claude: [calls get_lido_apy]
→ "Current Lido staking APY: 3.82% (7-day SMA). Most recent epoch: 3.91%"
```

---

## Security Model

- **Read-only by default**: Without `PRIVATE_KEY`, all write operations return a clear error message. No accidental transactions.
- **No key exposure**: The private key is only used to sign transactions — it's never logged or returned in tool responses.
- **Testnet first**: Default network is Holesky testnet. Explicitly set `LIDO_NETWORK=mainnet` to use real funds.
- **Balance checks**: All stake/withdraw tools verify sufficient balance before broadcasting.
- **Withdrawal limits**: Enforced at contract level + validated before submission to prevent failed transactions.

---

## On-Chain Addresses

### Mainnet
- stETH: `0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84`
- wstETH: `0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0`
- WithdrawalQueue: `0x889edC2eDab5f40e902b864aD4d7AdE8E412F9B4`

### Holesky (testnet)
- stETH: `0x3F1c547b21f65e10480dE3ad8E19fAAE172E1fBf`
- wstETH: `0x8d09a4502Cc8Cf1547aD300E066060D043f6982D`
- WithdrawalQueue: `0xc7cc160b58F8Bb0baC94b80847E2CF2800565C50`

---

## Bounty Context (Lido Finance — $5,000)

This submission targets the **reference MCP server** sub-bounty:

> *"A reference MCP server so any AI can stake funds and manage positions through a natural language conversation ($5,000)"*

What makes this more than a basic integration:
1. **Full lifecycle coverage**: stake → hold → wrap for DeFi → unwrap → withdraw → claim
2. **Testnet-first design**: Safe defaults, real credentials optional
3. **Production error handling**: Balance checks, finalization guards, chunk splitting for large withdrawals
4. **Zero-setup read mode**: APY, stats, and position queries work without any wallet
5. **Composable**: Designed so other agents can use this as a building block

---

## License
MIT
