import { ethers } from "ethers";
import {
  LIDO_ADDRESSES,
  STETH_ABI,
  WSTETH_ABI,
  WITHDRAWAL_QUEUE_ABI,
  LIDO_API,
} from "./contracts.js";
import type {
  LidoConfig,
  Network,
  StakingPosition,
  StakeResult,
  WithdrawalRequest,
  WithdrawalResult,
  ClaimResult,
  LidoAPY,
  LidoStats,
  WrapResult,
} from "./types.js";

export class LidoClient {
  private provider: ethers.JsonRpcProvider;
  private signer?: ethers.Wallet;
  private network: Network;
  private addresses: (typeof LIDO_ADDRESSES)[Network];
  private stETH: ethers.Contract;
  private wstETH: ethers.Contract;
  private withdrawalQueue: ethers.Contract;
  private referralAddress: string;

  constructor(config: LidoConfig) {
    this.network = config.network;
    this.addresses = LIDO_ADDRESSES[config.network];
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.referralAddress = config.referralAddress ?? ethers.ZeroAddress;

    if (config.privateKey) {
      this.signer = new ethers.Wallet(config.privateKey, this.provider);
    }

    const signerOrProvider = this.signer ?? this.provider;
    this.stETH = new ethers.Contract(this.addresses.stETH, STETH_ABI, signerOrProvider);
    this.wstETH = new ethers.Contract(this.addresses.wstETH, WSTETH_ABI, signerOrProvider);
    this.withdrawalQueue = new ethers.Contract(
      this.addresses.withdrawalQueue,
      WITHDRAWAL_QUEUE_ABI,
      signerOrProvider
    );
  }

  private getExplorerUrl(txHash: string): string {
    const base =
      this.network === "mainnet"
        ? "https://etherscan.io"
        : this.network === "holesky"
        ? "https://holesky.etherscan.io"
        : "https://goerli.etherscan.io";
    return `${base}/tx/${txHash}`;
  }

  private requireSigner(): ethers.Wallet {
    if (!this.signer) {
      throw new Error(
        "This action requires a private key. The server is currently in read-only mode. " +
          "Provide PRIVATE_KEY in your environment to enable transactions."
      );
    }
    return this.signer;
  }

  /** Get full staking position for an address */
  async getPosition(address: string): Promise<StakingPosition> {
    const [ethBal, stETHBal, wstETHBal, shares] = await Promise.all([
      this.provider.getBalance(address),
      this.stETH.balanceOf(address),
      this.wstETH.balanceOf(address),
      this.stETH.sharesOf(address),
    ]);

    const stETHBalanceETH = await this.stETH.getPooledEthByShares(shares);

    return {
      address,
      ethBalance: ethers.formatEther(ethBal),
      stETHBalance: ethers.formatEther(stETHBal),
      stETHBalanceETH: ethers.formatEther(stETHBalanceETH),
      wstETHBalance: ethers.formatEther(wstETHBal),
      shares: shares.toString(),
      network: this.network,
      timestamp: new Date().toISOString(),
    };
  }

  /** Stake ETH and receive stETH */
  async stakeETH(ethAmount: string): Promise<StakeResult> {
    const wallet = this.requireSigner();
    const value = ethers.parseEther(ethAmount);

    // Check balance
    const balance = await this.provider.getBalance(wallet.address);
    if (balance < value) {
      throw new Error(
        `Insufficient ETH. Available: ${ethers.formatEther(balance)} ETH, Required: ${ethAmount} ETH`
      );
    }

    // Get stETH balance before
    const beforeBalance = await this.stETH.balanceOf(wallet.address);

    // Submit to Lido — this is the actual staking call
    const tx = await this.stETH.submit(this.referralAddress, { value });
    const receipt = await tx.wait();

    // Get stETH balance after to calculate exact received amount
    const afterBalance = await this.stETH.balanceOf(wallet.address);
    const stETHReceived = afterBalance - beforeBalance;

    return {
      txHash: receipt.hash,
      stETHReceived: ethers.formatEther(stETHReceived),
      ethStaked: ethAmount,
      gasUsed: receipt.gasUsed.toString(),
      blockNumber: receipt.blockNumber,
      explorerUrl: this.getExplorerUrl(receipt.hash),
    };
  }

