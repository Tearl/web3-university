import {
  bytesToHex,
  cre,
  getNetwork,
  hexToBase64,
  TxStatus,
  type EVMLog,
  type Runtime,
} from "@chainlink/cre-sdk";
import { decodeEventLog, encodeAbiParameters, parseAbi, parseAbiParameters } from "viem";
import { fetchCompletion } from "./completion-api";
import type { WorkflowConfig } from "./main";

const COMPLETION_EVENT = parseAbi([
  "event CompletionRequested(uint256 indexed requestId, address indexed student, uint256 indexed courseId)",
]);
const COMPLETION_REPORT = parseAbiParameters(
  "uint256 requestId, bool completed, string evidenceHash, string tokenURI",
);

export function onCompletionRequested(runtime: Runtime<WorkflowConfig>, log: EVMLog): string {
  const evmConfig = runtime.config.evms[0];
  if (!evmConfig) throw new Error("Missing EVM workflow config");

  const decoded = decodeEventLog({
    abi: COMPLETION_EVENT,
    data: bytesToHex(log.data),
    topics: log.topics.map((topic: Uint8Array) => bytesToHex(topic)) as [
      `0x${string}`,
      ...`0x${string}`[],
    ],
  });
  const requestId = decoded.args.requestId;
  const student = decoded.args.student;
  const courseId = decoded.args.courseId;
  runtime.log(`CompletionRequested #${requestId} for ${student}, course ${courseId}`);

  const completion = fetchCompletion(runtime, student, courseId);
  if (completion.completed && (!completion.evidenceHash || !completion.tokenUri)) {
    throw new Error("Completed response is missing evidenceHash or tokenUri");
  }

  const payload = encodeAbiParameters(COMPLETION_REPORT, [
    requestId,
    completion.completed,
    completion.evidenceHash,
    completion.tokenUri,
  ]);
  const signedReport = runtime
    .report({
      encodedPayload: hexToBase64(payload),
      encoderName: "evm",
      signingAlgo: "ecdsa",
      hashingAlgo: "keccak256",
    })
    .result();

  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: evmConfig.chainSelectorName,
    isTestnet: true,
  });
  if (!network) throw new Error(`Unknown CRE network: ${evmConfig.chainSelectorName}`);

  const writeResult = new cre.capabilities.EVMClient(network.chainSelector.selector)
    .writeReport(runtime, {
      receiver: evmConfig.completionOracleAddress,
      report: signedReport,
      gasConfig: { gasLimit: evmConfig.gasLimit },
    })
    .result();
  if (writeResult.txStatus !== TxStatus.SUCCESS) {
    throw new Error(`CRE report transaction failed: ${writeResult.txStatus}`);
  }

  const transactionHash = bytesToHex(writeResult.txHash ?? new Uint8Array(32));
  runtime.log(`Completion report confirmed: ${transactionHash}`);
  return transactionHash;
}
