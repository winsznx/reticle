# Issuance

The processor was created once through the TapeOut factory. These parameters are immutable.

| Param | Value |
|---|---|
| name / symbol | Reticle / RTCL |
| transistorSupply (the cap) | 1,048,576 (2^20), one pool shared by NAND and LATCH |
| mintPrice | 0.00003 OKB (30000000000000 wei) per transistor |
| tapeout fee | read from the circuits contract at the time of each tapeout |
| protocol fee | read from the transistors contract at the time of each mint |

Story, written into the deploy call so the terms are public on chain:

```
Reticle: images that are circuits. Every image is a NAND circuit and renders from its own eval, wallet-free and gas-free for viewers. Ink = transistors. Supply cap 1,048,576 (shared NAND/LATCH), price 0.00003 OKB each, no other cap, immutable at deploy. One transistor burns per gate at tapeout. Mint proceeds go to the creator via owed()/withdraw(). Built on TapeOut upgradeable beacon contracts, unaudited.
```

## Why this price

At 0.00003 OKB a gate, a 16×16 icon of about 75 gates costs 0.00225 OKB of ink, and a full 32×32 formula piece costs 0.001 to 0.003 OKB. Cost per gate is real, so compression matters, and a hand-drawn 32×32 piece stays cheap. A sell-out of the whole supply would raise 31.5 OKB.

## What the team does with ink

Reticle mints ink only for its own tapeouts, one mint per tapeout, sized to the gate count. Every mint is listed in `evidence/mints.json` with its purpose. Reticle never buys, sells or transfers transistors between wallets.

Proceeds accrue to the creator through `owed()` and are pulled with `withdraw()`.
