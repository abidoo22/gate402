// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {Gate402Registry} from "../src/Gate402Registry.sol";
import {MockHandleRegistry} from "./mocks/MockHandleRegistry.sol";
import {MockTargetContract} from "./mocks/MockTargetContract.sol";

contract Gate402RegistryTest is Test {
    MockHandleRegistry internal mockRegistry;
    Gate402Registry internal gate;
    MockTargetContract internal auditedContract;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal eve = makeAddr("eve");

    bytes32 internal constant SLUG_AUDIT = keccak256("bsc-safety-audit");
    bytes32 internal constant SLUG_DEX = keccak256("bsc-dex-intel");

    function setUp() public {
        vm.warp(1_764_160_000); // Nov 2026
        mockRegistry = new MockHandleRegistry();
        gate = new Gate402Registry(address(mockRegistry));
        auditedContract = new MockTargetContract();

        mockRegistry.register(alice, "alice");
        mockRegistry.register(bob, "bob");
    }

    function test_constructorRevertsOnEOA() public {
        vm.expectRevert(Gate402Registry.NotAContract.selector);
        new Gate402Registry(eve);
    }

    function test_activatePassAndVerify() public {
        vm.prank(alice);
        (uint64 passId, string memory handle) = gate.activatePass();

        assertEq(passId, 1);
        assertEq(handle, "alice");

        (bool active, string memory liveHandle, uint64 id, uint32 streak, uint64 dayIdx) =
            gate.hasActivePass(alice);
        assertTrue(active);
        assertEq(liveHandle, "alice");
        assertEq(id, 1);
        assertEq(streak, 1);
        assertEq(dayIdx, uint64(block.timestamp / 1 days));

        (uint64 passes, uint64 services, uint64 audits, uint64 checkIns) = gate.getStats();
        assertEq(passes, 1);
        assertEq(services, 0);
        assertEq(audits, 0);
        assertEq(checkIns, 1);
    }

    function test_activatePassRevertsForNonHolder() public {
        vm.prank(eve);
        vm.expectRevert(Gate402Registry.NoAgentId.selector);
        gate.activatePass();
    }

    function test_activatePassRevertsOnResolutionMismatch() public {
        mockRegistry.setCorruptedForwardMapping("alice", bob);

        vm.prank(alice);
        vm.expectRevert(Gate402Registry.HandleResolutionMismatch.selector);
        gate.activatePass();
    }

    function test_activatePassRevertsOnDuplicate() public {
        vm.startPrank(alice);
        gate.activatePass();
        vm.expectRevert(Gate402Registry.PassAlreadyActive.selector);
        gate.activatePass();
        vm.stopPrank();
    }

    function test_refreshDailyPassTracksStreakAndQuotaMultiplier() public {
        vm.prank(alice);
        gate.activatePass();

        vm.prank(alice);
        gate.registerService(
            SLUG_AUDIT,
            "BSC Safety Audit",
            "https://gate402.vercel.app/api/v1/bsc/safety-audit",
            25,
            1e16, // 0.01 USDT
            alice
        );

        // Same day as activation -> 2x quota (50)
        (bool eligible, uint256 limit, string memory h) =
            gate.getEffectiveDailyQuota(alice, SLUG_AUDIT);
        assertTrue(eligible);
        assertEq(limit, 50);
        assertEq(h, "alice");

        // Cannot refresh twice on same UTC day
        vm.prank(alice);
        vm.expectRevert(Gate402Registry.AlreadyCheckedInToday.selector);
        gate.refreshDailyPass();

        // Next day before refresh -> base 1x quota (25)
        vm.warp(block.timestamp + 1 days);
        (, uint256 baseLimit, ) = gate.getEffectiveDailyQuota(alice, SLUG_AUDIT);
        assertEq(baseLimit, 25);

        // Refresh on consecutive day -> streak = 2, quota = 50
        vm.prank(alice);
        uint32 streak = gate.refreshDailyPass();
        assertEq(streak, 2);

        (, uint256 boostedLimit, ) = gate.getEffectiveDailyQuota(alice, SLUG_AUDIT);
        assertEq(boostedLimit, 50);

        // Skip 3 days -> streak resets to 1
        vm.warp(block.timestamp + 3 days);
        vm.prank(alice);
        uint32 resetStreak = gate.refreshDailyPass();
        assertEq(resetStreak, 1);
    }

    function test_registerAndUpdateServiceEnforcesProviderAuth() public {
        vm.prank(alice);
        gate.activatePass();

        vm.prank(bob);
        gate.activatePass();

        vm.prank(alice);
        gate.registerService(
            SLUG_DEX,
            "BSC DEX Intel",
            "https://gate402.vercel.app/api/v1/bsc/dex-intel",
            25,
            1e16,
            alice
        );

        // Bob cannot overwrite or update Alice's service
        vm.prank(bob);
        vm.expectRevert(Gate402Registry.ServiceAlreadyExists.selector);
        gate.registerService(SLUG_DEX, "Clone", "https://evil.example/api", 10, 1e16, bob);

        vm.prank(bob);
        vm.expectRevert(Gate402Registry.NotServiceProvider.selector);
        gate.updateService(SLUG_DEX, "https://evil.example/api", 10, 1e16, bob, true);

        // Alice can update her own service
        vm.prank(alice);
        gate.updateService(
            SLUG_DEX,
            "https://gate402.vercel.app/api/v1/bsc/dex-intel-v2",
            40,
            2e16,
            alice,
            true
        );

        Gate402Registry.Service memory svc = gate.getService(SLUG_DEX);
        assertEq(svc.freeCallsPerDay, 40);
        assertEq(svc.priceUsdtWei, 2e16);
        assertEq(svc.providerHandle, "alice");

        Gate402Registry.Service[] memory list = gate.getServices(0, 10);
        assertEq(list.length, 1);
        assertEq(list[0].slug, SLUG_DEX);
    }

    function test_recordAuditDigestBlocksEOAAndStoresContractAudit() public {
        vm.prank(alice);
        gate.activatePass();

        // Red Line #9 guard: cannot record an audit for a personal EOA wallet
        vm.prank(alice);
        vm.expectRevert(Gate402Registry.TargetNotAContract.selector);
        gate.recordAuditDigest(eve, 90, 0, keccak256("fake-eoa-report"));

        // Valid smart contract audit succeeds
        bytes32 reportHash = keccak256("verified-contract-report-v1");
        vm.prank(alice);
        gate.recordAuditDigest(address(auditedContract), 94, 0, reportHash);

        Gate402Registry.AuditDigest[] memory byContract =
            gate.getContractAudits(address(auditedContract));
        assertEq(byContract.length, 1);
        assertEq(byContract[0].auditor, alice);
        assertEq(byContract[0].auditorHandle, "alice");
        assertEq(byContract[0].safetyScore, 94);
        assertEq(byContract[0].verdict, 0);
        assertEq(byContract[0].reportHash, reportHash);

        Gate402Registry.AuditDigest[] memory recent = gate.getRecentAudits(0, 5);
        assertEq(recent.length, 1);
        assertEq(recent[0].targetContract, address(auditedContract));
    }

    function test_viewHandlesRegistryFailureGracefully() public {
        vm.prank(alice);
        gate.activatePass();

        mockRegistry.setShouldRevert(true);
        (bool active, , , , ) = gate.hasActivePass(alice);
        assertFalse(active);
    }

    function test_contractRejectsRawBnbTransfers() public {
        vm.deal(alice, 1 ether);
        vm.prank(alice);
        (bool ok, ) = address(gate).call{value: 0.1 ether}("");
        assertFalse(ok);
        assertEq(address(gate).balance, 0);
    }

    function testFuzz_recordAuditDigestBounds(uint8 score, uint8 verdict, bytes32 hash) public {
        vm.prank(alice);
        gate.activatePass();

        if (score > 100) {
            vm.prank(alice);
            vm.expectRevert(Gate402Registry.InvalidScore.selector);
            gate.recordAuditDigest(address(auditedContract), score, 0, keccak256("ok"));
            return;
        }
        if (verdict > 2) {
            vm.prank(alice);
            vm.expectRevert(Gate402Registry.InvalidVerdict.selector);
            gate.recordAuditDigest(address(auditedContract), score, verdict, keccak256("ok"));
            return;
        }
        if (hash == bytes32(0)) {
            vm.prank(alice);
            vm.expectRevert(Gate402Registry.EmptyReportHash.selector);
            gate.recordAuditDigest(address(auditedContract), score, verdict, hash);
            return;
        }

        vm.prank(alice);
        gate.recordAuditDigest(address(auditedContract), score, verdict, hash);
        assertEq(gate.totalAudits(), 1);
    }
}
