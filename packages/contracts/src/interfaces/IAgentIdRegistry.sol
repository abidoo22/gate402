// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IAgentIdRegistry
/// @notice Minimal interface for SPACE ID's HandleRegistry on BNB Smart Chain
///         (`0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F`).
/// @dev    Each KYC-verified Binance user may hold at most one non-transferable `.ai` Agent ID.
///         `handleOf` returns the handle without the `.ai` suffix (e.g. "alice").
interface IAgentIdRegistry {
    /// @notice Returns the number of Agent IDs held by `owner` (1 or 0).
    function balanceOf(address owner) external view returns (uint256);

    /// @notice Returns the handle owned by `owner` without the `.ai` suffix, or empty string.
    function handleOf(address owner) external view returns (string memory);

    /// @notice Returns the wallet address owning `handle` (without `.ai`), or `address(0)`.
    function ownerOfHandle(string calldata handle) external view returns (address);
}
