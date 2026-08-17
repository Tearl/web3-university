import {
  ConsensusAggregationByFields,
  cre,
  identical,
  ok,
  type HTTPSendRequester,
  type Runtime,
} from "@chainlink/cre-sdk";
import type { WorkflowConfig } from "./main";

export type CompletionResult = {
  wallet: string;
  courseId: string;
  completed: boolean;
  evidenceHash: string;
  tokenUri: string;
};

type CompletionApiResponse = Omit<CompletionResult, "evidenceHash" | "tokenUri"> & {
  evidenceHash: string | null;
  tokenUri: string | null;
};

type ChallengeResult = { nonce: string; expiresAt: number };

function decodeBody(body: Uint8Array) {
  return new TextDecoder().decode(body);
}

function jsonBody(value: unknown) {
  return Buffer.from(new TextEncoder().encode(JSON.stringify(value))).toString("base64");
}

export function fetchCompletion(
  runtime: Runtime<WorkflowConfig>,
  wallet: string,
  courseId: bigint,
): CompletionResult {
  const secret = runtime.getSecret({ id: "ORACLE_API_KEY" }).result();
  const client = new cre.capabilities.HTTPClient();

  return client
    .sendRequest(
      runtime,
      buildCompletionRequest(wallet, courseId, secret.value),
      ConsensusAggregationByFields<CompletionResult>({
        wallet: identical,
        courseId: identical,
        completed: identical,
        evidenceHash: identical,
        tokenUri: identical,
      }),
    )(runtime.config)
    .result();
}

const buildCompletionRequest =
  (wallet: string, courseId: bigint, apiKey: string) =>
  (requester: HTTPSendRequester, config: WorkflowConfig): CompletionResult => {
    const baseUrl = config.apiBaseUrl.replace(/\/$/, "");
    if (!baseUrl.startsWith("https://")) throw new Error("apiBaseUrl must use HTTPS");

    const headers = { "Content-Type": "application/json", "x-oracle-key": apiKey };
    const challengeResponse = requester
      .sendRequest({
        url: `${baseUrl}/oracle/challenge`,
        method: "POST",
        headers,
        body: jsonBody({ wallet, courseId: courseId.toString() }),
        cacheSettings: { store: false },
      })
      .result();
    if (!ok(challengeResponse)) {
      throw new Error(`Oracle challenge failed with status ${challengeResponse.statusCode}`);
    }

    const challenge = JSON.parse(decodeBody(challengeResponse.body)) as ChallengeResult;
    if (!challenge.nonce || !challenge.expiresAt) throw new Error("Malformed oracle challenge");

    const query = new URLSearchParams({
      wallet,
      courseId: courseId.toString(),
      nonce: challenge.nonce,
      expiresAt: challenge.expiresAt.toString(),
    });
    const completionResponse = requester
      .sendRequest({
        url: `${baseUrl}/oracle/completion?${query.toString()}`,
        method: "GET",
        headers: { "x-oracle-key": apiKey },
        cacheSettings: { store: false },
      })
      .result();
    if (!ok(completionResponse)) {
      throw new Error(`Oracle completion failed with status ${completionResponse.statusCode}`);
    }

    const apiResult = JSON.parse(decodeBody(completionResponse.body)) as CompletionApiResponse;
    const result: CompletionResult = {
      ...apiResult,
      evidenceHash: apiResult.evidenceHash ?? "",
      tokenUri: apiResult.tokenUri ?? "",
    };
    if (
      result.wallet.toLowerCase() !== wallet.toLowerCase()
      || result.courseId !== courseId.toString()
    ) {
      throw new Error("Oracle completion identity mismatch");
    }
    return result;
  };
