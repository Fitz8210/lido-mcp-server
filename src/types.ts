export type Network = "mainnet" | "goerli" | "holesky";

export interface LidoConfig {
  network: Network;
  rpcUrl: string;
  privateKey?: string; // Optional — read-only mode if not provided
  referralAddress?: string;
}

export interface StakingPosition {
  address: string;
  ethBalance: string;
  stETHBalance: string;
  stETHBalanceETH: string; // stETH value in ETH terms
  wstETHBalance: string;
  shares: string;
  network: Network;
  timestamp: string;
}

export interface WithdrawalRequest {
  requestId: string;
  amountOfStETH: string;
  amountOfShares: string;
  owner: string;
  timestamp: string;
  isFinalized: boolean;
  isClaimed: boolean;
  estimatedETH?: string;
}

export interface StakeResult {
  txHash: string;
  stETHReceived: string;
  ethStaked: string;
  gasUsed: string;
  blockNumber: number;
  explorerUrl: string;
}

export interface WithdrawalResult {
  txHash: string;
  requestIds: string[];
  stETHAmount: string;
  gasUsed: string;
  blockNumber: number;
  explorerUrl: string;
}

export interface ClaimResult {
  txHash: string;
  requestId: string;
  ethClaimed: string;
  gasUsed: string;
  blockNumber: number;
  explorerUrl: string;
}

export interface LidoAPY {
  smaApr: number;        // Simple moving average APR
  lastApr: number;       // Most recent epoch APR
  timeUnix: number;
  timeUtc: string;
}

export interface LidoStats {
  totalStaked: string;
  totalStakers: number;
  marketCap: string;
  stETHPrice: string;
  apy: number;
}

export interface WrapResult {
  txHash: string;
  wstETHReceived: string;
  stETHWrapped: string;
  gasUsed: string;
  blockNumber: number;
  explorerUrl: string;
}
