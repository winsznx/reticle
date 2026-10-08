export const factoryAbi = [
  { type: "function", name: "deployFee", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "protocolFee", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "cpuCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "cpuAt", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "address" }] },
  { type: "function", name: "isCPU", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "bool" }] },
  {
    type: "function",
    name: "createCPU",
    stateMutability: "payable",
    inputs: [
      { name: "name", type: "string" },
      { name: "symbol", type: "string" },
      { name: "story", type: "string" },
      { name: "transistorSupply", type: "uint256" },
      { name: "mintPrice", type: "uint256" },
    ],
    outputs: [
      { name: "transistors", type: "address" },
      { name: "circuits", type: "address" },
    ],
  },
] as const;

export const circuitsAbi = [
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "nextId", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "transistors", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "TAPEOUT_FEE", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "ownerOf", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "address" }] },
  {
    type: "function",
    name: "circuitInfo",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [
      { name: "nIn", type: "uint32" },
      { name: "nOut", type: "uint32" },
      { name: "nState", type: "uint32" },
      { name: "gateCount", type: "uint32" },
    ],
  },
  { type: "function", name: "netlist", stateMutability: "view", inputs: [{ type: "uint256" }], outputs: [{ type: "bytes" }] },
  { type: "function", name: "eval", stateMutability: "view", inputs: [{ type: "uint256" }, { type: "bytes" }], outputs: [{ type: "bytes" }] },
  {
    type: "function",
    name: "tapeout",
    stateMutability: "payable",
    inputs: [
      { name: "nl", type: "bytes" },
      { name: "nIn", type: "uint32" },
      { name: "nOut", type: "uint32" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { indexed: true, name: "from", type: "address" },
      { indexed: true, name: "to", type: "address" },
      { indexed: true, name: "tokenId", type: "uint256" },
    ],
  },
  { type: "function", name: "isApprovedForAll", stateMutability: "view", inputs: [{ type: "address" }, { type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "setApprovalForAll", stateMutability: "nonpayable", inputs: [{ type: "address" }, { type: "bool" }], outputs: [] },
] as const;

export const transistorsAbi = [
  { type: "function", name: "mintPrice", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "protocolFee", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "supplyCap", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "minted", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "creator", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "owed", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "mint", stateMutability: "payable", inputs: [{ type: "uint256" }, { type: "uint256" }], outputs: [] },
  { type: "function", name: "withdraw", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

export const rendererAbi = [
  { type: "function", name: "shape", stateMutability: "view", inputs: [{ type: "address" }, { type: "uint256" }], outputs: [{ name: "w", type: "uint8" }, { name: "frames", type: "uint8" }, { name: "gates", type: "uint32" }] },
  { type: "function", name: "row", stateMutability: "view", inputs: [{ type: "address" }, { type: "uint256" }, { type: "uint8" }, { type: "uint8" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "rows", stateMutability: "view", inputs: [{ type: "address" }, { type: "uint256" }, { type: "uint8" }], outputs: [{ type: "uint256[]" }] },
  { type: "function", name: "svg", stateMutability: "view", inputs: [{ type: "address" }, { type: "uint256" }, { type: "uint8" }], outputs: [{ type: "string" }] },
] as const;
