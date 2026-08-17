// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { EIP712 } from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";
import { IReceiver } from "./interfaces/IReceiver.sol";

interface ICourseMarket {
    function hasPurchased(address student, uint256 courseId) external view returns (bool);
}

interface ICourseCertificate {
    function mintCertificate(address student, uint256 courseId, string calldata uri)
        external
        returns (uint256);

    function certificateOf(address student, uint256 courseId) external view returns (uint256);
}

/// @title Completion Oracle
/// @notice Emits completion requests for a CRE Log Trigger and accepts DON-signed reports through
/// the Chainlink KeystoneForwarder. The ORACLE_ROLE path is retained for local Anvil development.
contract CompletionOracle is AccessControl, EIP712, IReceiver {
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");
    bytes32 public constant COMPLETION_ATTESTATION_TYPEHASH = keccak256(
        "CompletionAttestation(uint256 requestId,address student,uint256 courseId,bytes32 evidenceHash,string tokenURI,uint256 deadline)"
    );
    uint48 public constant DEFAULT_REQUEST_TIMEOUT = 15 minutes;

    ICourseMarket public immutable courseMarket;
    ICourseCertificate public immutable certificate;

    address public creForwarder;
    address public fallbackOracleSigner;
    address public expectedWorkflowOwner;
    bytes10 public expectedWorkflowName;
    bytes32 public expectedWorkflowId;
    uint48 public requestTimeout = DEFAULT_REQUEST_TIMEOUT;
    uint256 public nextRequestId = 1;

    enum RequestStatus {
        None,
        Pending,
        Fulfilled,
        Failed,
        TimedOut
    }

    // Keep the original public getter shape for API and local-stage compatibility.
    struct Request {
        address student;
        uint256 courseId;
        bool fulfilled;
    }

    mapping(uint256 requestId => Request) public requests;
    mapping(uint256 requestId => RequestStatus) public requestStatuses;
    mapping(uint256 requestId => uint48) public requestCreatedAt;
    mapping(address student => mapping(uint256 courseId => uint256 requestId)) public
        activeRequestId;

    event CompletionRequested(
        uint256 indexed requestId, address indexed student, uint256 indexed courseId
    );
    event CompletionFulfilled(uint256 indexed requestId, bool completed, string evidenceHash);
    event CompletionRequestTimedOut(uint256 indexed requestId);
    event CREReportIgnored(uint256 indexed requestId, RequestStatus status);
    event CREForwarderUpdated(address indexed previousForwarder, address indexed newForwarder);
    event FallbackOracleSignerUpdated(address indexed previousSigner, address indexed newSigner);
    event CREWorkflowIdentityUpdated(
        address indexed owner, bytes10 indexed name, bytes32 indexed workflowId
    );
    event RequestTimeoutUpdated(uint48 previousTimeout, uint48 newTimeout);

    error CourseNotPurchased();
    error CertificateAlreadyIssued();
    error RequestAlreadyPending(uint256 requestId);
    error RequestAlreadyFulfilled();
    error RequestNotFound();
    error RequestNotPending();
    error RequestNotTimedOut();
    error InvalidForwarder();
    error FallbackOracleDisabled();
    error FallbackSignatureExpired();
    error InvalidFallbackSignature(address recovered, address expected);
    error InvalidCREMetadata();
    error InvalidWorkflowOwner(address received, address expected);
    error InvalidWorkflowName(bytes10 received, bytes10 expected);
    error InvalidWorkflowId(bytes32 received, bytes32 expected);
    error InvalidCompletionReport();
    error InvalidRequestTimeout();

    constructor(address admin, address market, address certificateAddress, address forwarder)
        EIP712("Web3UniversityCompletionOracle", "1")
    {
        require(
            admin != address(0) && market != address(0) && certificateAddress != address(0),
            "zero address"
        );
        if (forwarder == address(0)) revert InvalidForwarder();

        courseMarket = ICourseMarket(market);
        certificate = ICourseCertificate(certificateAddress);
        creForwarder = forwarder;
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    /// @notice Creates the onchain event consumed by the CRE EVM Log Trigger.
    function requestCompletion(uint256 courseId) external returns (uint256 requestId) {
        if (!courseMarket.hasPurchased(msg.sender, courseId)) revert CourseNotPurchased();
        if (certificate.certificateOf(msg.sender, courseId) != 0) {
            revert CertificateAlreadyIssued();
        }

        uint256 currentId = activeRequestId[msg.sender][courseId];
        if (currentId != 0 && requestStatuses[currentId] == RequestStatus.Pending) {
            revert RequestAlreadyPending(currentId);
        }

        requestId = nextRequestId++;
        requests[requestId] = Request(msg.sender, courseId, false);
        requestStatuses[requestId] = RequestStatus.Pending;
        requestCreatedAt[requestId] = uint48(block.timestamp);
        activeRequestId[msg.sender][courseId] = requestId;
        emit CompletionRequested(requestId, msg.sender, courseId);
    }

    /// @notice Local-only fulfillment hook. Public deployments should leave ORACLE_ROLE unassigned.
    function fulfillCompletion(
        uint256 requestId,
        bool completed,
        string calldata evidenceHash,
        string calldata tokenURI
    ) external onlyRole(ORACLE_ROLE) {
        _fulfill(requestId, completed, evidenceHash, tokenURI);
    }

    /// @notice Fallback path for a completion attestation signed by the AWS-hosted Oracle key.
    /// @dev Anyone may relay the signature. The EIP-712 domain binds it to this chain and contract;
    /// the request data, evidence, token URI and deadline are all covered by the signature.
    function fulfillWithSignature(
        uint256 requestId,
        bytes32 evidenceHash,
        string calldata tokenURI,
        uint256 deadline,
        bytes calldata signature
    ) external {
        address expectedSigner = fallbackOracleSigner;
        if (expectedSigner == address(0)) revert FallbackOracleDisabled();
        if (block.timestamp > deadline) revert FallbackSignatureExpired();

        Request storage request = requests[requestId];
        if (request.student == address(0)) revert RequestNotFound();
        if (requestStatuses[requestId] != RequestStatus.Pending) {
            if (request.fulfilled) revert RequestAlreadyFulfilled();
            revert RequestNotPending();
        }
        if (evidenceHash == bytes32(0) || bytes(tokenURI).length == 0) {
            revert InvalidCompletionReport();
        }

        bytes32 digest = completionAttestationDigest(requestId, evidenceHash, tokenURI, deadline);
        address recovered = ECDSA.recover(digest, signature);
        if (recovered != expectedSigner) {
            revert InvalidFallbackSignature(recovered, expectedSigner);
        }

        _fulfill(requestId, true, Strings.toHexString(uint256(evidenceHash), 32), tokenURI);
    }

    /// @notice Returns the exact EIP-712 digest signed by the fallback Oracle.
    function completionAttestationDigest(
        uint256 requestId,
        bytes32 evidenceHash,
        string calldata tokenURI,
        uint256 deadline
    ) public view returns (bytes32) {
        Request storage request = requests[requestId];
        bytes32 structHash = keccak256(
            abi.encode(
                COMPLETION_ATTESTATION_TYPEHASH,
                requestId,
                request.student,
                request.courseId,
                evidenceHash,
                keccak256(bytes(tokenURI)),
                deadline
            )
        );
        return _hashTypedDataV4(structHash);
    }

    /// @inheritdoc IReceiver
    function onReport(bytes calldata metadata, bytes calldata report) external override {
        if (msg.sender != creForwarder) revert InvalidForwarder();
        _validateWorkflow(metadata);
        if (report.length < 128) revert InvalidCompletionReport();

        (uint256 requestId, bool completed, string memory evidenceHash, string memory tokenURI) =
            abi.decode(report, (uint256, bool, string, string));

        RequestStatus status = requestStatuses[requestId];
        // CRE reports can be retried by the Forwarder. Stale retries must succeed without minting.
        if (status != RequestStatus.Pending) {
            emit CREReportIgnored(requestId, status);
            return;
        }
        _fulfill(requestId, completed, evidenceHash, tokenURI);
    }

    /// @notice Marks a request timed out so the student can create a fresh request.
    function markTimedOut(uint256 requestId) external {
        Request storage request = requests[requestId];
        if (request.student == address(0)) revert RequestNotFound();
        if (requestStatuses[requestId] != RequestStatus.Pending) revert RequestNotPending();
        if (block.timestamp < requestCreatedAt[requestId] + requestTimeout) {
            revert RequestNotTimedOut();
        }

        requestStatuses[requestId] = RequestStatus.TimedOut;
        if (activeRequestId[request.student][request.courseId] == requestId) {
            activeRequestId[request.student][request.courseId] = 0;
        }
        emit CompletionRequestTimedOut(requestId);
    }

    function setCREForwarder(address forwarder) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (forwarder == address(0)) revert InvalidForwarder();
        address previous = creForwarder;
        creForwarder = forwarder;
        emit CREForwarderUpdated(previous, forwarder);
    }

    /// @notice Enables, rotates, or disables the AWS-signed fallback without changing CRE.
    function setFallbackOracleSigner(address signer) external onlyRole(DEFAULT_ADMIN_ROLE) {
        address previous = fallbackOracleSigner;
        fallbackOracleSigner = signer;
        emit FallbackOracleSignerUpdated(previous, signer);
    }

    function setCREWorkflowIdentity(address owner, bytes10 name, bytes32 workflowId)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        expectedWorkflowOwner = owner;
        expectedWorkflowName = name;
        expectedWorkflowId = workflowId;
        emit CREWorkflowIdentityUpdated(owner, name, workflowId);
    }

    function setRequestTimeout(uint48 timeoutSeconds) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (timeoutSeconds < 5 minutes || timeoutSeconds > 7 days) {
            revert InvalidRequestTimeout();
        }
        uint48 previous = requestTimeout;
        requestTimeout = timeoutSeconds;
        emit RequestTimeoutUpdated(previous, timeoutSeconds);
    }

    function _fulfill(
        uint256 requestId,
        bool completed,
        string memory evidenceHash,
        string memory tokenURI
    ) private {
        Request storage request = requests[requestId];
        if (request.student == address(0)) revert RequestNotFound();
        if (requestStatuses[requestId] != RequestStatus.Pending) {
            if (request.fulfilled) revert RequestAlreadyFulfilled();
            revert RequestNotPending();
        }
        if (completed && (bytes(evidenceHash).length == 0 || bytes(tokenURI).length == 0)) {
            revert InvalidCompletionReport();
        }

        request.fulfilled = true;
        requestStatuses[requestId] = completed ? RequestStatus.Fulfilled : RequestStatus.Failed;
        if (activeRequestId[request.student][request.courseId] == requestId) {
            activeRequestId[request.student][request.courseId] = 0;
        }

        if (completed && certificate.certificateOf(request.student, request.courseId) == 0) {
            certificate.mintCertificate(request.student, request.courseId, tokenURI);
        }
        emit CompletionFulfilled(requestId, completed, evidenceHash);
    }

    function _validateWorkflow(bytes calldata metadata) private view {
        if (
            expectedWorkflowOwner == address(0) && expectedWorkflowName == bytes10(0)
                && expectedWorkflowId == bytes32(0)
        ) return;
        if (metadata.length != 62 && metadata.length != 64) revert InvalidCREMetadata();

        bytes32 workflowId;
        bytes10 workflowName;
        address workflowOwner;
        assembly {
            workflowId := calldataload(metadata.offset)
            workflowName := calldataload(add(metadata.offset, 32))
            workflowOwner := shr(96, calldataload(add(metadata.offset, 42)))
        }

        if (expectedWorkflowId != bytes32(0) && workflowId != expectedWorkflowId) {
            revert InvalidWorkflowId(workflowId, expectedWorkflowId);
        }
        if (expectedWorkflowOwner != address(0) && workflowOwner != expectedWorkflowOwner) {
            revert InvalidWorkflowOwner(workflowOwner, expectedWorkflowOwner);
        }
        if (expectedWorkflowName != bytes10(0) && workflowName != expectedWorkflowName) {
            revert InvalidWorkflowName(workflowName, expectedWorkflowName);
        }
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(AccessControl, IERC165)
        returns (bool)
    {
        return interfaceId == type(IReceiver).interfaceId || super.supportsInterface(interfaceId);
    }
}
