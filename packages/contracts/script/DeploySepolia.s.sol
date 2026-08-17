// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { YDToken } from "../src/YDToken.sol";
import { CourseMarket } from "../src/CourseMarket.sol";
import { CourseCertificate } from "../src/CourseCertificate.sol";
import { CompletionOracle } from "../src/CompletionOracle.sol";

interface SepoliaVm {
    function envUint(string calldata name) external returns (uint256);
    function envAddress(string calldata name) external returns (address);
    function envOr(string calldata name, address defaultValue) external returns (address);
    function addr(uint256 privateKey) external returns (address);
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
}

/// @notice Deploys or resumes the Web3 University contract set on Sepolia.
/// @dev Existing addresses can be supplied to make role configuration safe to rerun.
contract DeploySepolia {
    SepoliaVm private constant vm =
        SepoliaVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint256 private constant SEPOLIA_CHAIN_ID = 11155111;

    error SepoliaOnly(uint256 actualChainId);
    error ExistingAddressHasNoCode(string name, address target);

    function run()
        external
        returns (
            YDToken yd,
            CourseMarket market,
            CourseCertificate certificate,
            CompletionOracle oracle
        )
    {
        if (block.chainid != SEPOLIA_CHAIN_ID) {
            revert SepoliaOnly(block.chainid);
        }

        uint256 deployerKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address admin = vm.addr(deployerKey);
        address treasury = vm.envAddress("TREASURY_ADDRESS");
        address teacher = vm.envAddress("TEACHER_ADDRESS");
        address oracleOperator = vm.envAddress("ORACLE_OPERATOR_ADDRESS");
        address creForwarder = vm.envOr("CRE_FORWARDER_ADDRESS", oracleOperator);

        address ydAddress = vm.envOr("YD_TOKEN_ADDRESS", address(0));
        address marketAddress = vm.envOr("COURSE_MARKET_ADDRESS", address(0));
        address certificateAddress = vm.envOr("COURSE_CERTIFICATE_ADDRESS", address(0));
        address oracleAddress = vm.envOr("COMPLETION_ORACLE_ADDRESS", address(0));

        _requireCodeWhenConfigured("YD_TOKEN_ADDRESS", ydAddress);
        _requireCodeWhenConfigured("COURSE_MARKET_ADDRESS", marketAddress);
        _requireCodeWhenConfigured("COURSE_CERTIFICATE_ADDRESS", certificateAddress);
        _requireCodeWhenConfigured("COMPLETION_ORACLE_ADDRESS", oracleAddress);

        vm.startBroadcast(deployerKey);

        yd = ydAddress == address(0) ? new YDToken(treasury) : YDToken(ydAddress);
        market = marketAddress == address(0)
            ? new CourseMarket(admin, address(yd), treasury)
            : CourseMarket(marketAddress);
        certificate = certificateAddress == address(0)
            ? new CourseCertificate(admin)
            : CourseCertificate(certificateAddress);
        oracle = oracleAddress == address(0)
            ? new CompletionOracle(admin, address(market), address(certificate), creForwarder)
            : CompletionOracle(oracleAddress);

        if (!certificate.hasRole(certificate.MINTER_ROLE(), address(oracle))) {
            certificate.grantRole(certificate.MINTER_ROLE(), address(oracle));
        }
        if (!market.hasRole(market.TEACHER_ROLE(), teacher)) {
            market.grantRole(market.TEACHER_ROLE(), teacher);
        }
        if (!oracle.hasRole(oracle.ORACLE_ROLE(), oracleOperator)) {
            oracle.grantRole(oracle.ORACLE_ROLE(), oracleOperator);
        }

        vm.stopBroadcast();
    }

    function _requireCodeWhenConfigured(string memory name, address target) private view {
        if (target != address(0) && target.code.length == 0) {
            revert ExistingAddressHasNoCode(name, target);
        }
    }
}