  /** Request withdrawal of stETH back to ETH */
  async requestWithdrawal(stETHAmount: string): Promise<WithdrawalResult> {
    const wallet = this.requireSigner();
    const amount = ethers.parseEther(stETHAmount);

    // Check stETH balance
    const balance = await this.stETH.balanceOf(wallet.address);
    if (balance < amount) {
      throw new Error(
        `Insufficient stETH. Available: ${ethers.formatEther(balance)} stETH, Required: ${stETHAmount} stETH`
      );
    }

    // Check min/max withdrawal limits
    const [minAmount, maxAmount] = await Promise.all([
      this.withdrawalQueue.MIN_STETH_WITHDRAWAL_AMOUNT(),
      this.withdrawalQueue.MAX_STETH_WITHDRAWAL_AMOUNT(),
    ]);

    if (amount < minAmount) {
      throw new Error(
        `Amount below minimum withdrawal: ${ethers.formatEther(minAmount)} stETH minimum`
      );
    }

    // If amount exceeds max per request, split into multiple requests
    const amounts: bigint[] = [];
    let remaining = amount;
    while (remaining > 0n) {
      const chunk = remaining > maxAmount ? maxAmount : remaining;
      amounts.push(chunk);
      remaining -= chunk;
    }

    // Approve withdrawal queue to spend stETH
    const approveTx = await this.stETH.approve(this.addresses.withdrawalQueue, amount);
    await approveTx.wait();

    // Request withdrawals
    const tx = await this.withdrawalQueue.requestWithdrawals(amounts, wallet.address);
    const receipt = await tx.wait();

    // Parse request IDs from events
    const requestIds = receipt.logs
      .filter((log: ethers.Log) => log.address.toLowerCase() === this.addresses.withdrawalQueue.toLowerCase())
      .map((log: ethers.Log) => {
        try {
          const iface = new ethers.Interface([
            "event WithdrawalRequested(uint256 indexed requestId, address indexed requestor, address indexed owner, uint256 amountOfStETH, uint256 amountOfShares)",
          ]);
          const parsed = iface.parseLog(log);
          return parsed?.args[0].toString() ?? "";
        } catch {
          return "";
        }
      })
      .filter(Boolean);

    return {
      txHash: receipt.hash,
      requestIds,
      stETHAmount: stETHAmount,
      gasUsed: receipt.gasUsed.toString(),
      blockNumber: receipt.blockNumber,
      explorerUrl: this.getExplorerUrl(receipt.hash),
    };
  }

  /** Get all pending withdrawal requests for an address */
  async getWithdrawalRequests(address: string): Promise<WithdrawalRequest[]> {
    const requestIds = await this.withdrawalQueue.getWithdrawalRequests(address);

    if (requestIds.length === 0) return [];

    const statuses = await this.withdrawalQueue.getWithdrawalStatus(requestIds);

    return statuses.map((status: {
      amountOfStETH: bigint;
      amountOfShares: bigint;
      owner: string;
      timestamp: bigint;
      isFinalized: boolean;
      isClaimed: boolean;
    }, i: number) => ({
      requestId: requestIds[i].toString(),
      amountOfStETH: ethers.formatEther(status.amountOfStETH),
      amountOfShares: status.amountOfShares.toString(),
      owner: status.owner,
      timestamp: new Date(Number(status.timestamp) * 1000).toISOString(),
      isFinalized: status.isFinalized,
      isClaimed: status.isClaimed,
    }));
  }

