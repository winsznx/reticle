// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ReticleRenderer} from "../src/ReticleRenderer.sol";

/// Forks X Layer at a block after the first nine tapeouts. Run with: forge test --match-contract Fork --fork-url xlayer
contract ReticleRendererForkTest is Test {
    address constant CIRCUITS = 0x9FcbE4974C761d361d36CEE6734e381843a072BC;
    address constant NON_SQUARE = 0x839bdD6fa7A66416A609A735e11DE5411B98574e;
    uint256 constant PINNED_BLOCK = 72733000;
    ReticleRenderer r;

    function setUp() public {
        vm.createSelectFork("xlayer", PINNED_BLOCK);
        r = new ReticleRenderer();
    }

    function test_circuit1_rows_equal_the_xor_design() public view {
        (uint8 w, uint8 frames, uint32 gates) = r.shape(CIRCUITS, 1);
        assertEq(w, 32);
        assertEq(frames, 1);
        assertEq(gates, 36);
        uint256[] memory rows = r.rows(CIRCUITS, 1, 0);
        for (uint256 y = 0; y < 32; y++) {
            for (uint256 x = 0; x < 32; x++) {
                assertEq((rows[y] >> x) & 1, (x ^ y) & 1, "pixel");
            }
        }
    }

    function test_animated_circuit_has_four_frames() public {
        (uint8 w, uint8 frames,) = r.shape(CIRCUITS, 6);
        assertEq(w, 32);
        assertEq(frames, 4);
        vm.expectRevert(abi.encodeWithSelector(ReticleRenderer.BadFrame.selector, 4, 4));
        r.row(CIRCUITS, 6, 4, 0);
    }

    function test_svg_is_well_formed_and_fits_in_gas() public {
        uint256 g = gasleft();
        string memory s = r.svg(CIRCUITS, 1, 0);
        uint256 used = g - gasleft();
        bytes memory b = bytes(s);
        assertGt(b.length, 100);
        assertEq(string(_slice(b, 0, 4)), "<svg");
        assertEq(string(_slice(b, b.length - 6, 6)), "</svg>");
        emit log_named_uint("svg gas, circuit 1", used);
        assertLt(used, 40_000_000);
    }

    function test_BadShape_on_a_non_square_live_circuit() public {
        vm.expectRevert();
        r.shape(NON_SQUARE, 1);
    }

    function _slice(bytes memory b, uint256 from, uint256 n) internal pure returns (bytes memory out) {
        out = new bytes(n);
        for (uint256 i = 0; i < n; i++) out[i] = b[from + i];
    }
}
