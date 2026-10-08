# Threats and limits

Reticle is a hackathon build. It is unaudited.

## Upstream

- The TapeOut contracts are upgradeable beacons. Their owner can change circuit behavior for every processor, including this one. Reticle does not control this. The proof page shows what the chain returns today, with a block number.
- A circuit's `eval` is the source of truth for its picture. If upstream logic changed, a render could change. Pinning is impossible from outside the upstream contracts. Recheck with the Verify button.

## Reticle contracts

- `ReticleRenderer` is view-only, ownerless, holds no funds, has no admin. It trusts the `circuits` address passed in and only reads from it. A hostile contract at that address can return any bytes, so the renderer is useful only for circuits you already trust.
- Shape checks refuse non-square, sequential and over-wide circuits.

## Client

- The formula parser is hand written. It has no `eval` and no `Function`, a length limit and a depth limit.
- Image upload runs entirely in the browser. No network request is made with the image.
- The embed trusts the RPC it reaches. It tries three public endpoints in order and returns an error state on failure. It does not verify the node's answer. A malicious node could return a different picture. The Verify button on a piece page re-reads through a second path, and any consumer can compare the SVG with the renderer output.
- The embed only writes a `data:image/svg+xml` source. It never injects the SVG into the DOM.
- The web app never holds a key. Transactions are signed by the user's injected wallet.

## Economics

- Minting before tapeout costs real OKB. The app mints only the shortfall and simulates every call first.
- Supply is capped. When the pool is spent, no one can tape out on this processor.
- Public RPCs rate limit. Heavy pages may show an RPC error state and retry.