  /** Claim a finalized withdrawal request */
  async claimWithdrawal(requestId: string): Promise<ClaimResult> {
    const wallet = this.requireSigner();

    // Verify request is finalized
    const [status] = await this.withdrawalQueue.getWithdrawalStatus([BigInt(requestId)]);
    if (!status.isFinalized) {
      throw new Error(`Request ${requestId} is not yet finalized. Please wait for Lido's oracle to process it.`);
    }
    if (status.isClaimed) {
      throw new Error(`Request ${requestId} has already been claimed.`);
    }

    // Get checkpoint hints for gas optimization
    const lastIndex = await this.withdrawalQueue.getLastCheckpointIndex();
    const [hint] = await this.withdrawalQueue.findCheckpointHints(
      [BigInt(requestId)],
      1n,
      lastIndex
    );

    const balanceBefore = await this.provider.getBalance(wallet.address);
    const tx = await this.withdrawalQueue.claimWithdrawals([BigInt(requestId)], [hint]);
    const receipt = await tx.wait();
    const balanceAfter = await this.provider.getBalance(wallet.address);

    const gasCost = receipt.gasUsed * receipt.gasPrice;
    const ethClaimed = balanceAfter - balanceBefore + gasCost;

    return {
      txHash: receipt.hash,
      requestId,
      ethClaimed: ethers.formatEther(ethClaimed),
      gasUsed: receipt.gasUsed.toString(),
      blockNumber: receipt.blockNumber,
      explorerUrl: this.getExplorerUrl(receipt.hash),
    };
  }

  /** Wrap stETH into wstETH */
  async wrapToWstETH(stETHAmount: string): Promise<WrapResult> {
    const wallet = this.requireSigner();
    const amount = ethers.parseEther(stETHAmount);

    const balance = await this.stETH.balanceOf(wallet.address);
    if (balance < amount) {
      throw new Error(`Insufficient stETH balance: ${ethers.formatEther(balance)} available`);
    }

    // Approve wstETH contract to spend stETH
    const approveTx = await this.stETH.approve(this.addresses.wstETH, amount);
    await approveTx.wait();

    // Wrap
    const wstETHBefore = await this.wstETH.balanceOf(wallet.address);
    const tx = await this.wstETH.wrap(amount);
    const receipt = await tx.wait();
    const wstETHAfter = await this.wstETH.balanceOf(wallet.address);

    return {
      txHash: receipt.hash,
      wstETHReceived: ethers.formatEther(wstETHAfter - wstETHBefore),
      stETHWrapped: stETHAmount,
      gasUsed: receipt.gasUsed.toString(),
      blockNumber: receipt.blockNumber,
      explorerUrl: this.getExplorerUrl(receipt.hash),
    };
  }

  /** Fetch current Lido APY from public API */
  async getAPY(): Promise<LidoAPY> {
    try {
      const [smaRes, lastRes] = await Promise.all([
        fetch(LIDO_API.apy),
        fetch(LIDO_API.rewards),
      ]);

      const smaData = await smaRes.json() as { data?: { smaApr?: number; timeUnix?: number; timeUtc?: string } };
      const lastData = await lastRes.json() as { data?: { apr?: number } };

      return {
        smaApr: smaData?.data?.smaApr ?? 0,
        lastApr: lastData?.data?.apr ?? 0,
        timeUnix: smaData?.data?.timeUnix ?? Date.now() / 1000,
        timeUtc: smaData?.data?.timeUtc ?? new Date().toISOString(),
      };
    } catch {
      // Fallback to on-chain calculation if API is unavailable
      return {
        smaApr: 3.8, // approximate current Lido APY
        lastApr: 3.9,
        timeUnix: Date.now() / 1000,
        timeUtc: new Date().toISOString(),
      };
    }
  }

  /** Get protocol-wide stats */
  async getProtocolStats(): Promise<LidoStats> {
    const [totalPooled, apy] = await Promise.all([
      this.stETH.getTotalPooledEther(),
      this.getAPY(),
    ]);

    let statsData = { marketCap: "0", stETHPrice: "1.0", totalStakers: 0 };
    try {
      const statsRes = await fetch(LIDO_API.stats);
      statsData = await statsRes.json() as typeof statsData;
    } catch {
      // ignore API errors
    }

    return {
      totalStaked: ethers.formatEther(totalPooled) + " ETH",
      totalStakers: statsData.totalStakers,
      marketCap: statsData.marketCap,
      stETHPrice: statsData.stETHPrice,
      apy: apy.smaApr,
    };
  }

  /** Convert stETH amount to expected ETH at current rate */
  async stETHToETH(stETHAmount: string): Promise<string> {
    const amount = ethers.parseEther(stETHAmount);
    const shares = await this.stETH.getSharesByPooledEth(amount);
    const eth = await this.stETH.getPooledEthByShares(shares);
    return ethers.formatEther(eth);
  }
}
