// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract CourseMarket is AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    bytes32 public constant REVIEWER_ROLE = keccak256("REVIEWER_ROLE");
    bytes32 public constant TEACHER_ROLE = keccak256("TEACHER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    enum CourseStatus { Pending, Active, Rejected, Offline }

    struct Course {
        uint256 id;
        address teacher;
        uint256 priceYD;
        string metadataURI;
        CourseStatus status;
    }

    IERC20 public immutable ydToken;
    address public immutable treasury;
    uint256 public nextCourseId = 1;

    mapping(uint256 courseId => Course) public courses;
    mapping(uint256 courseId => mapping(address student => bool)) public purchased;

    event CourseSubmitted(uint256 indexed courseId, address indexed teacher, uint256 priceYD, string metadataURI);
    event CourseStatusChanged(uint256 indexed courseId, CourseStatus status);
    event CoursePurchased(uint256 indexed courseId, address indexed buyer, uint256 priceYD, uint256 txTime);

    error CourseNotActive();
    error CourseAlreadyPurchased();
    error CourseNotFound();
    error InvalidPrice();

    constructor(address admin, address ydTokenAddress, address treasuryAddress) {
        require(admin != address(0) && ydTokenAddress != address(0) && treasuryAddress != address(0), "zero address");
        ydToken = IERC20(ydTokenAddress);
        treasury = treasuryAddress;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(REVIEWER_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
    }

    function submitCourse(string calldata metadataURI, uint256 priceYD)
        external
        onlyRole(TEACHER_ROLE)
        returns (uint256 courseId)
    {
        if (priceYD == 0) revert InvalidPrice();
        courseId = nextCourseId++;
        courses[courseId] = Course(courseId, msg.sender, priceYD, metadataURI, CourseStatus.Pending);
        emit CourseSubmitted(courseId, msg.sender, priceYD, metadataURI);
    }

    function approveCourse(uint256 courseId) external onlyRole(REVIEWER_ROLE) {
        _setStatus(courseId, CourseStatus.Active);
    }

    function rejectCourse(uint256 courseId) external onlyRole(REVIEWER_ROLE) {
        _setStatus(courseId, CourseStatus.Rejected);
    }

    function offlineCourse(uint256 courseId) external onlyRole(REVIEWER_ROLE) {
        _setStatus(courseId, CourseStatus.Offline);
    }

    function buy(uint256 courseId) external nonReentrant whenNotPaused {
        Course storage course = courses[courseId];
        if (course.id == 0) revert CourseNotFound();
        if (course.status != CourseStatus.Active) revert CourseNotActive();
        if (purchased[courseId][msg.sender]) revert CourseAlreadyPurchased();

        purchased[courseId][msg.sender] = true;
        ydToken.safeTransferFrom(msg.sender, treasury, course.priceYD);
        emit CoursePurchased(courseId, msg.sender, course.priceYD, block.timestamp);
    }

    function hasPurchased(address student, uint256 courseId) external view returns (bool) {
        return purchased[courseId][student];
    }

    function pause() external onlyRole(PAUSER_ROLE) { _pause(); }
    function unpause() external onlyRole(PAUSER_ROLE) { _unpause(); }

    function _setStatus(uint256 courseId, CourseStatus status) internal {
        if (courses[courseId].id == 0) revert CourseNotFound();
        courses[courseId].status = status;
        emit CourseStatusChanged(courseId, status);
    }
}
