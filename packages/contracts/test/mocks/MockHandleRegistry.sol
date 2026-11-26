// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IAgentIdRegistry} from "../../src/interfaces/IAgentIdRegistry.sol";

/// @notice Test stand-in for SPACE ID's HandleRegistry (`0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F`).
contract MockHandleRegistry is IAgentIdRegistry {
    mapping(address => uint256) public balances;
    mapping(address => string) public handles;
    mapping(bytes32 => address) public owners;
    bool public shouldRevert;

    function register(address wallet, string calldata handle) external {
        balances[wallet] = 1;
        handles[wallet] = handle;
        owners[keccak256(bytes(handle))] = wallet;
    }

    function setCorruptedForwardMapping(string calldata handle, address wrongOwner) external {
        owners[keccak256(bytes(handle))] = wrongOwner;
    }

    function revoke(address wallet) external {
        string memory h = handles[wallet];
        balances[wallet] = 0;
        handles[wallet] = "";
        owners[keccak256(bytes(h))] = address(0);
    }

    function setShouldRevert(bool flag) external {
        shouldRevert = flag;
    }

    function balanceOf(address owner) external view returns (uint256) {
        if (shouldRevert) revert("registry down");
        return balances[owner];
    }

    function handleOf(address owner) external view returns (string memory) {
        if (shouldRevert) revert("registry down");
        return handles[owner];
    }

    function ownerOfHandle(string calldata handle) external view returns (address) {
        if (shouldRevert) revert("registry down");
        return owners[keccak256(bytes(handle))];
    }
}
