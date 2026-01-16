//
//  DNSForwarder.swift
//  DNSCore
//
//  DoH (DNS over HTTPS) 实现 - RFC 8484
//  使用加密的HTTPS协议查询DNS，提供隐私保护
//

import Foundation
import Network
import os.log

// MARK: - DNS Server
struct DNSServer {
    enum ServerType {
        case doh      // DNS over HTTPS
        case system   // 系统DNS (fallback)
    }

    let type: ServerType
    let url: String?  // DoH URL
    var isHealthy: Bool = true

    init(type: ServerType = .doh, url: String? = "https://i-dns.wnluo.com/dns-query") {
        self.type = type
        self.url = url
    }
}

// MARK: - Forward Result
struct ForwardResult {
    let response: Data?
    let latency: TimeInterval
    let error: Error?
    let server: DNSServer

    var isSuccess: Bool {
        return response != nil && error == nil
    }
}

// MARK: - DNS Forwarder Protocol
protocol DNSForwarder {
    func forward(query: DNSQuery, completion: @escaping (ForwardResult) -> Void)
    func cancel()
}

// MARK: - DoH (DNS over HTTPS) Forwarder
/// 使用HTTPS协议进行DNS查询 (RFC 8484)
/// 提供加密传输和隐私保护
class DoHForwarder: DNSForwarder {

    private let logger = OSLog(subsystem: "com.idns.dns", category: "DoHForwarder")
    private let dohServerURL: URL
    private let session: URLSession

    // DoH 服务器: https://i-dns.wnluo.com/dns-query
    init(dohURL: String = "https://i-dns.wnluo.com/dns-query") {
        guard let url = URL(string: dohURL) else {
            fatalError("Invalid DoH URL: \(dohURL)")
        }
        self.dohServerURL = url

        // Configure URLSession for HTTP/2 and connection reuse
        let config = URLSessionConfiguration.default
        config.httpMaximumConnectionsPerHost = 10
        config.timeoutIntervalForRequest = 5.0
        config.timeoutIntervalForResource = 10.0
        config.requestCachePolicy = .reloadIgnoringLocalCacheData

        self.session = URLSession(configuration: config)

        os_log("DoH Forwarder initialized with URL: %{public}@", log: logger, type: .info, dohURL)
    }

    func forward(query: DNSQuery, completion: @escaping (ForwardResult) -> Void) {
        let startTime = Date()
        let server = DNSServer(type: .doh, url: dohServerURL.absoluteString)

        os_log("📤 Sending DoH query for domain: %{public}@", log: logger, type: .debug, query.domain)

        // Create HTTP POST request with DNS query data
        var request = URLRequest(url: dohServerURL)
        request.httpMethod = "POST"
        request.httpBody = query.packet
        request.setValue("application/dns-message", forHTTPHeaderField: "Content-Type")
        request.setValue("application/dns-message", forHTTPHeaderField: "Accept")

        // Execute DoH request
        let task = session.dataTask(with: request) { [weak self] data, response, error in
            guard let self = self else { return }

            let latency = Date().timeIntervalSince(startTime)

            // Check for network errors
            if let error = error {
                os_log("❌ DoH request failed: %{public}@", log: self.logger, type: .error, error.localizedDescription)
                completion(ForwardResult(response: nil, latency: latency, error: error, server: server))
                return
            }

            // Check HTTP status code
            if let httpResponse = response as? HTTPURLResponse {
                if httpResponse.statusCode != 200 {
                    let error = NSError(
                        domain: "DoHForwarder",
                        code: httpResponse.statusCode,
                        userInfo: [NSLocalizedDescriptionKey: "DoH server returned HTTP \(httpResponse.statusCode)"]
                    )
                    os_log("❌ DoH HTTP error: %d", log: self.logger, type: .error, httpResponse.statusCode)
                    completion(ForwardResult(response: nil, latency: latency, error: error, server: server))
                    return
                }
            }

            // Check response data
            guard let data = data, !data.isEmpty else {
                let error = NSError(
                    domain: "DoHForwarder",
                    code: -1,
                    userInfo: [NSLocalizedDescriptionKey: "DoH server returned empty response"]
                )
                os_log("❌ Empty DoH response", log: self.logger, type: .error)
                completion(ForwardResult(response: nil, latency: latency, error: error, server: server))
                return
            }

            os_log("✅ DoH query succeeded in %.0fms (response: %d bytes)",
                   log: self.logger, type: .info, latency * 1000, data.count)

            completion(ForwardResult(response: data, latency: latency, error: nil, server: server))
        }

        task.resume()
    }

    func cancel() {
        session.invalidateAndCancel()
    }
}

// MARK: - DNS Forwarder Manager
class DNSForwarderManager {

    private let logger = OSLog(subsystem: "com.idns.dns", category: "ForwarderManager")
    private let dohForwarder: DoHForwarder
    private let lock = NSLock()

    // 统计
    private var successCount: Int = 0
    private var failureCount: Int = 0

    init(servers: [DNSServer] = []) {
        // Initialize with DoH forwarder
        self.dohForwarder = DoHForwarder(dohURL: "https://i-dns.wnluo.com/dns-query")
        os_log("DNS Forwarder Manager initialized with DoH", log: logger, type: .info)
    }

    func forward(query: DNSQuery, completion: @escaping (ForwardResult) -> Void) {
        // 使用 DoH 转发所有查询
        dohForwarder.forward(query: query) { [weak self] result in
            guard let self = self else { return }

            self.lock.lock()
            if result.isSuccess {
                self.successCount += 1
            } else {
                self.failureCount += 1
            }
            self.lock.unlock()

            completion(result)
        }
    }

    func cancel() {
        dohForwarder.cancel()
    }

    func updateServers(_ servers: [DNSServer]) {
        // DoH 模式 - DNS服务器已固定为 i-dns.wnluo.com
        os_log("DNS update request ignored (DoH mode with fixed server)", log: logger, type: .info)
    }

    func getStatistics() -> [String: Any] {
        lock.lock()
        defer { lock.unlock() }

        return [
            "successCount": successCount,
            "failureCount": failureCount,
            "mode": "doh",
            "server": "https://i-dns.wnluo.com/dns-query"
        ]
    }
}
