// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { YDToken } from "../src/YDToken.sol";
import { CourseMarket } from "../src/CourseMarket.sol";
import { CourseCertificate } from "../src/CourseCertificate.sol";
import { CompletionOracle } from "../src/CompletionOracle.sol";

interface Vm {
    function prank(address) external;
    function startPrank(address) external;
    function stopPrank() external;
    function expectRevert(bytes4) external;
    function expectRevert(bytes calldata) external;
}

/// @dev A forge-std-free Foundry suite so a fresh checkout can run it without
/// installing another Git submodule. Foundry exposes the cheatcode contract at
/// this deterministic address.
contract CourseMarketTest {
    Vm private constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    address private constant TEACHER = address(0x1001);
    address private constant STUDENT = address(0x1002);
    address private constant OTHER = address(0x1003);
    address private constant TREASURY = address(0x1004);
    address private constant ORACLE_CALLBACK = address(0x1005);

    uint256 private constant PRICE = 25 ether;

    YDToken private yd;
    CourseMarket private market;
    CourseCertificate private certificate;
    CompletionOracle private oracle;

    function setUp() public {
        yd = new YDToken(address(this));
        market = new CourseMarket(address(this), address(yd), TREASURY);
        certificate = new CourseCertificate(address(this));
        oracle = new CompletionOracle(
            address(this), address(market), address(certificate), ORACLE_CALLBACK
        );

        market.grantRole(market.TEACHER_ROLE(), TEACHER);
        certificate.grantRole(certificate.MINTER_ROLE(), address(oracle));
        oracle.grantRole(oracle.ORACLE_ROLE(), ORACLE_CALLBACK);

        yd.transfer(STUDENT, 100 ether);
    }

    function testNonTeacherCannotSubmitCourse() public {
        bytes32 teacherRole = market.TEACHER_ROLE();
        vm.prank(OTHER);
        vm.expectRevert(
            abi.encodeWithSignature(
                "AccessControlUnauthorizedAccount(address,bytes32)", OTHER, teacherRole
            )
        );
        market.submitCourse("ipfs://course", PRICE);
    }

    function testTeacherCannotSubmitZeroPriceCourse() public {
        vm.prank(TEACHER);
        vm.expectRevert(CourseMarket.InvalidPrice.selector);
        market.submitCourse("ipfs://course", 0);
    }

    function testCannotBuyPendingCourse() public {
        uint256 courseId = _submitCourse();

        vm.prank(STUDENT);
        vm.expectRevert(CourseMarket.CourseNotActive.selector);
        market.buy(courseId);
    }

    function testOnlyReviewerCanApproveRejectOrOffline() public {
        uint256 courseId = _submitCourse();
        bytes32 reviewerRole = market.REVIEWER_ROLE();

        vm.prank(OTHER);
        vm.expectRevert(
            abi.encodeWithSignature(
                "AccessControlUnauthorizedAccount(address,bytes32)", OTHER, reviewerRole
            )
        );
        market.approveCourse(courseId);

        market.rejectCourse(courseId);
        (,,,, CourseMarket.CourseStatus rejectedStatus) = market.courses(courseId);
        _assertEq(uint256(rejectedStatus), uint256(CourseMarket.CourseStatus.Rejected), "rejected");

        market.approveCourse(courseId);
        market.offlineCourse(courseId);
        (,,,, CourseMarket.CourseStatus offlineStatus) = market.courses(courseId);
        _assertEq(uint256(offlineStatus), uint256(CourseMarket.CourseStatus.Offline), "offline");
    }

    function testApproveThenBuyTransfersYDAndRecordsPurchase() public {
        uint256 courseId = _activeCourse();
        uint256 treasuryBefore = yd.balanceOf(TREASURY);

        vm.startPrank(STUDENT);
        yd.approve(address(market), PRICE);
        market.buy(courseId);
        vm.stopPrank();

        _assertEq(yd.balanceOf(TREASURY), treasuryBefore + PRICE, "treasury balance");
        _assertTrue(market.hasPurchased(STUDENT, courseId), "purchase was not recorded");
    }

    function testCannotBuySameCourseTwice() public {
        uint256 courseId = _activeCourse();

        vm.startPrank(STUDENT);
        yd.approve(address(market), PRICE * 2);
        market.buy(courseId);
        vm.expectRevert(CourseMarket.CourseAlreadyPurchased.selector);
        market.buy(courseId);
        vm.stopPrank();
    }

    function testCannotBuyWhilePaused() public {
        uint256 courseId = _activeCourse();
        market.pause();

        vm.startPrank(STUDENT);
        yd.approve(address(market), PRICE);
        vm.expectRevert(bytes4(keccak256("EnforcedPause()")));
        market.buy(courseId);
        vm.stopPrank();
    }

    function testNonOracleCannotMintCertificate() public {
        bytes32 minterRole = certificate.MINTER_ROLE();
        vm.prank(OTHER);
        vm.expectRevert(
            abi.encodeWithSignature(
                "AccessControlUnauthorizedAccount(address,bytes32)", OTHER, minterRole
            )
        );
        certificate.mintCertificate(STUDENT, 1, "ipfs://certificate");
    }

    function testCannotRequestCompletionWithoutPurchase() public {
        uint256 courseId = _activeCourse();

        vm.prank(OTHER);
        vm.expectRevert(CompletionOracle.CourseNotPurchased.selector);
        oracle.requestCompletion(courseId);
    }

    function testCannotFulfillUnknownOrSameRequestTwice() public {
        vm.prank(ORACLE_CALLBACK);
        vm.expectRevert(CompletionOracle.RequestNotFound.selector);
        oracle.fulfillCompletion(999, true, "missing", "ipfs://missing");

        uint256 requestId = _requestCompletion(_buyCourse());
        vm.prank(ORACLE_CALLBACK);
        oracle.fulfillCompletion(requestId, false, "not-complete", "");

        vm.prank(ORACLE_CALLBACK);
        vm.expectRevert(CompletionOracle.RequestAlreadyFulfilled.selector);
        oracle.fulfillCompletion(requestId, true, "replay", "ipfs://replay");
    }

    function testIncompleteResultDoesNotMintCertificate() public {
        uint256 courseId = _buyCourse();
        uint256 requestId = _requestCompletion(courseId);

        vm.prank(ORACLE_CALLBACK);
        oracle.fulfillCompletion(requestId, false, "not-complete", "");

        _assertEq(certificate.certificateOf(STUDENT, courseId), 0, "certificate minted");
        (address student, uint256 requestedCourseId, bool fulfilled) = oracle.requests(requestId);
        _assertEq(student, STUDENT, "request student");
        _assertEq(requestedCourseId, courseId, "request course");
        _assertTrue(fulfilled, "request was not finalized");
    }

    function testCompletedResultStoresOwnerCourseAndTokenURI() public {
        uint256 courseId = _buyCourse();
        uint256 requestId = _requestCompletion(courseId);
        string memory uri = "https://api.example/certificates/metadata/evidence";

        vm.prank(ORACLE_CALLBACK);
        oracle.fulfillCompletion(requestId, true, "evidence", uri);

        uint256 tokenId = certificate.certificateOf(STUDENT, courseId);
        _assertEq(tokenId, 1, "certificate id");
        _assertEq(certificate.ownerOf(tokenId), STUDENT, "certificate owner");
        _assertEq(certificate.tokenURI(tokenId), uri, "certificate uri");
    }

    function testCannotIssueDuplicateCertificate() public {
        uint256 courseId = _buyCourse();
        uint256 requestId = _requestCompletion(courseId);

        vm.prank(ORACLE_CALLBACK);
        oracle.fulfillCompletion(requestId, true, "evidence-1", "ipfs://certificate");

        vm.expectRevert(CourseCertificate.CertificateAlreadyIssued.selector);
        vm.prank(STUDENT);
        oracle.requestCompletion(courseId);
    }

    function testCertificateCannotBeTransferred() public {
        uint256 courseId = _buyCourse();
        uint256 requestId = _requestCompletion(courseId);

        vm.prank(ORACLE_CALLBACK);
        oracle.fulfillCompletion(requestId, true, "evidence", "ipfs://certificate");
        uint256 tokenId = certificate.certificateOf(STUDENT, courseId);

        vm.prank(STUDENT);
        vm.expectRevert(CourseCertificate.CertificateNonTransferable.selector);
        certificate.transferFrom(STUDENT, OTHER, tokenId);
    }

    function _submitCourse() private returns (uint256 courseId) {
        vm.prank(TEACHER);
        courseId = market.submitCourse("ipfs://course", PRICE);
    }

    function _activeCourse() private returns (uint256 courseId) {
        courseId = _submitCourse();
        market.approveCourse(courseId);
    }

    function _buyCourse() private returns (uint256 courseId) {
        courseId = _activeCourse();
        vm.startPrank(STUDENT);
        yd.approve(address(market), PRICE);
        market.buy(courseId);
        vm.stopPrank();
    }

    function _requestCompletion(uint256 courseId) private returns (uint256 requestId) {
        vm.prank(STUDENT);
        requestId = oracle.requestCompletion(courseId);
    }

    function _assertEq(uint256 actual, uint256 expected, string memory message) private pure {
        require(actual == expected, message);
    }

    function _assertEq(address actual, address expected, string memory message) private pure {
        require(actual == expected, message);
    }

    function _assertEq(string memory actual, string memory expected, string memory message)
        private
        pure
    {
        require(keccak256(bytes(actual)) == keccak256(bytes(expected)), message);
    }

    function _assertTrue(bool value, string memory message) private pure {
        require(value, message);
    }
}
