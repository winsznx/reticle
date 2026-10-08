// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ReticleRenderer} from "../src/ReticleRenderer.sol";

/// Stands in for a TapeOut circuits contract: eval returns stored rows, little-endian.
contract MockCircuits {
    struct C {
        uint32 nIn;
        uint32 nOut;
        uint32 nState;
        uint32 gates;
        uint256[] data;
    }

    mapping(uint256 => C) internal c;

    function set(uint256 id, uint32 nIn, uint32 nOut, uint32 nState, uint256[] memory data) external {
        c[id] = C(nIn, nOut, nState, 7, data);
    }

    function circuitInfo(uint256 id) external view returns (uint32, uint32, uint32, uint32) {
        C storage x = c[id];
        return (x.nIn, x.nOut, x.nState, x.gates);
    }

    function eval(uint256 id, bytes calldata inputs) external view returns (bytes memory out) {
        C storage x = c[id];
        require(inputs.length == (x.nIn + 7) / 8, "input length");
        uint256 v = uint8(inputs[0]);
        uint256 bits = x.data[v];
        out = new bytes((x.nOut + 7) / 8);
        for (uint256 i = 0; i < out.length; i++) out[i] = bytes1(uint8(bits >> (8 * i)));
    }
}

contract ReticleRendererTest is Test {
    ReticleRenderer r;
    MockCircuits m;

    function setUp() public {
        r = new ReticleRenderer();
        m = new MockCircuits();
    }

    function _rows8(uint256 frames) internal pure returns (uint256[] memory d) {
        d = new uint256[](8 * frames);
        for (uint256 i = 0; i < d.length; i++) d[i] = (i * 37 + 5) & 0xff;
    }

    function test_shape_and_rows_8x8_two_frames() public {
        uint256[] memory d = _rows8(2);
        m.set(1, 4, 8, 0, d);
        (uint8 w, uint8 frames, uint32 gates) = r.shape(address(m), 1);
        assertEq(w, 8);
        assertEq(frames, 2);
        assertEq(gates, 7);
        uint256[] memory out = r.rows(address(m), 1, 1);
        for (uint256 y = 0; y < 8; y++) assertEq(out[y], d[y | (1 << 3)]);
    }

    function test_32_wide_row_uses_full_word() public {
        uint256[] memory d = new uint256[](32);
        d[3] = 0xDEADBEEF;
        m.set(2, 5, 32, 0, d);
        assertEq(r.row(address(m), 2, 0, 3), 0xDEADBEEF);
    }

    function test_BadShape_non_square() public {
        m.set(3, 5, 12, 0, new uint256[](32));
        vm.expectRevert(abi.encodeWithSelector(ReticleRenderer.BadShape.selector, 5, 12));
        r.shape(address(m), 3);
    }

    function test_BadShape_too_many_frame_bits() public {
        m.set(4, 8, 8, 0, new uint256[](256));
        vm.expectRevert(abi.encodeWithSelector(ReticleRenderer.BadShape.selector, 8, 8));
        r.shape(address(m), 4);
    }

    function test_BadShape_sequential() public {
        m.set(5, 4, 16, 1, new uint256[](16));
        vm.expectRevert(abi.encodeWithSelector(ReticleRenderer.BadShape.selector, 4, 16));
        r.shape(address(m), 5);
    }

    function test_BadFrame() public {
        m.set(6, 3, 8, 0, new uint256[](8));
        vm.expectRevert(abi.encodeWithSelector(ReticleRenderer.BadFrame.selector, 1, 1));
        r.row(address(m), 6, 1, 0);
    }

    function test_svg_runs() public {
        uint256[] memory d = new uint256[](8);
        d[0] = 0x0F;
        d[7] = 0x81;
        m.set(7, 3, 8, 0, d);
        string memory s = r.svg(address(m), 7, 0);
        assertEq(
            s,
            string(
                abi.encodePacked(
                    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8" shape-rendering="crispEdges">',
                    '<rect width="8" height="8" fill="#F2EFE6"/><g fill="#0B0B0C">',
                    '<rect x="0" y="0" width="4" height="1"/>',
                    '<rect x="0" y="7" width="1" height="1"/>',
                    '<rect x="7" y="7" width="1" height="1"/>',
                    "</g></svg>"
                )
            )
        );
    }
}
