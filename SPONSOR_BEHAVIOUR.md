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
| `eth_call` gas cap on `rpc.xlayer.tech` | binary search reached 1,999,023,925 gas; the node does not enforce a low cap, wall-clock time is the limit |
| Eval gas per gate | 3.5k to 12k on tiny circuits (fixed overhead dominates); re-measured on our own circuits in `evidence/gas.json` |

Notes
- `supplyCap`, `mintPrice`, `creator` live on the **transistors** contract, not the circuits contract.
- Event signatures are decoded from receipts, never hardcoded.
