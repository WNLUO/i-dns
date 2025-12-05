//
//  DNSForwarder.swift
//  DNSCore
//
//  DNS query forwarding with DoH, UDP, and Direct modes
//  Includes automatic failover and health checking
//

import Foundation
import Network
import os.log

// MARK: - DNS Server
struct DNSServer {
    enum ServerType {
        case doh       // DNS over HTTPS
        case udp       // Traditional UDP DNS
        case direct    // Direct UDP to specific IP
    }

    let url: String
    let type: ServerType
    let priority: Int
    var isHealthy: Bool = true
    var averageLatency: TimeInterval = 0

    init(url: String, type: ServerType, priority: Int = 1) {
        self.url = url
        self.type = type
        self.priority = priority
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

// MARK: - DoH Forwarder
class DoHForwarder: DNSForwarder {

    private let server: DNSServer
    private let session: URLSession
    private let logger = OSLog(subsystem: "com.idns.dns", category: "DoHForwarder")

    private var currentTask: URLSessionDataTask?

    init(server: DNSServer) {
        self.server = server

        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 8.0
        config.timeoutIntervalForResource = 8.0
        config.requestCachePolicy = .reloadIgnoringLocalCacheData
        config.urlCache = nil
        config.httpShouldSetCookies = false
        config.httpCookieAcceptPolicy = .never
        config.waitsForConnectivity = false
        config.allowsCellularAccess = true
        config.allowsExpensiveNetworkAccess = true
        config.allowsConstrainedNetworkAccess = true
        config.httpMaximumConnectionsPerHost = 30

        self.session = URLSession(configuration: config)
    }

    func forward(query: DNSQuery, completion: @escaping (ForwardResult) -> Void) {
        let startTime = Date()

        guard let url = URL(string: server.url) else {
            let error = NSError(domain: "DoHForwarder", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid URL"])
            completion(ForwardResult(response: nil, latency: 0, error: error, server: server))
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/dns-message", forHTTPHeaderField: "Content-Type")
        request.setValue("application/dns-message", forHTTPHeaderField: "Accept")
        request.httpBody = query.packet

        currentTask = session.dataTask(with: request) { [weak self] data, response, error in
            guard let self = self else { return }

            let latency = Date().timeIntervalSince(startTime)

            if let error = error {
                os_log("DoH query failed: %{public}@", log: self.logger, type: .error, error.localizedDescription)
                completion(ForwardResult(response: nil, latency: latency, error: error, server: self.server))
                return
            }

            guard let httpResponse = response as? HTTPURLResponse else {
                let error = NSError(domain: "DoHForwarder", code: -2, userInfo: [NSLocalizedDescriptionKey: "Invalid response"])
                completion(ForwardResult(response: nil, latency: latency, error: error, server: self.server))
                return
            }

            guard httpResponse.statusCode == 200 else {
                let error = NSError(domain: "DoHForwarder", code: httpResponse.statusCode,
                                  userInfo: [NSLocalizedDescriptionKey: "HTTP \(httpResponse.statusCode)"])
                completion(ForwardResult(response: nil, latency: latency, error: error, server: self.server))
                return
            }

            guard let data = data, !data.isEmpty else {
                let error = NSError(domain: "DoHForwarder", code: -3, userInfo: [NSLocalizedDescriptionKey: "Empty response"])
                completion(ForwardResult(response: nil, latency: latency, error: error, server: self.server))
                return
            }

            os_log("DoH query succeeded in %.0fms", log: self.logger, type: .debug, latency * 1000)
            completion(ForwardResult(response: data, latency: latency, error: nil, server: self.server))
        }

        currentTask?.resume()
    }

    func cancel() {
        currentTask?.cancel()
        currentTask = nil
    }
}

// MARK: - UDP Forwarder
class UDPForwarder: DNSForwarder {

    private let server: DNSServer
    private let logger = OSLog(subsystem: "com.idns.dns", category: "UDPForwarder")

    private var connection: NWConnection?
    private var connectionVersion: Int = 0
    private let connectionLock = NSLock()

    init(server: DNSServer) {
        self.server = server
    }

    func forward(query: DNSQuery, completion: @escaping (ForwardResult) -> Void) {
        let startTime = Date()

        // Parse server address (format: "8.8.8.8" or "8.8.8.8:53")
        let components = server.url.split(separator: ":")
        let host = String(components[0])
        let port = components.count > 1 ? UInt16(components[1]) ?? 53 : 53

        // Create or reuse connection
        connectionLock.lock()
        let currentVersion = connectionVersion

        if connection == nil || connection?.state == .cancelled || connection?.state == .failed {
            let endpoint = NWEndpoint.hostPort(host: NWEndpoint.Host(host), port: NWEndpoint.Port(rawValue: port)!)
            connection = NWConnection(to: endpoint, using: .udp)
            connectionVersion += 1

            connection?.stateUpdateHandler = { [weak self] state in
                guard let self = self else { return }
                os_log("UDP connection state: %{public}@", log: self.logger, type: .debug, "\(state)")
            }

            connection?.start(queue: .global(qos: .userInitiated))
        }

        guard let connection = connection, currentVersion == connectionVersion else {
            connectionLock.unlock()
            let error = NSError(domain: "UDPForwarder", code: -1, userInfo: [NSLocalizedDescriptionKey: "Connection unavailable"])
            completion(ForwardResult(response: nil, latency: 0, error: error, server: server))
            return
        }
        connectionLock.unlock()

        // Send query
        connection.send(content: query.packet, completion: .contentProcessed { [weak self] error in
            guard let self = self else { return }

            if let error = error {
                os_log("UDP send failed: %{public}@", log: self.logger, type: .error, error.localizedDescription)
                let latency = Date().timeIntervalSince(startTime)
                completion(ForwardResult(response: nil, latency: latency, error: error, server: self.server))
                return
            }

            // Receive response
            connection.receiveMessage { data, _, isComplete, error in
                let latency = Date().timeIntervalSince(startTime)

                if let error = error {
                    os_log("UDP receive failed: %{public}@", log: self.logger, type: .error, error.localizedDescription)
                    completion(ForwardResult(response: nil, latency: latency, error: error, server: self.server))
                    return
                }

                guard let data = data, !data.isEmpty else {
                    let error = NSError(domain: "UDPForwarder", code: -2, userInfo: [NSLocalizedDescriptionKey: "Empty response"])
                    completion(ForwardResult(response: nil, latency: latency, error: error, server: self.server))
                    return
                }

                os_log("UDP query succeeded in %.0fms", log: self.logger, type: .debug, latency * 1000)
                completion(ForwardResult(response: data, latency: latency, error: nil, server: self.server))
            }
        })
    }

    func cancel() {
        connectionLock.lock()
        defer { connectionLock.unlock() }

        connection?.cancel()
        connection = nil
        connectionVersion += 1
    }
}

// MARK: - Direct Forwarder
/// Direct UDP forwarder to specific DNS server IP (bypasses VPN routing)
class DirectForwarder: DNSForwarder {

    private let servers: [String]  // List of DNS server IPs to try
    private let logger = OSLog(subsystem: "com.idns.dns", category: "DirectForwarder")

    init(servers: [String]) {
        self.servers = servers
    }

    func forward(query: DNSQuery, completion: @escaping (ForwardResult) -> Void) {
        // Try servers in order until one succeeds
        tryNextServer(query: query, serverIndex: 0, completion: completion)
    }

    private func tryNextServer(query: DNSQuery, serverIndex: Int, completion: @escaping (ForwardResult) -> Void) {
        guard serverIndex < servers.count else {
            let error = NSError(domain: "DirectForwarder", code: -1,
                              userInfo: [NSLocalizedDescriptionKey: "All servers failed"])
            let dummyServer = DNSServer(url: "direct", type: .direct)
            completion(ForwardResult(response: nil, latency: 0, error: error, server: dummyServer))
            return
        }

        let serverIP = servers[serverIndex]
        let startTime = Date()

        let endpoint = NWEndpoint.hostPort(host: NWEndpoint.Host(serverIP), port: 53)
        let connection = NWConnection(to: endpoint, using: .udp)

        connection.stateUpdateHandler = { [weak self] state in
            guard let self = self else { return }
            os_log("Direct connection to %{public}@ state: %{public}@",
                   log: self.logger, type: .debug, serverIP, "\(state)")
        }

        connection.start(queue: .global(qos: .userInitiated))

        // Send query
        connection.send(content: query.packet, completion: .contentProcessed { error in
            if let error = error {
                os_log("Direct send to %{public}@ failed: %{public}@",
                       log: self.logger, type: .error, serverIP, error.localizedDescription)
                connection.cancel()
                // Try next server
                self.tryNextServer(query: query, serverIndex: serverIndex + 1, completion: completion)
                return
            }

            // Receive response with timeout
            let timeoutTimer = DispatchSource.makeTimerSource(queue: .global(qos: .userInitiated))
            timeoutTimer.schedule(deadline: .now() + 5.0)
            timeoutTimer.setEventHandler {
                connection.cancel()
                os_log("Direct query to %{public}@ timed out", log: self.logger, type: .error, serverIP)
                // Try next server
                self.tryNextServer(query: query, serverIndex: serverIndex + 1, completion: completion)
            }
            timeoutTimer.resume()

            connection.receiveMessage { data, _, isComplete, error in
                timeoutTimer.cancel()
                let latency = Date().timeIntervalSince(startTime)

                connection.cancel()

                if let error = error {
                    os_log("Direct receive from %{public}@ failed: %{public}@",
                           log: self.logger, type: .error, serverIP, error.localizedDescription)
                    // Try next server
                    self.tryNextServer(query: query, serverIndex: serverIndex + 1, completion: completion)
                    return
                }

                guard let data = data, !data.isEmpty else {
                    os_log("Direct query to %{public}@ returned empty response",
                           log: self.logger, type: .error, serverIP)
                    // Try next server
                    self.tryNextServer(query: query, serverIndex: serverIndex + 1, completion: completion)
                    return
                }

                os_log("Direct query to %{public}@ succeeded in %.0fms",
                       log: self.logger, type: .debug, serverIP, latency * 1000)

                let server = DNSServer(url: serverIP, type: .direct)
                completion(ForwardResult(response: data, latency: latency, error: nil, server: server))
            }
        })
    }

    func cancel() {
        // No-op for direct forwarder as connections are short-lived
    }
}

// MARK: - Failover Forwarder Manager
class DNSForwarderManager {

    private var servers: [DNSServer]
    private let logger = OSLog(subsystem: "com.idns.dns", category: "ForwarderManager")

    private var currentForwarder: DNSForwarder?
    private let lock = NSLock()

    // Statistics
    private var successCount: [String: Int] = [:]
    private var failureCount: [String: Int] = [:]

    init(servers: [DNSServer]) {
        self.servers = servers.sorted { $0.priority < $1.priority }
    }

    func forward(query: DNSQuery, completion: @escaping (ForwardResult) -> Void) {
        // Try servers in priority order
        tryNextServer(query: query, serverIndex: 0, completion: completion)
    }

    private func tryNextServer(query: DNSQuery, serverIndex: Int, completion: @escaping (ForwardResult) -> Void) {
        guard serverIndex < servers.count else {
            let error = NSError(domain: "ForwarderManager", code: -1,
                              userInfo: [NSLocalizedDescriptionKey: "All DNS servers failed"])
            let dummyServer = DNSServer(url: "none", type: .doh)
            completion(ForwardResult(response: nil, latency: 0, error: error, server: dummyServer))
            return
        }

        let server = servers[serverIndex]

        // Create appropriate forwarder
        let forwarder: DNSForwarder
        switch server.type {
        case .doh:
            forwarder = DoHForwarder(server: server)
        case .udp:
            forwarder = UDPForwarder(server: server)
        case .direct:
            let directServers = server.url.split(separator: ",").map(String.init)
            forwarder = DirectForwarder(servers: directServers)
        }

        lock.lock()
        currentForwarder = forwarder
        lock.unlock()

        os_log("Trying DNS server: %{public}@ (priority %d)", log: logger, type: .debug,
               server.url, server.priority)

        forwarder.forward(query: query) { [weak self] result in
            guard let self = self else { return }

            if result.isSuccess {
                // Success - update statistics
                self.lock.lock()
                self.successCount[server.url, default: 0] += 1
                self.lock.unlock()

                os_log("DNS query succeeded via %{public}@ in %.0fms",
                       log: self.logger, type: .info, server.url, result.latency * 1000)
                completion(result)
            } else {
                // Failure - try next server
                self.lock.lock()
                self.failureCount[server.url, default: 0] += 1
                self.lock.unlock()

                os_log("DNS query failed via %{public}@: %{public}@, trying next server",
                       log: self.logger, type: .error, server.url, result.error?.localizedDescription ?? "unknown")
                self.tryNextServer(query: query, serverIndex: serverIndex + 1, completion: completion)
            }
        }
    }

    func cancel() {
        lock.lock()
        defer { lock.unlock() }

        currentForwarder?.cancel()
        currentForwarder = nil
    }

    func updateServers(_ servers: [DNSServer]) {
        lock.lock()
        defer { lock.unlock() }

        self.servers = servers.sorted { $0.priority < $1.priority }
    }

    func getStatistics() -> [String: Any] {
        lock.lock()
        defer { lock.unlock() }

        return [
            "successCount": successCount,
            "failureCount": failureCount,
            "servers": servers.map { ["url": $0.url, "type": "\($0.type)", "priority": $0.priority] }
        ]
    }
}
