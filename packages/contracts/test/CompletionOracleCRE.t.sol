// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { YDToken } from "../src/YDToken.sol";
import { CourseMarket } from "../src/CourseMarket.sol";
import { CourseCertificate } from "../src/CourseCertificate.sol";
import { CompletionOracle } from "../src/CompletionOracle.sol";
import { IReceiver } from "../src/interfaces/IReceiver.sol";

interface CREVm {
    function addr(uint256 privateKey) external returns (address);
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function expectRevert(bytes4) external;
    function expectRevert(bytes calldata) external;
    function expectRevert() external;
    function warp(uint256) external;
    function sign(uint256 privateKey, bytes32 digest)
        external
        returns (uint8 v, bytes32 r, bytes32 s);
}

contract MockCREForwarder {
    function deliver(address receiver, bytes calldata metadata, bytes calldata report) external {
        IReceiver(receiver).onReport(metadata, report);
    }
}

contract CompletionOracleCRETest {
    CREVm private constant vm = CREVm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address private constant STUDENT = address(0x2001);
    address private constant TEACHER = address(0x2002);
    address private constant TREASURY = address(0x2003);
    address private constant WORKFLOW_OWNER = address(0x2004);
    address private constant ATTACKER = address(0x2005);
    bytes10 private constant WORKFLOW_NAME = bytes10("course-cre");
    bytes32 private constant WORKFLOW_ID = keccak256("web3-university-completion");
    uint256 private constant PRICE = 4 ether;
    uint256 private constant FALLBACK_SIGNER_KEY = 0xA11CE;

    YDToken private yd;
    CourseMarket private market;
    CourseCertificate private certificate;
    CompletionOracle private oracle;
    MockCREForwarder private forwarder;
    uint256 private courseId;

    function setUp() public {
        yd = new YDToken(address(this));
        market = new CourseMarket(address(this), address(yd), TREASURY);
        certificate = new CourseCertificate(address(this));
        forwarder = new MockCREForwarder();
        oracle = new CompletionOracle(
            address(this), address(market), address(certificate), address(forwarder)
        );

        market.grantRole(market.TEACHER_ROLE(), TEACHER);
        certificate.grantRole(certificate.MINTER_ROLE(), address(oracle));
        oracle.setCREWorkflowIdentity(WORKFLOW_OWNER, WORKFLOW_NAME, WORKFLOW_ID);
        oracle.setFallbackOracleSigner(vm.addr(FALLBACK_SIGNER_KEY));

        vm.prank(TEACHER);
        courseId = market.submitCourse("ipfs://course-1", PRICE);
        market.approveCourse(courseId);
        yd.transfer(STUDENT, 100 ether);

        vm.startPrank(STUDENT);
        yd.approve(address(market), PRICE);
        market.buy(courseId);
        vm.stopPrank();
    }

    function testCREReportMintsCertificateAndReplayIsIgnored() public {
        uint256 requestId = _request();
        bytes memory report =
            abi.encode(requestId, true, "0xevidence", "https://api.example/metadata/0xevidence");

        forwarder.deliver(address(oracle), _metadata(), report);

        _assertEq(
            uint256(oracle.requestStatuses(requestId)),
            uint256(CompletionOracle.RequestStatus.Fulfilled),
            "status"
        );
        _assertEq(certificate.certificateOf(STUDENT, courseId), 1, "certificate");

        // KeystoneForwarder may retry a report after a transport ambiguity.
        forwarder.deliver(address(oracle), _metadata(), report);
        _assertEq(certificate.nextTokenId(), 2, "duplicate certificate");
    }

    function testOnlyForwarderAndExpectedWorkflowCanDeliver() public {
        uint256 requestId = _request();
        bytes memory report = abi.encode(requestId, true, "0xevidence", "ipfs://certificate");

        vm.prank(ATTACKER);
        vm.expectRevert(CompletionOracle.InvalidForwarder.selector);
        oracle.onReport(_metadata(), report);

        bytes memory wrongMetadata =
            abi.encodePacked(WORKFLOW_ID, WORKFLOW_NAME, ATTACKER, bytes2(0));
        vm.expectRevert(
            abi.encodeWithSelector(
                CompletionOracle.InvalidWorkflowOwner.selector, ATTACKER, WORKFLOW_OWNER
            )
        );
        forwarder.deliver(address(oracle), wrongMetadata, report);
    }

    function testIncompleteReportFailsWithoutMintAndAllowsRetry() public {
        uint256 requestId = _request();
        forwarder.deliver(address(oracle), _metadata(), abi.encode(requestId, false, "", ""));

        _assertEq(
            uint256(oracle.requestStatuses(requestId)),
            uint256(CompletionOracle.RequestStatus.Failed),
            "failed status"
        );
        _assertEq(certificate.certificateOf(STUDENT, courseId), 0, "certificate minted");
        _assertEq(_request(), 2, "retry request id");
    }

    function testPendingRequestCannotDuplicateAndCanTimeOut() public {
        uint256 requestId = _request();

        vm.prank(STUDENT);
        vm.expectRevert(
            abi.encodeWithSelector(CompletionOracle.RequestAlreadyPending.selector, requestId)
        );
        oracle.requestCompletion(courseId);

        vm.expectRevert(CompletionOracle.RequestNotTimedOut.selector);
        oracle.markTimedOut(requestId);

        vm.warp(block.timestamp + oracle.requestTimeout());
        oracle.markTimedOut(requestId);
        _assertEq(
            uint256(oracle.requestStatuses(requestId)),
            uint256(CompletionOracle.RequestStatus.TimedOut),
            "timed out"
        );
        _assertEq(_request(), 2, "retry after timeout");
    }

    function testInvalidOrUnknownReportCannotMint() public {
        uint256 requestId = _request();

        vm.expectRevert(CompletionOracle.InvalidCompletionReport.selector);
        forwarder.deliver(
            address(oracle), _metadata(), abi.encode(requestId, true, "", "ipfs://certificate")
        );
        _assertEq(certificate.certificateOf(STUDENT, courseId), 0, "invalid report minted");

        forwarder.deliver(
            address(oracle),
            _metadata(),
            abi.encode(uint256(999), true, "0xevidence", "ipfs://certificate")
        );
        _assertEq(certificate.certificateOf(STUDENT, courseId), 0, "unknown report minted");
    }

    function testFallbackSignatureMintsAndCREReplayIsIgnored() public {
        uint256 requestId = _request();
        bytes32 evidenceHash = sha256("completion-evidence");
        string memory tokenURI = "https://api.example/metadata/fallback";
        uint256 deadline = block.timestamp + 5 minutes;
        bytes memory signature = _signFallback(requestId, evidenceHash, tokenURI, deadline);

        vm.prank(ATTACKER);
        oracle.fulfillWithSignature(requestId, evidenceHash, tokenURI, deadline, signature);

        _assertEq(
            uint256(oracle.requestStatuses(requestId)),
            uint256(CompletionOracle.RequestStatus.Fulfilled),
            "fallback status"
        );
        _assertEq(certificate.certificateOf(STUDENT, courseId), 1, "fallback certificate");

        bytes memory report = abi.encode(requestId, true, "0xother", "ipfs://other");
        forwarder.deliver(address(oracle), _metadata(), report);
        _assertEq(certificate.nextTokenId(), 2, "CRE replay minted duplicate");
    }

    function testFallbackRejectsExpiredTamperedAndWrongSignerProofs() public {
        uint256 requestId = _request();
        bytes32 evidenceHash = sha256("completion-evidence");
        string memory tokenURI = "https://api.example/metadata/fallback";
        uint256 deadline = block.timestamp + 5 minutes;
        bytes memory signature = _signFallback(requestId, evidenceHash, tokenURI, deadline);

        vm.expectRevert();
        oracle.fulfillWithSignature(requestId, evidenceHash, "ipfs://tampered", deadline, signature);

        vm.warp(deadline + 1);
        vm.expectRevert(CompletionOracle.FallbackSignatureExpired.selector);
        oracle.fulfillWithSignature(requestId, evidenceHash, tokenURI, deadline, signature);

        uint256 freshDeadline = block.timestamp + 5 minutes;
        bytes32 digest =
            oracle.completionAttestationDigest(requestId, evidenceHash, tokenURI, freshDeadline);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(uint256(0xBAD), digest);
        vm.expectRevert();
        oracle.fulfillWithSignature(
            requestId, evidenceHash, tokenURI, freshDeadline, abi.encodePacked(r, s, v)
        );
    }

    function testFallbackCanBeDisabledAndCannotReplay() public {
        uint256 requestId = _request();
        bytes32 evidenceHash = sha256("completion-evidence");
        string memory tokenURI = "https://api.example/metadata/fallback";
        uint256 deadline = block.timestamp + 5 minutes;
        bytes memory signature = _signFallback(requestId, evidenceHash, tokenURI, deadline);

        oracle.setFallbackOracleSigner(address(0));
        vm.expectRevert(CompletionOracle.FallbackOracleDisabled.selector);
        oracle.fulfillWithSignature(requestId, evidenceHash, tokenURI, deadline, signature);

        oracle.setFallbackOracleSigner(vm.addr(FALLBACK_SIGNER_KEY));
        oracle.fulfillWithSignature(requestId, evidenceHash, tokenURI, deadline, signature);
        vm.expectRevert(CompletionOracle.RequestAlreadyFulfilled.selector);
        oracle.fulfillWithSignature(requestId, evidenceHash, tokenURI, deadline, signature);
    }

    function _request() private returns (uint256 requestId) {
        vm.prank(STUDENT);
        requestId = oracle.requestCompletion(courseId);
    }

    function _metadata() private pure returns (bytes memory) {
        // Production Forwarder metadata is 64 bytes: 62-byte identity + bytes2 reportId.
        return abi.encodePacked(WORKFLOW_ID, WORKFLOW_NAME, WORKFLOW_OWNER, bytes2(0));
    }

    function _signFallback(
        uint256 requestId,
        bytes32 evidenceHash,
        string memory tokenURI,
        uint256 deadline
    ) private returns (bytes memory) {
        bytes32 digest = oracle.completionAttestationDigest(
            requestId, evidenceHash, tokenURI, deadline
        );
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(FALLBACK_SIGNER_KEY, digest);
        return abi.encodePacked(r, s, v);
    }

    function _assertEq(uint256 actual, uint256 expected, string memory message) private pure {
        require(actual == expected, message);
    }
}
