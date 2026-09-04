// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {IEntryPoint} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import {IncineratorPaymaster} from "../src/IncineratorPaymaster.sol";
import {SponsorReserve, IEntryPointDeposit} from "../src/SponsorReserve.sol";
import {FeeRouter, IPonsFeeEscrow} from "../src/FeeRouter.sol";

/// @notice Deploys the sponsor stack. Run against testnet first.
///
///   forge script script/Deploy.s.sol --rpc-url robinhood_testnet --broadcast --verify
///
/// Required env:
///   DEPLOYER_PRIVATE_KEY   deployer (pays gas; NOT the treasury key)
///   TREASURY               cold creator-fee treasury (multisig / hardware wallet)
///   OWNER                  operations multisig that will own the contracts (2-step accept required)
///   SPONSOR_SIGNER         hot signing address used by the policy server
///   KEEPER                 refill keeper address
/// Optional env:
///   ENTRY_POINT            defaults to EntryPoint v0.7
///   SPONSOR_BPS            FeeRouter sponsor share (default 1000 = 10%)
///   DEPLOY_FEE_ROUTER      "true" to deploy the FeeRouter (Option A)
///   INITIAL_DEPOSIT_WEI    initial paymaster deposit funded by the deployer
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address payable treasury = payable(vm.envAddress("TREASURY"));
        address owner = vm.envAddress("OWNER");
        address signer = vm.envAddress("SPONSOR_SIGNER");
        address keeper = vm.envAddress("KEEPER");
        address entryPoint = vm.envOr("ENTRY_POINT", 0x0000000071727De22E5E9d8BAf0edAc6f37da032);
        uint16 sponsorBps = uint16(vm.envOr("SPONSOR_BPS", uint256(1_000)));
        bool deployRouter = vm.envOr("DEPLOY_FEE_ROUTER", false);
        uint256 initialDeposit = vm.envOr("INITIAL_DEPOSIT_WEI", uint256(0));

        vm.startBroadcast(pk);

        IncineratorPaymaster paymaster = new IncineratorPaymaster(IEntryPoint(entryPoint), signer);
        SponsorReserve reserve = new SponsorReserve(
            owner,
            treasury,
            IEntryPointDeposit(entryPoint),
            address(paymaster),
            keeper,
            SponsorReserve.Params({
                lowWaterMark: 0.005 ether,
                targetBalance: 0.020 ether,
                maxHotBalance: 0.030 ether,
                maxRefillPerDay: 0.050 ether,
                minRefillInterval: 10 minutes
            })
        );
        FeeRouter router;
        if (deployRouter) {
            router = new FeeRouter(owner, treasury, payable(address(reserve)), sponsorBps, IPonsFeeEscrow(vm.envOr("PONS_FEE_ESCROW", address(0))));
        }
        if (initialDeposit > 0) {
            paymaster.deposit{value: initialDeposit}();
        }
        // Paymaster ownership -> operations multisig (Ownable, single step in BasePaymaster).
        paymaster.transferOwnership(owner);

        vm.stopBroadcast();

        console2.log("chainId", block.chainid);
        console2.log("entryPoint", entryPoint);
        console2.log("paymaster", address(paymaster));
        console2.log("sponsorReserve", address(reserve));
        if (deployRouter) console2.log("feeRouter", address(router));
        console2.log("treasury", treasury);
        console2.log("owner (must acceptOwnership on SponsorReserve/FeeRouter)", owner);

        string memory json = string.concat(
            '{"chainId":',
            vm.toString(block.chainid),
            ',"entryPoint":"',
            vm.toString(entryPoint),
            '","paymaster":"',
            vm.toString(address(paymaster)),
            '","sponsorReserve":"',
            vm.toString(address(reserve)),
            '","feeRouter":"',
            deployRouter ? vm.toString(address(router)) : "",
            '","treasury":"',
            vm.toString(treasury),
            '","deployedAtBlock":',
            vm.toString(block.number),
            "}"
        );
        vm.writeFile(string.concat("deployments/", vm.toString(block.chainid), ".json"), json);
    }
}
