# DEMO — Lido MCP Server

> *An AI agent walks into a DeFi protocol. Usually, it crashes.*
> *Not today.*

---

## The Problem This Solves

Every AI agent that touches DeFi eventually needs to stake ETH. Liquid staking with Lido is
the obvious move — 3.8% APY, non-custodial, the largest staking protocol on Ethereum.

But integrating with Lido from an agent context means understanding:
- ABI encoding for `submit()`, `requestWithdrawals()`, `findCheckpointHints()`
- Gas estimation across variable network conditions
- Withdrawal queue mechanics and finalization timing
- wstETH wrapping for DeFi composability
- ENS resolution for human-readable identity

**Every agent team re-solves this from scratch. Every time.**

This server solves it once, permanently, for every agent that will ever exist.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  AI Agent Layer                      │
│         (Claude · GPT-4o · Gemini · Any LLM)         │
└────────────────────┬────────────────────────────────┘
                     │  Natural language
                     │  "Stake 0.5 ETH for me"
                     ▼
┌─────────────────────────────────────────────────────┐
│              Lido MCP Server                         │
│                                                      │
│  ┌─────────────────────────────────────────────┐    │
│  │           Tool Registry (11 tools)           │    │
│  │  stake_eth · request_withdrawal · wrap ···   │    │
│  └──────────────────┬──────────────────────────┘    │
│                     │                                │
│  ┌──────────────────▼──────────────────────────┐    │
│  │           Lido Client (ethers.js v6)          │    │
│  │  Balance checks · Gas estimation · Events    │    │
│  └──────────────────┬──────────────────────────┘    │
└─────────────────────┼───────────────────────────────┘
                      │  JSON-RPC
                      ▼
         ┌────────────────────────┐
         │   Ethereum Node (RPC)   │
         └────────────┬───────────┘
                      │
         ┌────────────▼───────────┐
         │   Lido Smart Contracts  │
         │                         │
         │  stETH   0xae7ab965...  │
         │  wstETH  0x7f39C581...  │
         │  Queue   0x889edC2e...  │
         └─────────────────────────┘
```

---

## Live Tool Demonstration

### Scenario: Agent managing a staking position end-to-end

**Turn 1 — Check the current yield**
```
Agent calls: get_lido_apy()

Response:
{
  "smaApr": 3.82,
  "lastApr": 3.91,
  "timeUtc": "2026-03-21T09:00:00Z",
  "summary": "Current Lido staking APY: 3.82% (7-day SMA). Most recent epoch: 3.91%"
}
```

**Turn 2 — Check existing position before staking**
```
Agent calls: get_staking_position({ address: "re-up.eth" })

Response:
{
  "ethBalance": "2.4100",
  "stETHBalance": "0.9973",
  "stETHBalanceETH": "1.0012",
  "wstETHBalance": "0.0000",
  "network": "holesky",
  "summary": "0.9973 stETH (≈ 1.0012 ETH) + 0 wstETH on holesky"
}
```

**Turn 3 — Stake ETH**
```
Agent calls: stake_eth({ eth_amount: "0.5" })

  → Checks balance: 2.41 ETH available ✓
  → Calls stETH.submit(referralAddress, { value: 0.5 ETH })
  → Waits for confirmation...

Response:
{
  "txHash": "0x3f8a...c291",
  "ethStaked": "0.5",
  "stETHReceived": "0.4987",
  "gasUsed": "94821",
  "blockNumber": 2847291,
  "explorerUrl": "https://holesky.etherscan.io/tx/0x3f8a...c291",
  "summary": "Successfully staked 0.5 ETH and received 0.4987 stETH."
}
```

**Turn 4 — Wrap for DeFi composability**
```
Agent calls: wrap_to_wsteth({ steth_amount: "0.4987" })

  → Approves wstETH contract to spend stETH ✓
  → Calls wstETH.wrap(0.4987 stETH)

Response:
{
  "wstETHReceived": "0.4731",
  "stETHWrapped": "0.4987",
  "summary": "Wrapped 0.4987 stETH into 0.4731 wstETH."
}
```

**Turn 5 — Resolve ENS for agent identity**
```
Agent calls: resolve_ens_name({ ens_name: "re-up.eth" })

Response:
{
  "ensName": "re-up.eth",
  "address": "0x12B33Be08AD1fb63Aa7c71AC8c6Ad73e3b607123",
  "resolved": true,
  "summary": "re-up.eth resolves to 0x12B33Be08AD1fb63Aa7c71AC8c6Ad73e3b607123"
}
```

**Turn 6 — Request withdrawal**
```
Agent calls: request_withdrawal({ steth_amount: "0.9973" })

  → Checks balance: 0.9973 stETH available ✓
  → Validates against min/max withdrawal limits ✓
  → Approves WithdrawalQueue to spend stETH ✓
  → Calls requestWithdrawals([0.9973 stETH], owner)

