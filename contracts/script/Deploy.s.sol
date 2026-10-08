// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {ReticleRenderer} from "../src/ReticleRenderer.sol";

contract Deploy is Script {
    function run() external returns (ReticleRenderer r) {
        vm.startBroadcast(vm.envUint("DEPLOYER_PRIVATE_KEY"));
        r = new ReticleRenderer();
        vm.stopBroadcast();
    }
}
