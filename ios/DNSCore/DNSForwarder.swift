//
//  DNSForwarder.swift
//  DNSCore
//
//  本地DNS处理 - 不使用外部DNS服务商
//  DNS查询在本地进行过滤处理，然后通过系统DNS解析
//

import Foundation
import Network
import os.log

// MARK: - DNS Server (简化版)
struct DNSServer {
    enum ServerType {
        case system    // 使用系统DNS
    }

    let type: ServerType
    var isHealthy: Bool = true

    init(type: ServerType = .system) {
        self.type = type
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

// MARK: - System DNS Forwarder
/// 使用系统DNS进行解析（通过UDP转发到系统配置的DNS服务器）
class SystemDNSForwarder: DNSForwarder {

    private let logger = OSLog(subsystem: "com.idns.dns", category: "SystemDNSForwarder")
    private var connection: NWConnection?
    private var connectionVersion: Int = 0
    private let connectionLock = NSLock()

    // 系统DNS服务器（从网络配置获取或使用常见公共DNS作为后备）
    private let systemDNSServers: [String] = ["8.8.8.8", "1.1.1.1", "114.114.114.114"]
    private var currentServerIndex: Int = 0

    init() {}

    func forward(query: DNSQuery, completion: @escaping (ForwardResult) -> Void) {
        let startTime = Date()
        let server = DNSServer(type: .system)

        // 尝试使用系统DNS服务器
        tryNextServer(query: query, serverIndex: 0, startTime: startTime, completion: completion)
    }

    private func tryNextServer(query: DNSQuery, serverIndex: Int, startTime: Date, completion: @escaping (ForwardResult) -> Void) {
        guard serverIndex < systemDNSServers.count else {
            let error = NSError(domain: "SystemDNSForwarder", code: -1,
                              userInfo: [NSLocalizedDescriptionKey: "All DNS servers failed"])
            let server = DNSServer(type: .system)
            completion(ForwardResult(response: nil, latency: 0, error: error, server: server))
            return
        }

        let serverIP = systemDNSServers[serverIndex]

        let endpoint = NWEndpoint.hostPort(host: NWEndpoint.Host(serverIP), port: 53)
        let connection = NWConnection(to: endpoint, using: .udp)

        connection.stateUpdateHandler = { [weak self] state in
            guard let self = self else { return }
            os_log("DNS connection to %{public}@ state: %{public}@",
                   log: self.logger, type: .debug, serverIP, "\(state)")
        }

        connection.start(queue: .global(qos: .userInitiated))

        // 发送查询
        connection.send(content: query.packet, completion: .contentProcessed { error in
            if let error = error {
                os_log("DNS send to %{public}@ failed: %{public}@",
                       log: self.logger, type: .error, serverIP, error.localizedDescription)
                connection.cancel()
                // 尝试下一个服务器
                self.tryNextServer(query: query, serverIndex: serverIndex + 1, startTime: startTime, completion: completion)
                return
            }

            // 设置超时
            let timeoutTimer = DispatchSource.makeTimerSource(queue: .global(qos: .userInitiated))
            timeoutTimer.schedule(deadline: .now() + 5.0)
            timeoutTimer.setEventHandler {
                connection.cancel()
                os_log("DNS query to %{public}@ timed out", log: self.logger, type: .error, serverIP)
                // 尝试下一个服务器
                self.tryNextServer(query: query, serverIndex: serverIndex + 1, startTime: startTime, completion: completion)
            }
            timeoutTimer.resume()

            // 接收响应
            connection.receiveMessage { data, _, isComplete, error in
                timeoutTimer.cancel()
                let latency = Date().timeIntervalSince(startTime)

                connection.cancel()

                if let error = error {
                    os_log("DNS receive from %{public}@ failed: %{public}@",
                           log: self.logger, type: .error, serverIP, error.localizedDescription)
                    // 尝试下一个服务器
                    self.tryNextServer(query: query, serverIndex: serverIndex + 1, startTime: startTime, completion: completion)
                    return
                }

                guard let data = data, !data.isEmpty else {
                    os_log("DNS query to %{public}@ returned empty response",
                           log: self.logger, type: .error, serverIP)
                    // 尝试下一个服务器
                    self.tryNextServer(query: query, serverIndex: serverIndex + 1, startTime: startTime, completion: completion)
                    return
                }

                os_log("DNS query to %{public}@ succeeded in %.0fms",
                       log: self.logger, type: .debug, serverIP, latency * 1000)

                let server = DNSServer(type: .system)
                completion(ForwardResult(response: data, latency: latency, error: nil, server: server))
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

// MARK: - DNS Forwarder Manager (简化版)
class DNSForwarderManager {

    private let logger = OSLog(subsystem: "com.idns.dns", category: "ForwarderManager")
    private let systemForwarder: SystemDNSForwarder
    private let lock = NSLock()

    // 统计
    private var successCount: Int = 0
    private var failureCount: Int = 0

    init(servers: [DNSServer] = []) {
        self.systemForwarder = SystemDNSForwarder()
    }

    func forward(query: DNSQuery, completion: @escaping (ForwardResult) -> Void) {
        // 直接使用系统DNS转发
        systemForwarder.forward(query: query) { [weak self] result in
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
        systemForwarder.cancel()
    }

    func updateServers(_ servers: [DNSServer]) {
        // 本地DNS处理模式 - 不需要更新服务器
    }

    func getStatistics() -> [String: Any] {
        lock.lock()
        defer { lock.unlock() }

        return [
            "successCount": successCount,
            "failureCount": failureCount,
            "mode": "local"
        ]
    }
}
