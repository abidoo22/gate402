// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IAgentIdRegistry} from "./interfaces/IAgentIdRegistry.sol";

/// @title Gate402Registry
/// @notice Immutable, ownerless, zero-custody registry powering Sybil-proof free API quotas,
///         x402 v2 service discovery, and verifiable smart-contract safety audit digests for
///         Binance Agent ID (`.ai`) holders on BNB Smart Chain.
/// @dev    OWNER & ADMIN PERMISSION DISCLOSURE (Hackathon Safety Compliance):
///         - This contract has NO owner, NO admin role, NO upgradeability, NO pause switch,
///           and NO ability to receive, hold, or withdraw BNB or ERC-20 tokens.
///         - The Agent ID registry address is immutable and fixed at deployment.
///         - Only smart contract addresses (`targetContract.code.length > 0`) may be audited
///           via `recordAuditDigest`, preventing personal wallet lookup abuse.
contract Gate402Registry {
    // -------------------------------------------------------------------------
    // Constants & Immutables
    // -------------------------------------------------------------------------

    /// @notice SPACE ID HandleRegistry contract on BNB Smart Chain.
    IAgentIdRegistry public immutable REGISTRY;

    uint16 public constant MIN_FREE_CALLS_PER_DAY = 1;
    uint16 public constant MAX_FREE_CALLS_PER_DAY = 10_000;
    uint8 public constant MAX_SAFETY_SCORE = 100;
    uint8 public constant MAX_VERDICT = 2; // 0 = SAFE, 1 = CAUTION, 2 = HIGH_RISK
    uint256 public constant MAX_NAME_LENGTH = 64;
    uint256 public constant MAX_URL_LENGTH = 200;

    // -------------------------------------------------------------------------
    // Types
    // -------------------------------------------------------------------------

    struct AgentPass {
        bool active;
        uint64 passId;
        uint64 activatedAt;
        uint64 lastCheckInDay;
        uint32 streakDays;
        uint32 totalAudits;
        string handle;
    }

    struct Service {
        bytes32 slug;
        address provider;
        string providerHandle;
        string name;
        string endpointUrl;
        uint16 freeCallsPerDay;
        uint96 priceUsdtWei;
        address payTo;
        bool active;
        uint64 registeredAt;
    }

    struct AuditDigest {
        address targetContract;
        address auditor;
        string auditorHandle;
        uint8 safetyScore;
        uint8 verdict;
        bytes32 reportHash;
        uint64 timestamp;
    }

    // -------------------------------------------------------------------------
    // State
    // -------------------------------------------------------------------------

    uint64 public totalPasses;
    uint64 public totalServices;
    uint64 public totalAudits;
    uint64 public totalCheckIns;

    mapping(address => AgentPass) private _passes;
    mapping(bytes32 => address) public handleHashToWallet;

    mapping(bytes32 => Service) private _services;
    bytes32[] private _serviceSlugs;

    mapping(address => AuditDigest[]) private _contractAudits;
    AuditDigest[] private _recentAudits;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event PassActivated(
        address indexed wallet,
        string handle,
        uint64 indexed passId,
        uint64 timestamp
    );

    event DailyPassRefreshed(
        address indexed wallet,
        string handle,
        uint64 indexed dayIndex,
        uint32 streakDays
    );

    event ServiceRegistered(
        bytes32 indexed slug,
        address indexed provider,
        string providerHandle,
        string name,
        string endpointUrl,
        uint16 freeCallsPerDay,
        uint96 priceUsdtWei,
        address payTo
    );

    event ServiceUpdated(
        bytes32 indexed slug,
        address indexed provider,
        string endpointUrl,
        uint16 freeCallsPerDay,
        uint96 priceUsdtWei,
        address payTo,
        bool active
    );

    event AuditDigestRecorded(
        address indexed targetContract,
        address indexed auditor,
        string auditorHandle,
        uint8 safetyScore,
        uint8 verdict,
        bytes32 reportHash,
        uint64 timestamp
    );

    // -------------------------------------------------------------------------
    // Errors
    // -------------------------------------------------------------------------

    error NotAContract();
    error NoAgentId();
    error HandleResolutionMismatch();
    error PassAlreadyActive();
    error PassNotActive();
    error HandleMismatch();
    error AlreadyCheckedInToday();
    error InvalidSlug();
    error InvalidName();
    error InvalidEndpointUrl();
    error InvalidDailyQuota();
    error InvalidPayTo();
    error ServiceAlreadyExists();
    error ServiceNotFound();
    error NotServiceProvider();
    error TargetNotAContract();
    error InvalidScore();
    error InvalidVerdict();
    error EmptyReportHash();

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(address registry_) {
        if (registry_ == address(0) || registry_.code.length == 0) {
            revert NotAContract();
        }
        REGISTRY = IAgentIdRegistry(registry_);
    }

    // -------------------------------------------------------------------------
    // External Write Functions (All Non-Payable — Zero Custody)
    // -------------------------------------------------------------------------

    /// @notice Activates a lifetime, non-transferable Gate402 Pass for the caller's `.ai` Agent ID.
    /// @dev    Verifies `balanceOf`, `handleOf`, and `ownerOfHandle` atomically against `REGISTRY`.
    function activatePass() external returns (uint64 passId, string memory handle) {
        handle = _requireValidAgent(msg.sender);

        AgentPass storage existing = _passes[msg.sender];
        bytes32 handleHash = keccak256(bytes(handle));
        if (existing.active || handleHashToWallet[handleHash] != address(0)) {
            revert PassAlreadyActive();
        }

        uint64 nowTs = uint64(block.timestamp);
        uint64 today = nowTs / 1 days;
        passId = ++totalPasses;
        ++totalCheckIns;

        _passes[msg.sender] = AgentPass({
            active: true,
            passId: passId,
            activatedAt: nowTs,
            lastCheckInDay: today,
            streakDays: 1,
            totalAudits: 0,
            handle: handle
        });
        handleHashToWallet[handleHash] = msg.sender;

        emit PassActivated(msg.sender, handle, passId, nowTs);
    }

    /// @notice Refreshes daily active status for the caller's `.ai` Pass, granting 2x daily free
    ///         quota across all Gate402 services for the current UTC day and incrementing streak.
    function refreshDailyPass() external returns (uint32 newStreak) {
        string memory handle = _requireValidAgent(msg.sender);
        AgentPass storage pass = _passes[msg.sender];
        if (!pass.active) revert PassNotActive();
        if (keccak256(bytes(pass.handle)) != keccak256(bytes(handle))) {
            revert HandleMismatch();
        }

        uint64 today = uint64(block.timestamp) / 1 days;
        if (today <= pass.lastCheckInDay) revert AlreadyCheckedInToday();

        if (today == pass.lastCheckInDay + 1) {
            newStreak = pass.streakDays + 1;
        } else {
            newStreak = 1;
        }

        pass.lastCheckInDay = today;
        pass.streakDays = newStreak;
        ++totalCheckIns;

        emit DailyPassRefreshed(msg.sender, handle, today, newStreak);
    }

    /// @notice Registers a new API or MCP service on Gate402 with Sybil-proof `.ai` free quota
    ///         and x402 v2 overflow pricing (in BSC USDT 18-decimal wei).
    function registerService(
        bytes32 slug,
        string calldata name,
        string calldata endpointUrl,
        uint16 freeCallsPerDay,
        uint96 priceUsdtWei,
        address payTo
    ) external {
        string memory handle = _requireValidAgent(msg.sender);
        AgentPass storage pass = _passes[msg.sender];
        if (!pass.active) revert PassNotActive();
        if (keccak256(bytes(pass.handle)) != keccak256(bytes(handle))) {
            revert HandleMismatch();
        }

        if (slug == bytes32(0)) revert InvalidSlug();
        if (_services[slug].provider != address(0)) revert ServiceAlreadyExists();
        if (bytes(name).length == 0 || bytes(name).length > MAX_NAME_LENGTH) revert InvalidName();
        if (bytes(endpointUrl).length < 8 || bytes(endpointUrl).length > MAX_URL_LENGTH) {
            revert InvalidEndpointUrl();
        }
        if (freeCallsPerDay < MIN_FREE_CALLS_PER_DAY || freeCallsPerDay > MAX_FREE_CALLS_PER_DAY) {
            revert InvalidDailyQuota();
        }
        if (payTo == address(0)) revert InvalidPayTo();

        uint64 nowTs = uint64(block.timestamp);
        _services[slug] = Service({
            slug: slug,
            provider: msg.sender,
            providerHandle: handle,
            name: name,
            endpointUrl: endpointUrl,
            freeCallsPerDay: freeCallsPerDay,
            priceUsdtWei: priceUsdtWei,
            payTo: payTo,
            active: true,
            registeredAt: nowTs
        });
        _serviceSlugs.push(slug);
        ++totalServices;

        emit ServiceRegistered(
            slug,
            msg.sender,
            handle,
            name,
            endpointUrl,
            freeCallsPerDay,
            priceUsdtWei,
            payTo
        );
    }

    /// @notice Updates an existing Gate402 service. Only callable by its original `.ai` provider.
    function updateService(
        bytes32 slug,
        string calldata endpointUrl,
        uint16 freeCallsPerDay,
        uint96 priceUsdtWei,
        address payTo,
        bool active
    ) external {
        Service storage svc = _services[slug];
        if (svc.provider == address(0)) revert ServiceNotFound();
        if (svc.provider != msg.sender) revert NotServiceProvider();

        string memory handle = _requireValidAgent(msg.sender);
        if (keccak256(bytes(svc.providerHandle)) != keccak256(bytes(handle))) {
            revert HandleMismatch();
        }

        if (bytes(endpointUrl).length < 8 || bytes(endpointUrl).length > MAX_URL_LENGTH) {
            revert InvalidEndpointUrl();
        }
        if (freeCallsPerDay < MIN_FREE_CALLS_PER_DAY || freeCallsPerDay > MAX_FREE_CALLS_PER_DAY) {
            revert InvalidDailyQuota();
        }
        if (payTo == address(0)) revert InvalidPayTo();

        svc.endpointUrl = endpointUrl;
        svc.freeCallsPerDay = freeCallsPerDay;
        svc.priceUsdtWei = priceUsdtWei;
        svc.payTo = payTo;
        svc.active = active;

        emit ServiceUpdated(slug, msg.sender, endpointUrl, freeCallsPerDay, priceUsdtWei, payTo, active);
    }

    /// @notice Anchors a verifiable smart-contract security scan digest on-chain.
    /// @dev    Strictly rejects personal EOA addresses (`targetContract.code.length == 0`).
    function recordAuditDigest(
        address targetContract,
        uint8 safetyScore,
        uint8 verdict,
        bytes32 reportHash
    ) external {
        string memory handle = _requireValidAgent(msg.sender);
        AgentPass storage pass = _passes[msg.sender];
        if (!pass.active) revert PassNotActive();
        if (keccak256(bytes(pass.handle)) != keccak256(bytes(handle))) {
            revert HandleMismatch();
        }

        if (targetContract == address(0) || targetContract.code.length == 0) {
            revert TargetNotAContract();
        }
        if (safetyScore > MAX_SAFETY_SCORE) revert InvalidScore();
        if (verdict > MAX_VERDICT) revert InvalidVerdict();
        if (reportHash == bytes32(0)) revert EmptyReportHash();

        uint64 nowTs = uint64(block.timestamp);
        AuditDigest memory entry = AuditDigest({
            targetContract: targetContract,
            auditor: msg.sender,
            auditorHandle: handle,
            safetyScore: safetyScore,
            verdict: verdict,
            reportHash: reportHash,
            timestamp: nowTs
        });

        _contractAudits[targetContract].push(entry);
        _recentAudits.push(entry);
        pass.totalAudits += 1;
        ++totalAudits;

        emit AuditDigestRecorded(
            targetContract,
            msg.sender,
            handle,
            safetyScore,
            verdict,
            reportHash,
            nowTs
        );
    }

    // -------------------------------------------------------------------------
    // View Functions (Stateless Reads for Middleware, MCP, and Frontend)
    // -------------------------------------------------------------------------

    /// @notice Performs live 3-read verification against SPACE ID HandleRegistry.
    function verifyAgentWallet(address wallet) public view returns (bool valid, string memory handle) {
        if (wallet == address(0)) return (false, "");
        try REGISTRY.balanceOf(wallet) returns (uint256 bal) {
            if (bal == 0) return (false, "");
        } catch {
            return (false, "");
        }

        try REGISTRY.handleOf(wallet) returns (string memory h) {
            if (bytes(h).length == 0) return (false, "");
            try REGISTRY.ownerOfHandle(h) returns (address resolved) {
                if (resolved != wallet) return (false, "");
                return (true, h);
            } catch {
                return (false, "");
            }
        } catch {
            return (false, "");
        }
    }

    /// @notice Returns pass status plus live HandleRegistry verification in one RPC call.
    function hasActivePass(address wallet)
        external
        view
        returns (
            bool active,
            string memory handle,
            uint64 passId,
            uint32 streakDays,
            uint64 lastCheckInDay
        )
    {
        AgentPass storage pass = _passes[wallet];
        if (!pass.active) return (false, "", 0, 0, 0);

        (bool valid, string memory liveHandle) = verifyAgentWallet(wallet);
        if (!valid || keccak256(bytes(liveHandle)) != keccak256(bytes(pass.handle))) {
            return (false, "", 0, 0, 0);
        }

        return (true, liveHandle, pass.passId, pass.streakDays, pass.lastCheckInDay);
    }

    /// @notice Computes the effective free daily call limit for `wallet` on service `slug`.
    /// @dev    Returns 2x base quota if the pass holder refreshed today (`lastCheckInDay == today`).
    function getEffectiveDailyQuota(address wallet, bytes32 slug)
        external
        view
        returns (bool eligible, uint256 dailyLimit, string memory handle)
    {
        Service storage svc = _services[slug];
        if (svc.provider == address(0) || !svc.active) {
            return (false, 0, "");
        }

        AgentPass storage pass = _passes[wallet];
        if (!pass.active) return (false, 0, "");

        (bool valid, string memory liveHandle) = verifyAgentWallet(wallet);
        if (!valid || keccak256(bytes(liveHandle)) != keccak256(bytes(pass.handle))) {
            return (false, 0, "");
        }

        uint64 today = uint64(block.timestamp) / 1 days;
        uint256 multiplier = (pass.lastCheckInDay == today) ? 2 : 1;
        return (true, uint256(svc.freeCallsPerDay) * multiplier, liveHandle);
    }

    function getPass(address wallet) external view returns (AgentPass memory) {
        return _passes[wallet];
    }

    function getService(bytes32 slug) external view returns (Service memory) {
        return _services[slug];
    }

    function getServices(uint256 offset, uint256 limit) external view returns (Service[] memory list) {
        uint256 len = _serviceSlugs.length;
        if (offset >= len || limit == 0) return new Service[](0);

        uint256 end = offset + limit;
        if (end > len) end = len;
        uint256 count = end - offset;

        list = new Service[](count);
        for (uint256 i = 0; i < count; ++i) {
            list[i] = _services[_serviceSlugs[offset + i]];
        }
    }

    function getContractAudits(address targetContract) external view returns (AuditDigest[] memory) {
        return _contractAudits[targetContract];
    }

    /// @notice Returns recent audit digests in reverse chronological order (newest first).
    function getRecentAudits(uint256 offset, uint256 limit)
        external
        view
        returns (AuditDigest[] memory list)
    {
        uint256 len = _recentAudits.length;
        if (offset >= len || limit == 0) return new AuditDigest[](0);

        uint256 remaining = len - offset;
        uint256 count = limit < remaining ? limit : remaining;

        list = new AuditDigest[](count);
        for (uint256 i = 0; i < count; ++i) {
            list[i] = _recentAudits[len - 1 - offset - i];
        }
    }

    function getStats()
        external
        view
        returns (uint64 passes, uint64 services, uint64 audits, uint64 checkIns)
    {
        return (totalPasses, totalServices, totalAudits, totalCheckIns);
    }

    // -------------------------------------------------------------------------
    // Internal Helpers
    // -------------------------------------------------------------------------

    function _requireValidAgent(address caller) internal view returns (string memory handle) {
        if (REGISTRY.balanceOf(caller) == 0) revert NoAgentId();
        handle = REGISTRY.handleOf(caller);
        if (bytes(handle).length == 0) revert NoAgentId();
        if (REGISTRY.ownerOfHandle(handle) != caller) revert HandleResolutionMismatch();
    }
}
