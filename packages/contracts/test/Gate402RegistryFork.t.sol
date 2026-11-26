// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test, Vm} from "forge-std/Test.sol";
import {Gate402Registry} from "../src/Gate402Registry.sol";
import {IAgentIdRegistry} from "../src/interfaces/IAgentIdRegistry.sol";

/// @notice Live BSC Mainnet fork test verifying Gate402Registry directly against SPACE ID's
///         production Agent ID HandleRegistry (`0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F`).
/// @dev    Dynamically reads recent real Agent ID holders from on-chain Transfer events so no
///         personal addresses are hardcoded in this repository.
contract Gate402RegistryForkTest is Test {
    address internal constant REAL_REGISTRY = 0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F;
    address internal constant WBNB = 0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c;
    bytes32 internal constant TRANSFER_TOPIC = keccak256("Transfer(address,address,uint256)");

    Gate402Registry internal gate;
    IAgentIdRegistry internal registry = IAgentIdRegistry(REAL_REGISTRY);
    address internal liveHolder;
    bool internal forked;

    function setUp() public {
        string memory rpcUrl = vm.envOr("BSC_RPC_URL", string(""));
        if (bytes(rpcUrl).length == 0) return;

        vm.createSelectFork(rpcUrl);
        forked = true;
        gate = new Gate402Registry(REAL_REGISTRY);

        // Discover a real active mainnet holder via ownerOfHandle (avoids public RPC eth_getLogs limits)
        string[8] memory probes = ["alice", "alpha", "agent", "crypto", "builder", "satoshi", "vitalik", "web3"];
        for (uint256 i = 0; i < probes.length; ++i) {
            address candidate = registry.ownerOfHandle(probes[i]);
            if (candidate != address(0)) {
                (bool valid, ) = gate.verifyAgentWallet(candidate);
                if (valid) {
                    liveHolder = candidate;
                    break;
                }
            }
        }

        // Fallback: tiny 100-block log scan if none of the probes matched
        if (liveHolder == address(0)) {
            bytes32[] memory topics = new bytes32[](1);
            topics[0] = TRANSFER_TOPIC;
            uint256 fromBlock = block.number > 100 ? block.number - 100 : 0;
            Vm.EthGetLogs[] memory logs =
                vm.eth_getLogs(fromBlock, block.number, REAL_REGISTRY, topics);
            for (uint256 i = logs.length; i > 0; --i) {
                if (logs[i - 1].topics.length < 3) continue;
                address candidate = address(uint160(uint256(logs[i - 1].topics[2])));
                (bool valid, ) = gate.verifyAgentWallet(candidate);
                if (valid) {
                    liveHolder = candidate;
                    break;
                }
            }
        }
    }

    function test_fork_realMainnetAgentIdEndToEnd() public {
        if (!forked) return;
        assertTrue(liveHolder != address(0), "Expected a live Agent ID holder from recent BSC logs");

        (bool validBefore, string memory liveHandle) = gate.verifyAgentWallet(liveHolder);
        assertTrue(validBefore);
        assertTrue(bytes(liveHandle).length >= 3);
        assertEq(registry.ownerOfHandle(liveHandle), liveHolder);

        // Real holder activates Pass, registers a service, and anchors an audit for WBNB
        vm.startPrank(liveHolder);
        (uint64 passId, string memory activatedHandle) = gate.activatePass();
        assertEq(passId, 1);
        assertEq(activatedHandle, liveHandle);

        bytes32 slug = keccak256("bsc-safety-audit");
        gate.registerService(
            slug,
            "BSC Safety Audit",
            "https://gate402.vercel.app/api/v1/bsc/safety-audit",
            25,
            1e16,
            liveHolder
        );

        gate.recordAuditDigest(WBNB, 99, 0, keccak256("wbnb-canonical-audit"));
        vm.stopPrank();

        (bool eligible, uint256 dailyLimit, string memory quotaHandle) =
            gate.getEffectiveDailyQuota(liveHolder, slug);
        assertTrue(eligible);
        assertEq(dailyLimit, 50); // 2x on activation day
        assertEq(quotaHandle, liveHandle);

        // A fresh EOA with no Agent ID is rejected
        address randomUser = makeAddr("no-agent-id");
        vm.prank(randomUser);
        vm.expectRevert(Gate402Registry.NoAgentId.selector);
        gate.activatePass();
    }
}
