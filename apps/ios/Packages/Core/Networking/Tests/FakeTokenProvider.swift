import Domain
import Foundation

actor FakeTokenProvider: AccessTokenProvider {
  private(set) var rejected: [String] = []
  private(set) var instants: [Date] = []
  private let current: String
  private let renewed: String
  private let failure: (any Error)?
  private let renewalFailure: (any Error)?

  init(current: String = "access-1", renewed: String = "access-2", failure: (any Error)? = nil, renewalFailure: (any Error)? = nil) {
    self.current = current
    self.renewed = renewed
    self.failure = failure
    self.renewalFailure = renewalFailure
  }

  func accessToken(at now: Date) throws -> String {
    instants.append(now)
    if let failure { throw failure }
    return current
  }

  func accessTokenRejected(_ token: String, at now: Date) throws -> String {
    instants.append(now)
    rejected.append(token)
    if let renewalFailure { throw renewalFailure }
    return renewed
  }
}
