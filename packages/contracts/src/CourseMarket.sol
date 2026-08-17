// SPDX-License-Identifier: MIT
// 本合约采用 MIT 开源许可证。
pragma solidity ^0.8.24;
// 允许使用 Solidity 0.8.24 至 0.9.0 之前的编译器。

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
// AccessControl 提供基于角色的权限管理，比单一 owner 更适合多人协作。

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
// IERC20 是 ERC-20 的接口。本合约只需要调用 YD，不需要继承代币实现。

import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
// SafeERC20 对 transfer/transferFrom 做兼容性和返回值检查。

import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
// Pausable 提供紧急暂停能力，用来临时关闭购买入口。

import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

// ReentrancyGuard 防止恶意合约在一次购买尚未结束时重新进入 buy。

/// @title Course Market
/// @notice 管理课程提交、审核状态和使用 YD 购买课程的链上市场。
/// @dev 课程的标题、章节和视频等大体积内容保存在链下；链上只保存关键事实。
contract CourseMarket is AccessControl, Pausable, ReentrancyGuard {
    // 把 SafeERC20 的安全方法附加到 IERC20 类型。
    // 之后可以使用 ydToken.safeTransferFrom(...)。
    using SafeERC20 for IERC20;

    // 每个角色都是一个唯一的 bytes32 标识。
    // keccak256 对固定字符串取哈希，确保不同角色不会发生命名冲突。
    // REVIEWER_ROLE：审批、拒绝或下架课程。
    bytes32 public constant REVIEWER_ROLE = keccak256("REVIEWER_ROLE");
    // TEACHER_ROLE：提交新课程。
    bytes32 public constant TEACHER_ROLE = keccak256("TEACHER_ROLE");
    // PAUSER_ROLE：在紧急情况下暂停或恢复购买。
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    // enum 在链上以整数保存：Pending=0、Active=1、Rejected=2、Offline=3。
    // Pending：等待审核；Active：可以购买；Rejected：审核拒绝；Offline：已下架。
    enum CourseStatus {
        Pending,
        Active,
        Rejected,
        Offline
    }

    // struct 把一门课程的链上字段组合到一起。
    struct Course {
        // 合约生成的课程唯一编号。
        uint256 id;
        // 提交课程的教师钱包地址。
        address teacher;
        // 以 YD 最小单位表示的价格。YD 使用 18 位小数。
        uint256 priceYD;
        // 指向链下元数据的 URI，可以是 HTTPS 或 IPFS URI。
        string metadataURI;
        // 当前审核/上下架状态。
        CourseStatus status;
    }

    // immutable 表示地址只在构造函数中赋值一次，此后不能修改。
    // IERC20 让本合约通过标准接口与 YDToken 交互。
    IERC20 public immutable ydToken;
    // 所有课程收入统一转入 treasury，而不是保留在本合约中。
    address public immutable treasury;
    // 下一个课程编号。编号从 1 开始，0 被保留为“不存在”。
    uint256 public nextCourseId = 1;

    // courseId => Course：通过课程编号查找完整的链上课程信息。
    mapping(uint256 courseId => Course) public courses;
    // courseId => student => bool：记录某个学生是否购买过某门课程。
    // 双层 mapping 可以直接回答“地址 A 是否购买课程 B”。
    mapping(uint256 courseId => mapping(address student => bool)) public purchased;

    // event 会写入交易日志。前端和 The Graph 可以监听事件建立课程列表。
    // indexed 参数可以被节点高效筛选。
    event CourseSubmitted(
        uint256 indexed courseId, address indexed teacher, uint256 priceYD, string metadataURI
    );
    // 课程状态发生变化时发出，包括审批、拒绝和下架。
    event CourseStatusChanged(uint256 indexed courseId, CourseStatus status);
    // 购买成功后发出。txTime 使用区块时间戳，而不是浏览器时间。
    event CoursePurchased(
        uint256 indexed courseId, address indexed buyer, uint256 priceYD, uint256 txTime
    );

    // custom error 比 require("字符串") 更节省 Gas，并方便前端区分失败原因。
    error CourseNotActive();
    error CourseAlreadyPurchased();
    error CourseNotFound();
    error InvalidPrice();

    /// @param admin 初始管理员地址，可以继续授予或撤销其他角色。
    /// @param ydTokenAddress 用于支付课程费用的 YDToken 合约地址。
    /// @param treasuryAddress 接收课程收入的金库地址。
    constructor(address admin, address ydTokenAddress, address treasuryAddress) {
        // 三个地址都是必要依赖，不能是无法正常使用的零地址。
        require(
            admin != address(0) && ydTokenAddress != address(0) && treasuryAddress != address(0),
            "zero address"
        );

        // 把普通 address 包装成 IERC20 接口，之后即可调用 ERC-20 方法。
        ydToken = IERC20(ydTokenAddress);
        treasury = treasuryAddress;

        // DEFAULT_ADMIN_ROLE 是 AccessControl 内置的最高管理角色。
        // 它默认可以管理其他角色，但构造函数不会自动把它授予部署者，必须显式授予。
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        // 初始管理员同时具备审核和暂停权限，便于项目启动。
        _grantRole(REVIEWER_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);
        // 注意：这里没有自动授予 TEACHER_ROLE，需要管理员部署后单独授权教师。
    }

    /// @notice 由已授权教师提交一门待审核课程。
    /// @param metadataURI 链下课程元数据的位置。
    /// @param priceYD 使用 YD 最小单位表示的课程价格。
    /// @return courseId 新创建的课程编号。
    function submitCourse(string calldata metadataURI, uint256 priceYD)
        external
        // onlyRole 在函数执行前验证 msg.sender 是否拥有教师角色。
        onlyRole(TEACHER_ROLE)
        returns (uint256 courseId)
    {
        // 免费课程暂不在这个市场模型中，因此价格必须大于 0。
        if (priceYD == 0) revert InvalidPrice();

        // 后缀 ++：先把当前 nextCourseId 赋给 courseId，再将计数器加 1。
        courseId = nextCourseId++;

        // 新课程总是从 Pending 开始，必须经过 Reviewer 审核才能购买。
        courses[courseId] = Course(courseId, msg.sender, priceYD, metadataURI, CourseStatus.Pending);

        // 发出事件后，链下索引器不必遍历 mapping 就能发现新课程。
        emit CourseSubmitted(courseId, msg.sender, priceYD, metadataURI);
    }

    /// @notice 审核通过课程，使其可以被购买。
    function approveCourse(uint256 courseId) external onlyRole(REVIEWER_ROLE) {
        _setStatus(courseId, CourseStatus.Active);
    }

    /// @notice 拒绝课程。
    function rejectCourse(uint256 courseId) external onlyRole(REVIEWER_ROLE) {
        _setStatus(courseId, CourseStatus.Rejected);
    }

    /// @notice 下架课程。已发生的购买记录不会因此消失。
    function offlineCourse(uint256 courseId) external onlyRole(REVIEWER_ROLE) {
        _setStatus(courseId, CourseStatus.Offline);
    }

    /// @notice 使用 YD 购买一门已上架课程。
    /// @dev 调用前，学生必须先在 YDToken 中 approve 本合约使用足够的 YD。
    function buy(uint256 courseId) external nonReentrant whenNotPaused {
        // storage 表示 course 是链上原始数据的引用，修改它会直接修改 mapping 中的数据。
        Course storage course = courses[courseId];

        // 因为有效 ID 从 1 开始，id == 0 表示该 mapping 位置从未存入课程。
        if (course.id == 0) revert CourseNotFound();
        // 只有审核通过且仍处于 Active 状态的课程可以购买。
        if (course.status != CourseStatus.Active) revert CourseNotActive();
        // 每个地址对同一课程只能购买一次。
        if (purchased[courseId][msg.sender]) revert CourseAlreadyPurchased();

        // 先写入购买状态，再调用外部代币合约，遵循 Checks-Effects-Interactions 模式：
        // Checks：上面的存在、状态和重复购买检查；
        // Effects：更新 purchased；
        // Interactions：下面调用 YDToken。
        purchased[courseId][msg.sender] = true;

        // 从学生地址把课程价格转给 treasury。
        // 这一步要求学生余额充足，而且之前已 approve CourseMarket 足够的 allowance。
        // 如果转账失败，整笔交易会 revert，前面的 purchased=true 也会自动回滚。
        ydToken.safeTransferFrom(msg.sender, treasury, course.priceYD);

        // 只有状态更新和代币转账全部成功后，才会留下购买事件。
        emit CoursePurchased(courseId, msg.sender, course.priceYD, block.timestamp);
    }

    /// @notice 查询学生是否购买过指定课程。
    /// @dev view 函数只读状态，链下调用时不需要 Gas 或钱包签名。
    function hasPurchased(address student, uint256 courseId) external view returns (bool) {
        return purchased[courseId][student];
    }

    /// @notice 紧急暂停购买功能。
    // pause 本身仍可调用；whenNotPaused 目前只加在 buy 上，所以提交和审核不受影响。
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /// @notice 恢复购买功能。
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    /// @dev 集中处理课程状态修改，避免三个外部函数重复“课程是否存在”的检查。
    function _setStatus(uint256 courseId, CourseStatus status) internal {
        if (courses[courseId].id == 0) revert CourseNotFound();
        courses[courseId].status = status;
        emit CourseStatusChanged(courseId, status);
    }
}
