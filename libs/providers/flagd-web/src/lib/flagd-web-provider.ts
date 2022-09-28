import {
  EvaluationContext,
  ResolutionDetails,
  ErrorCode,
  StandardResolutionReasons
} from '@openfeature/nodejs-sdk';
import {
  createConnectTransport,
  createPromiseClient,
  PromiseClient,
  ConnectError,
  Code
} from "@bufbuild/connect-web";
import { Struct } from "@bufbuild/protobuf";
import { Service } from '../proto/ts/schema/v1/schema_connectweb'

export const ERROR_PARSE_ERROR = "PARSE_ERROR"
export const ERROR_DISABLED = "DISABLED"
export const ERROR_UNKNOWN = "UNKNOWN"

export interface FlagdWebProviderOptions {
  host?: string;
  port?: number;
  protocol?: string;
}

interface Cache {
  [key: string]: ResolutionDetails<object|boolean|number|string>
}

export class FlagdWebProvider {
  metadata = {
    name: 'flagD Provider',
  };

  promiseClient: PromiseClient<typeof Service>

  cache: Cache

  constructor(options?: FlagdWebProviderOptions) {
    const {host, port, protocol}: FlagdWebProviderOptions = {
      host: "localhost",
      port: 8013,
      protocol: "http",
      ...options
    };
    const transport = createConnectTransport({
      baseUrl: `${protocol}://${host}:${port}`
    });
    this.promiseClient = createPromiseClient(Service, transport);
    this.cache = {}
  }

  resolveBooleanEvaluation(
    flagKey: string,
    defaultValue: boolean,
    transformedContext: EvaluationContext
  ): Promise<ResolutionDetails<boolean>> {
    const req = {
      flagKey,
      context: Struct.fromJsonString(JSON.stringify(transformedContext)),
    }
    const reqHash = JSON.stringify(req);
    if (this.cache[reqHash] != null) {
      console.log(`returning value from cache`)
      return Promise.resolve(this.cache[reqHash] as ResolutionDetails<boolean>)
    }
    return this.promiseClient.resolveBoolean(req).then((res) => {
      const resDetails = {
        value: res.value,
        reason: res.reason,
        variant: res.variant,
      }
      this.cache[reqHash] = resDetails
      return resDetails
    }).catch((err: unknown) => {
      return {
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorResponse(err),
        value: defaultValue,
      };
    })
  }

  resolveStringEvaluation(
    flagKey: string,
    defaultValue: string,
    transformedContext: EvaluationContext
  ): Promise<ResolutionDetails<string>> {
    return this.promiseClient.resolveString({
      flagKey,
      context: Struct.fromJsonString(JSON.stringify(transformedContext)),
    }).then((res) => {
      return {
        value: res.value,
        reason: res.reason,
        variant: res.variant,
      }
    }).catch((err: unknown) => {
      return {
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorResponse(err),
        value: defaultValue,
      };
    })
  }

  resolveNumberEvaluation(
    flagKey: string,
    defaultValue: number,
    transformedContext: EvaluationContext
  ): Promise<ResolutionDetails<number>> {
    return this.promiseClient.resolveFloat({
      flagKey,
      context: Struct.fromJsonString(JSON.stringify(transformedContext)),
    }).then((res) => {
      return {
        value: res.value,
        reason: res.reason,
        variant: res.variant,
      }
    }).catch((err: unknown) => {
      return {
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorResponse(err),
        value: defaultValue,
      };
    })
  }

  resolveObjectEvaluation<U extends object>(
    flagKey: string,
    defaultValue: U,
    transformedContext: EvaluationContext
  ): Promise<ResolutionDetails<U>> {
    return this.promiseClient.resolveObject({
      flagKey,
      context: Struct.fromJsonString(JSON.stringify(transformedContext)),
    }).then((res) => {
      if (res.value) {
        return {
          value: JSON.parse(res.value.toJsonString()) as U,
          reason: res.reason,
          variant: res.variant,
        }
      }
      return {
        value: defaultValue,
        reason: res.reason,
        variant: res.variant,
      }
    }).catch((err: unknown) => {
      return {
        reason: StandardResolutionReasons.ERROR,
        errorCode: ErrorResponse(err),
        value: defaultValue,
      };
    })
  }
}

function ErrorResponse(err: unknown): string {
  err as Partial<ConnectError>
  switch ((err as Partial<ConnectError>).code) {
    case Code.NotFound:
      return ErrorCode.FLAG_NOT_FOUND
    case Code.InvalidArgument:
      return ErrorCode.TYPE_MISMATCH
    case Code.Unavailable:
        return ERROR_DISABLED
    case Code.DataLoss:
        return ERROR_PARSE_ERROR
    default:
      return ERROR_UNKNOWN
  }
}
