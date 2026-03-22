// Lido Finance contract addresses and ABIs
// Mainnet addresses
export const LIDO_ADDRESSES = {
  mainnet: {
    stETH: "0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84",
    wstETH: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
    withdrawalQueue: "0x889edC2eDab5f40e902b864aD4d7AdE8E412F9B4",
    lidoOracle: "0x442af784A788A5bd6F42A01Ebe9F287a871243fb",
  },
  goerli: {
    stETH: "0x1643E812aE58766192Cf7D2Cf9567dF2C37e9B7",
    wstETH: "0x6320cD32aA674d2898A68ec82e869385Fc5f7E2",
    withdrawalQueue: "0xCF117961421cA9e546cD7f50bC73abCdB3039533",
    lidoOracle: "0x24d8551BD05AEc6a451EC111A0a03A2A40A439F",
  },
  holesky: {
    stETH: "0x3F1c547b21f65e10480dE3ad8E19fAAE172E1fBf",
    wstETH: "0x8d09a4502Cc8Cf1547aD300E066060D043f6982D",
    withdrawalQueue: "0xc7cc160b58F8Bb0baC94b80847E2CF2800565C50",
    lidoOracle: "0x072f72BE3AcFE2db032bc45359D7b4F50d8a5b93",
  },
};

// stETH ABI - key functions only
export const STETH_ABI = [
  // Read functions
  "function balanceOf(address account) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function getPooledEthByShares(uint256 sharesAmount) view returns (uint256)",
  "function getSharesByPooledEth(uint256 ethAmount) view returns (uint256)",
  "function getTotalPooledEther() view returns (uint256)",
  "function getTotalShares() view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function sharesOf(address account) view returns (uint256)",
  // Write functions
  "function submit(address referral) payable returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address recipient, uint256 amount) returns (bool)",
  // Events
  "event Transfer(address indexed from, address indexed to, uint256 value)",
  "event Submitted(address indexed sender, uint256 amount, address referral)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
];

// wstETH ABI
export const WSTETH_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function wrap(uint256 stETHAmount) returns (uint256)",
  "function unwrap(uint256 wstETHAmount) returns (uint256)",
  "function getWstETHByStETH(uint256 stETHAmount) view returns (uint256)",
  "function getStETHByWstETH(uint256 wstETHAmount) view returns (uint256)",
  "function stEthPerToken() view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
];

// Withdrawal Queue ABI
export const WITHDRAWAL_QUEUE_ABI = [
  "function requestWithdrawals(uint256[] amounts, address owner) returns (uint256[] requestIds)",
  "function requestWithdrawalsWstETH(uint256[] amounts, address owner) returns (uint256[] requestIds)",
  "function claimWithdrawal(uint256 requestId)",
  "function claimWithdrawals(uint256[] requestIds, uint256[] hints)",
  "function getWithdrawalRequests(address owner) view returns (uint256[] requestsIds)",
  "function getWithdrawalStatus(uint256[] requestIds) view returns (tuple(uint256 amountOfStETH, uint256 amountOfShares, address owner, uint256 timestamp, bool isFinalized, bool isClaimed)[])",
  "function findCheckpointHints(uint256[] requestIds, uint256 firstIndex, uint256 lastIndex) view returns (uint256[] hints)",
  "function getLastCheckpointIndex() view returns (uint256)",
  "function MIN_STETH_WITHDRAWAL_AMOUNT() view returns (uint256)",
  "function MAX_STETH_WITHDRAWAL_AMOUNT() view returns (uint256)",
];

// Lido APY API endpoint
export const LIDO_API = {
  apy: "https://eth-api.lido.fi/v1/protocol/steth/apr/sma",
  stats: "https://eth-api.lido.fi/v1/protocol/steth/stats",
  rewards: "https://eth-api.lido.fi/v1/protocol/steth/apr/last",
};
