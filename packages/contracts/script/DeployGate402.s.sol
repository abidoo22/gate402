// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {Gate402Registry} from "../src/Gate402Registry.sol";

/// @notice Deploys the immutable, ownerless Gate402Registry on BNB Smart Chain.
contract DeployGate402 is Script {
    address internal constant BSC_AGENT_ID_REGISTRY = 0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F;

    function run() external returns (Gate402Registry deployed) {
        address registry = vm.envOr("AGENT_ID_REGISTRY_ADDRESS", BSC_AGENT_ID_REGISTRY);

        vm.startBroadcast();
        deployed = new Gate402Registry(registry);
        vm.stopBroadcast();

        console2.log("Gate402Registry deployed at:", address(deployed));
        console2.log("Bound HandleRegistry:", address(deployed.REGISTRY()));
    }
}
