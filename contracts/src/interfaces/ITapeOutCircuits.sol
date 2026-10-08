// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ITapeOutCircuits {
    function eval(uint256 id, bytes calldata inputs) external view returns (bytes memory);
    function circuitInfo(uint256 id) external view returns (uint32 nIn, uint32 nOut, uint32 nState, uint32 gateCount);
}
