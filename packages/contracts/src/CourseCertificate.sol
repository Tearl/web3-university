// SPDX-License-Identifier: MIT
// 本合约采用 MIT 开源许可证。
pragma solidity ^0.8.24;
// 允许使用 Solidity 0.8.24 至 0.9.0 之前的编译器。

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
// AccessControl 提供基于角色的权限管理，用于限制证书铸造权。

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
// ERC721 是 NFT 标准的基础实现。这里显式导入它，以便在多重继承中声明接口支持函数的 override 来源。

import {
    ERC721URIStorage
} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

// ERC721URIStorage 允许为每个证书 NFT 单独保存元数据 URI。

/// @title Course Certificate
/// @notice 为完成 Web3 University 课程的学生铸造不可转让的 NFT 证书。
/// @dev 每个学生对每门课程最多获得一枚证书；铸造权由 MINTER_ROLE 控制。
contract CourseCertificate is ERC721URIStorage, AccessControl {
    // MINTER_ROLE 是证书铸造者的唯一角色标识。
    // 部署后通常应将该角色授予 CompletionOracle 合约。
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    // 下一枚证书的 tokenId。从 1 开始，便于将 0 作为“尚未颁发”的标记。
    uint256 public nextTokenId = 1;

    // student => courseId => tokenId：查询某个学生在某门课程中获得的证书编号。
    // 返回 0 表示还没有为该学生颁发这门课的证书。
    mapping(address student => mapping(uint256 courseId => uint256 tokenId)) public certificateOf;

    // 证书铸造成功后写入交易日志，便于前端和索引器按证书、课程或学生检索。
    event CertificateIssued(
        uint256 indexed tokenId, uint256 indexed courseId, address indexed student, string tokenURI
    );

    // 同一学生的同一门课程已有证书时抛出。
    error CertificateAlreadyIssued();
    // 试图把证书从一个非零地址转给另一个非零地址时抛出。
    error CertificateNonTransferable();

    /// @param admin 初始管理员地址，可以授予或撤销 MINTER_ROLE。
    constructor(address admin) ERC721("Web3 University Certificate", "W3CERT") {
        // ERC721 构造函数设置 NFT 名称和符号。
        // 零地址无法正常管理角色，因此禁止将它设为管理员。
        require(admin != address(0), "zero admin");

        // DEFAULT_ADMIN_ROLE 是 AccessControl 内置的最高管理角色。
        // 这里不会自动授予 MINTER_ROLE，需要管理员在部署后单独配置铸造者。
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /// @notice 为完成指定课程的学生铸造一枚证书。
    /// @param student 证书接收者的钱包地址。
    /// @param courseId 学生完成的课程编号。
    /// @param uri 指向证书链下元数据的 URI。
    /// @return tokenId 新铸造的证书 NFT 编号。
    function mintCertificate(address student, uint256 courseId, string calldata uri)
        external
        // 只有被授予 MINTER_ROLE 的账户或合约才能颁发证书。
        onlyRole(MINTER_ROLE)
        returns (uint256 tokenId)
    {
        // tokenId 从 1 开始，因此非 0 值表示该课程证书已经颁发。
        if (certificateOf[student][courseId] != 0) revert CertificateAlreadyIssued();

        // 先取出当前编号，再将计数器加 1。
        tokenId = nextTokenId++;

        // 先记录课程与证书的对应关系，再执行铸造。
        // 如果后续任意操作 revert，这个写入也会随整笔交易回滚。
        certificateOf[student][courseId] = tokenId;

        // _safeMint 会铸造 NFT；如果 student 是合约，还会验证它能否接收 ERC-721。
        _safeMint(student, tokenId);

        // 为该 tokenId 保存独立的元数据地址。
        _setTokenURI(tokenId, uri);

        emit CertificateIssued(tokenId, courseId, student, uri);
    }

    /// @dev ERC721 的铸造、转让和销毁最终都会经过 _update。本重写仅禁止普通转让。
    function _update(address to, uint256 tokenId, address auth)
        internal
        override
        returns (address from)
    {
        // token 不存在时 from 为零地址，对应铸造；to 为零地址时对应销毁。
        from = _ownerOf(tokenId);

        // 只有 from 和 to 都是非零地址时才是用户之间的转让，此时拒绝操作。
        // 因此证书具有 Soulbound 特性，但铸造和销毁路径仍被保留。
        if (from != address(0) && to != address(0)) revert CertificateNonTransferable();

        // 交给 ERC721 完成所有权更新、授权检查和 Transfer 事件发布。
        return super._update(to, tokenId, auth);
    }

    /// @notice 查询本合约是否支持某个 ERC-165 接口。
    /// @dev ERC721URIStorage 和 AccessControl 都实现了 supportsInterface，因此需要显式合并两条继承路径。
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721URIStorage, AccessControl)
        returns (bool)
    {
        // super 会按 Solidity 的继承线性化顺序检查所有父合约支持的接口。
        return super.supportsInterface(interfaceId);
    }
}
