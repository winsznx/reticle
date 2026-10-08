// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ITapeOutCircuits} from "./interfaces/ITapeOutCircuits.sol";

/// @notice Reads a TapeOut circuit as a square 1-bit image. Immutable, ownerless, holds no funds.
/// Convention: nOut = W in {8,16,32}, one eval(row y, frame t) returns a full row, input = y | t << log2(W).
contract ReticleRenderer {
    error BadShape(uint32 nIn, uint32 nOut);
    error BadFrame(uint8 frame, uint8 frames);
    error BadRow(uint8 y, uint8 w);

    function shape(address circuits, uint256 id) public view returns (uint8 w, uint8 frames, uint32 gates) {
        (uint32 nIn, uint32 nOut, uint32 nState, uint32 gateCount) = ITapeOutCircuits(circuits).circuitInfo(id);
        uint8 yBits;
        if (nOut == 8) yBits = 3;
        else if (nOut == 16) yBits = 4;
        else if (nOut == 32) yBits = 5;
        else revert BadShape(nIn, nOut);
        if (nState != 0 || nIn < yBits || nIn - yBits > 3) revert BadShape(nIn, nOut);
        w = uint8(nOut);
        frames = uint8(1) << uint8(nIn - yBits);
        gates = gateCount;
    }

    /// @return bits pixel x of the row is bit x
    function row(address circuits, uint256 id, uint8 frame, uint8 y) public view returns (uint256 bits) {
        (uint8 w, uint8 frames,) = shape(circuits, id);
        return _row(circuits, id, w, frames, frame, y);
    }

    function rows(address circuits, uint256 id, uint8 frame) public view returns (uint256[] memory out) {
        (uint8 w, uint8 frames,) = shape(circuits, id);
        out = new uint256[](w);
        for (uint8 y = 0; y < w; y++) out[y] = _row(circuits, id, w, frames, frame, y);
    }

    /// @notice ink #0B0B0C on paper #F2EFE6, one rect per horizontal run of ink
    function svg(address circuits, uint256 id, uint8 frame) external view returns (string memory) {
        (uint8 w,,) = shape(circuits, id);
        uint256[] memory data = rows(circuits, id, frame);
        string memory ws = _str(w);
        bytes memory out = abi.encodePacked(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ',
            ws,
            " ",
            ws,
            '" shape-rendering="crispEdges"><rect width="',
            ws,
            '" height="',
            ws,
            '" fill="#F2EFE6"/><g fill="#0B0B0C">'
        );
        for (uint256 y = 0; y < w; y++) {
            uint256 bits = data[y];
            uint256 x = 0;
            while (x < w) {
                if ((bits >> x) & 1 == 0) {
                    x++;
                    continue;
                }
                uint256 start = x;
                while (x < w && (bits >> x) & 1 == 1) x++;
                out = abi.encodePacked(
                    out, '<rect x="', _str(start), '" y="', _str(y), '" width="', _str(x - start), '" height="1"/>'
                );
            }
        }
        return string(abi.encodePacked(out, "</g></svg>"));
    }

    function _row(address circuits, uint256 id, uint8 w, uint8 frames, uint8 frame, uint8 y)
        internal
        view
        returns (uint256 bits)
    {
        if (frame >= frames) revert BadFrame(frame, frames);
        if (y >= w) revert BadRow(y, w);
        (uint32 nIn,,,) = ITapeOutCircuits(circuits).circuitInfo(id);
        uint8 yBits = w == 8 ? 3 : w == 16 ? 4 : 5;
        uint256 packed = uint256(y) | (uint256(frame) << yBits);
        // nIn <= 8 so the little-endian input is always one byte
        bytes memory input = new bytes((nIn + 7) / 8);
        input[0] = bytes1(uint8(packed));
        bytes memory result = ITapeOutCircuits(circuits).eval(id, input);
        for (uint256 i = 0; i < result.length; i++) bits |= uint256(uint8(result[i])) << (8 * i);
        if (w < 32) bits &= (uint256(1) << w) - 1;
        else bits &= type(uint32).max;
    }

    function _str(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 n = v;
        uint256 len;
        while (n != 0) {
            len++;
            n /= 10;
        }
        bytes memory b = new bytes(len);
        while (v != 0) {
            b[--len] = bytes1(uint8(48 + (v % 10)));
            v /= 10;
        }
        return string(b);
    }
}
