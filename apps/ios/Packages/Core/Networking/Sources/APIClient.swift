import Domain
import Foundation
import OpenAPIRuntime

extension Client {
  init(apiBaseURL: URL, transport: any HTTPTransport, middlewares: [any ClientMiddleware] = []) {
    self.init(
      serverURL: apiBaseURL,
      configuration: Configuration(dateTranscoder: TolerantISO8601DateTranscoder()),
      transport: TransportBridge(transport: transport),
      middlewares: middlewares
    )
  }
}

func unwrappingClientError<Output>(_ call: () async throws -> Output) async throws -> Output {
  do {
    return try await call()
  } catch let error as ClientError {
    throw error.underlyingError
  }
}

struct TolerantISO8601DateTranscoder: DateTranscoder {
  private static let withFraction = Date.ISO8601FormatStyle(includingFractionalSeconds: true)
  private static let withoutFraction = Date.ISO8601FormatStyle()

  func encode(_ date: Date) throws -> String {
    Self.withFraction.format(date)
  }

  func decode(_ string: String) throws -> Date {
    guard let date = (try? Self.withFraction.parse(string)) ?? (try? Self.withoutFraction.parse(string)) else {
      throw DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "Date ISO 8601 attendue : \(string)"))
    }
    return date
  }
}

extension ServiceProblem {
  init(_ problem: Components.Schemas.Problem) {
    self.init(type: problem._type, title: problem.title, status: problem.status, detail: problem.detail)
  }
}
