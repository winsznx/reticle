# Sponsor behaviour (measured)

Source: `scripts/phase0.ts`, raw numbers in `evidence/phase0.json`. Read-only, zero spend.

| Fact | Measured |
|---|---|
| Chain | X Layer mainnet, id 196 |
| Factory | `0x1f09DAeFA827f02CBb40967cc91b259763760761` |
| `deployFee()` | 0.0066 OKB (6600000000000000 wei) |
| `protocolFee()` | 0.00066 OKB (660000000000000 wei) |
| `TAPEOUT_FEE()` | 0.0013 OKB on every circuits contract sampled |
| `cpuCount()` | 307 at block 72728093 |
| `cpuAt(i)` | returns the **circuits** address; `transistors()` on it gives the ERC-1155 |
| sim vs eval | 7 of 7 live NAND circuits matched on every input (nIn 6 to 8). 3 skipped (sequential or non-NAND) |
| Netlist convention | confirmed: u24 big-endian, outputs are the last nOut gates, little-endian bit packing |
| `eth_call` gas on `rpc.xlayer.tech` | default 50,000,000 (a call needing more fails with `out of gas: gas required exceeds: 50000000`). An explicit `gas` field up to at least 1,000,000,000 was accepted. The 2e9 figure in `evidence/phase0.json` came from a probe that treated a missing failure as success and should be ignored |
| Eval gas | about 145k for a 36-gate circuit (about 4k per gate), 228k for a 71-gate one. Measured `ReticleRenderer.svg()` cost for 32×32 pieces is 5.7M to 11.5M gas (`evidence/gas.json`) |

Notes
- `supplyCap`, `mintPrice`, `creator` live on the **transistors** contract, not the circuits contract.
- Event signatures are decoded from receipts, never hardcoded.

- A bare `forge` fork test needs `evm_version = shanghai` or later, because the upstream beacon uses PUSH0.
- `tapeout` succeeded without `setApprovalForAll`. Ink is burned from the caller directly.
- Measured latencies on mainnet: tapeout ack 4.3 s and confirmed 5.8 s on average, `createCPU` ack 4.7 s and confirmed 7.3 s (`evidence/tapeouts.json`, `submission-facts.json`).