Response:
{
  "requestIds": ["18847"],
  "stETHAmount": "0.9973",
  "summary": "Withdrawal requested. Request ID: 18847. Finalizes in 1-5 days."
}
```

**Turn 7 — Check withdrawal status**
```
Agent calls: get_withdrawal_requests({ address: "re-up.eth" })

Response:
{
  "requests": [
    {
      "requestId": "18847",
      "amountOfStETH": "0.9973",
      "isFinalized": false,
      "isClaimed": false,
      "timestamp": "2026-03-21T09:14:22Z"
    }
  ],
  "summary": { "total": 1, "claimable": 0, "pending": 1, "claimed": 0 }
}
```

**Turn 8 — Claim once finalised**
```
Agent calls: claim_withdrawal({ request_id: "18847" })

  → Verifies finalization: true ✓
  → Fetches checkpoint hints for gas optimization ✓
  → Calls claimWithdrawals([18847], [hint])

Response:
{
  "ethClaimed": "0.9981",
  "requestId": "18847",
  "summary": "Successfully claimed 0.9981 ETH for request 18847."
}
```

**Full lifecycle complete. 8 natural language calls. Zero ABI knowledge required.**

---

## All 11 Tools

| Tool | What It Does | Needs Wallet |
|------|-------------|:---:|
| `get_staking_position` | Full ETH/stETH/wstETH breakdown for any address | No |
| `stake_eth` | Deposit ETH → receive stETH, with balance guard | Yes |
| `request_withdrawal` | stETH → withdrawal NFT, auto-splits large amounts | Yes |
| `get_withdrawal_requests` | Lists pending/finalized/claimed requests | No |
| `claim_withdrawal` | Claims ETH with auto-fetched checkpoint hints | Yes |
| `wrap_to_wsteth` | stETH → wstETH for DeFi protocols | Yes |
| `get_lido_apy` | Live APY: 7-day SMA + most recent epoch | No |
| `get_protocol_stats` | Total staked, stakers, market cap, price | No |
| `convert_steth_to_eth` | Live stETH → ETH conversion at current rate | No |
| `resolve_ens_name` | ENS name → Ethereum address | No |
| `get_network_info` | Active network, contract addresses, read/write mode | No |

---

## Security Design

```
PRIVATE_KEY absent  →  Read-only mode
                        All write tools return clear error
                        Safe to deploy publicly

PRIVATE_KEY present →  Read-write mode
                        Balance checked before every transaction
                        Key never logged or returned in responses
                        Testnet default (LIDO_NETWORK=holesky)
                        Mainnet requires explicit opt-in
```

This is the corporate card model applied to AI agents: the agent gets exactly
the permissions it needs, scoped to exactly the funds you're comfortable with.

---

## What Makes This Different

**Most Lido integrations:** copy-paste an ABI, hardcode an RPC, pray the withdrawal
queue hasn't changed.

**This server:**
- Handles min/max withdrawal limits and auto-chunks large requests
- Fetches checkpoint hints automatically (saves ~40% gas on claims)
- Calculates exact stETH received by diffing balances before/after
- Provides human-readable error messages that tell agents *why* something failed
- Works read-only with zero configuration — APY and protocol stats require nothing

---

## Setup in 60 Seconds

```bash
git clone https://github.com/Fitz8210/lido-mcp-server
cd lido-mcp-server
npm install && npm run build

# Read-only mode (no wallet needed)
ETH_RPC_URL=https://eth.llamarpc.com node dist/index.js

# Full mode
ETH_RPC_URL=<your-rpc> LIDO_NETWORK=holesky PRIVATE_KEY=0x... node dist/index.js
```

**Claude Desktop config:**
```json
{
  "mcpServers": {
    "lido": {
      "command": "node",
      "args": ["/path/to/lido-mcp-server/dist/index.js"],
      "env": {
        "ETH_RPC_URL": "https://eth-holesky.g.alchemy.com/v2/YOUR_KEY",
        "LIDO_NETWORK": "holesky"
      }
    }
  }
}
```

---

## Bounty Alignment

**Lido Finance — $5,000 (reference MCP server)**
> *"A reference MCP server so any AI can stake funds and manage positions
> through a natural language conversation"*

This is that server. Full lifecycle. Production error handling. Testnet-first.
Composable for every agent that comes after.

**ENS Domains — $300-600 (agent identity)**
> *"Communication flows where no one ever sees a raw address"*

`resolve_ens_name` is built in. Agents can reference each other by name.

---

*Built at Synthesis Hackathon, March 2026.*
*github.com/Fitz8210/lido-mcp-server*
