// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

contract CourseCertificate is ERC721URIStorage, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");
    uint256 public nextTokenId = 1;

    mapping(address student => mapping(uint256 courseId => uint256 tokenId)) public certificateOf;

    event CertificateIssued(uint256 indexed tokenId, uint256 indexed courseId, address indexed student, string tokenURI);

    error CertificateAlreadyIssued();
    error CertificateNonTransferable();

    constructor(address admin) ERC721("Web3 University Certificate", "W3CERT") {
        require(admin != address(0), "zero admin");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    function mintCertificate(address student, uint256 courseId, string calldata uri)
        external
        onlyRole(MINTER_ROLE)
        returns (uint256 tokenId)
    {
        if (certificateOf[student][courseId] != 0) revert CertificateAlreadyIssued();
        tokenId = nextTokenId++;
        certificateOf[student][courseId] = tokenId;
        _safeMint(student, tokenId);
        _setTokenURI(tokenId, uri);
        emit CertificateIssued(tokenId, courseId, student, uri);
    }

    function _update(address to, uint256 tokenId, address auth) internal override returns (address from) {
        from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) revert CertificateNonTransferable();
        return super._update(to, tokenId, auth);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721URIStorage, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
