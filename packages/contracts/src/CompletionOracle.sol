// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

interface ICourseMarket {
    function hasPurchased(address student, uint256 courseId) external view returns (bool);
}

interface ICourseCertificate {
    function mintCertificate(address student, uint256 courseId, string calldata uri) external returns (uint256);
}

contract CompletionOracle is AccessControl {
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    ICourseMarket public immutable courseMarket;
    ICourseCertificate public immutable certificate;
    uint256 public nextRequestId = 1;

    struct Request {
        address student;
        uint256 courseId;
        bool fulfilled;
    }

    mapping(uint256 requestId => Request) public requests;

    event CompletionRequested(uint256 indexed requestId, address indexed student, uint256 indexed courseId);
    event CompletionFulfilled(uint256 indexed requestId, bool completed, string evidenceHash);

    error CourseNotPurchased();
    error RequestAlreadyFulfilled();
    error RequestNotFound();

    constructor(address admin, address market, address certificateAddress) {
        require(admin != address(0) && market != address(0) && certificateAddress != address(0), "zero address");
        courseMarket = ICourseMarket(market);
        certificate = ICourseCertificate(certificateAddress);
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function requestCompletion(uint256 courseId) external returns (uint256 requestId) {
        if (!courseMarket.hasPurchased(msg.sender, courseId)) revert CourseNotPurchased();
        requestId = nextRequestId++;
        requests[requestId] = Request(msg.sender, courseId, false);
        emit CompletionRequested(requestId, msg.sender, courseId);
        // Chainlink Functions request wiring is intentionally isolated to the next implementation stage.
    }

    function fulfillCompletion(uint256 requestId, bool completed, string calldata evidenceHash, string calldata tokenURI)
        external
        onlyRole(ORACLE_ROLE)
    {
        Request storage request = requests[requestId];
        if (request.student == address(0)) revert RequestNotFound();
        if (request.fulfilled) revert RequestAlreadyFulfilled();
        request.fulfilled = true;

        if (completed) certificate.mintCertificate(request.student, request.courseId, tokenURI);
        emit CompletionFulfilled(requestId, completed, evidenceHash);
    }
}
