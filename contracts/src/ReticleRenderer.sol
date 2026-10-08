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
        (w, frames,, gates) = _shape(circuits, id);
    }

    /// @return bits pixel x of the row is bit x
    function row(address circuits, uint256 id, uint8 frame, uint8 y) public view returns (uint256 bits) {
        (uint8 w, uint8 frames, uint32 nIn,) = _shape(circuits, id);
        return _row(circuits, id, w, nIn, frames, frame, y);
    }

    function rows(address circuits, uint256 id, uint8 frame) public view returns (uint256[] memory out) {
        (uint8 w, uint8 frames, uint32 nIn,) = _shape(circuits, id);
        return _rows(circuits, id, w, nIn, frames, frame);
    }

    /// @notice ink #0B0B0C on paper #F2EFE6, one rect per horizontal run of ink
    /// @dev Writes into one preallocated buffer. Appending with abi.encodePacked in a loop copies the
    /// whole string each time and its memory cost grows quadratically past the RPC gas cap.
    function svg(address circuits, uint256 id, uint8 frame) external view returns (string memory) {
        (uint8 w, uint8 frames, uint32 nIn,) = _shape(circuits, id);
        uint256[] memory data = _rows(circuits, id, w, nIn, frames, frame);
        bytes memory buf = new bytes(256 + (uint256(w) * w / 2 + w) * 44);
        uint256 p = _put(buf, 0, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ');
        p = _num(buf, p, w);
        p = _put(buf, p, " ");
        p = _num(buf, p, w);
        p = _put(buf, p, '" shape-rendering="crispEdges"><rect width="');
        p = _num(buf, p, w);
        p = _put(buf, p, '" height="');
        p = _num(buf, p, w);
        p = _put(buf, p, '" fill="#F2EFE6"/><g fill="#0B0B0C">');
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
                p = _put(buf, p, '<rect x="');
                p = _num(buf, p, start);
                p = _put(buf, p, '" y="');
                p = _num(buf, p, y);
                p = _put(buf, p, '" width="');
                p = _num(buf, p, x - start);
                p = _put(buf, p, '" height="1"/>');
            }
        }
        p = _put(buf, p, "</g></svg>");
        assembly {
            mstore(buf, p)
        }
        return string(buf);
    }

    function _shape(address circuits, uint256 id) internal view returns (uint8 w, uint8 frames, uint32 nIn, uint32 gates) {
        uint32 nOut;
        uint32 nState;
        (nIn, nOut, nState, gates) = ITapeOutCircuits(circuits).circuitInfo(id);
        uint8 yBits;
        if (nOut == 8) yBits = 3;
        else if (nOut == 16) yBits = 4;
        else if (nOut == 32) yBits = 5;
        else revert BadShape(nIn, nOut);
        if (nState != 0 || nIn < yBits || nIn - yBits > 3) revert BadShape(nIn, nOut);
        w = uint8(nOut);
        frames = uint8(1) << uint8(nIn - yBits);
    }

    function _rows(address circuits, uint256 id, uint8 w, uint32 nIn, uint8 frames, uint8 frame)
        internal
        view
        returns (uint256[] memory out)
    {
        out = new uint256[](w);
        for (uint8 y = 0; y < w; y++) out[y] = _row(circuits, id, w, nIn, frames, frame, y);
    }

    function _row(address circuits, uint256 id, uint8 w, uint32 nIn, uint8 frames, uint8 frame, uint8 y)
        internal
        view
        returns (uint256 bits)
    {
        if (frame >= frames) revert BadFrame(frame, frames);
        if (y >= w) revert BadRow(y, w);
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

    function _put(bytes memory buf, uint256 p, bytes memory s) private pure returns (uint256) {
        for (uint256 i = 0; i < s.length; i++) buf[p + i] = s[i];
        return p + s.length;
    }

    function _num(bytes memory buf, uint256 p, uint256 v) private pure returns (uint256) {
        if (v == 0) {
            buf[p] = "0";
            return p + 1;
        }
        uint256 len;
        for (uint256 n = v; n != 0; n /= 10) len++;
        for (uint256 i = len; i > 0; i--) {
            buf[p + i - 1] = bytes1(uint8(48 + (v % 10)));
            v /= 10;
        }
        return p + len;
    }
}
