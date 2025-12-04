//
//  DNSVPNModule.swift
//  iDNS
//
//  React Native Bridge Implementation for VPN
//

import Foundation
import NetworkExtension
import React

@objc(DNSVPNModule)
class DNSVPNModule: RCTEventEmitter {

    private var vpnManager: NETunnelProviderManager?
    private var hasListeners = false
    private let appGroupIdentifier = "group.com.idns.wnlluo"

    // MARK: - Initialization

    override init() {
        super.init()
        loadVPNConfiguration()
        observeVPNStatus()
        observeDNSEvents()
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
        CFNotificationCenterRemoveEveryObserver(
            CFNotificationCenterGetDarwinNotifyCenter(),
            Unmanaged.passUnretained(self).toOpaque()
        )
    }

    // MARK: - RCTEventEmitter

    override func supportedEvents() -> [String]! {
        return ["DNSRequest", "VPNStatusChanged"]
    }

    override func startObserving() {
        hasListeners = true
    }

    override func stopObserving() {
        hasListeners = false
    }

    // MARK: - React Native Methods

    @objc func startVPN(_ resolve: @escaping RCTPromiseResolveBlock,
                       rejecter reject: @escaping RCTPromiseRejectBlock) {

        print("========================================")
        print("📱 DNSVPNModule: startVPN called")
        print("========================================")

        loadVPNConfiguration { [weak self] error in
            if let error = error {
                print("❌ Failed to load VPN configuration: \(error.localizedDescription)")
                reject("VPN_CONFIG_ERROR", "Failed to load VPN configuration: \(error.localizedDescription)", error)
                return
            }

            guard let self = self, let manager = self.vpnManager else {
                print("❌ VPN manager not initialized")
                reject("VPN_MANAGER_ERROR", "VPN manager not initialized", nil)
                return
            }

            print("✓ VPN manager loaded")
            print("VPN Configuration:")
            print("  Description: \(manager.localizedDescription ?? "none")")
            print("  Enabled: \(manager.isEnabled)")
            print("  Connection Status: \(manager.connection.status.rawValue)")

            do {
                print("🚀 Starting VPN tunnel...")
                try manager.connection.startVPNTunnel()
                print("✅ startVPNTunnel() called successfully")
                print("📊 Immediate status after start: \(manager.connection.status.rawValue)")
                print("========================================")
                resolve(true)
            } catch {
                print("❌ Failed to start VPN tunnel: \(error.localizedDescription)")
                print("========================================")
                reject("VPN_START_ERROR", "Failed to start VPN: \(error.localizedDescription)", error)
            }
        }
    }

    @objc func stopVPN(_ resolve: @escaping RCTPromiseResolveBlock,
                      rejecter reject: @escaping RCTPromiseRejectBlock) {

        print("========================================")
        print("🛑 DNSVPNModule: stopVPN called")
        print("========================================")

        guard let manager = vpnManager else {
            print("❌ VPN manager not initialized")
            reject("VPN_MANAGER_ERROR", "VPN manager not initialized", nil)
            return
        }

        print("📊 Status before stop: \(manager.connection.status.rawValue)")
        manager.connection.stopVPNTunnel()
        print("✅ stopVPNTunnel() called")
        print("========================================")
        resolve(nil)
    }

    @objc func getVPNStatus(_ resolve: @escaping RCTPromiseResolveBlock,
                           rejecter reject: @escaping RCTPromiseRejectBlock) {

        guard let manager = vpnManager else {
            resolve(false)
            return
        }

        let isConnected = manager.connection.status == .connected
        resolve(isConnected)
    }

    @objc func addDomainToBlacklist(_ domain: String,
                                   resolver resolve: @escaping RCTPromiseResolveBlock,
                                   rejecter reject: @escaping RCTPromiseRejectBlock) {

        sendMessageToProvider(type: "addBlacklist", domain: domain) { error in
            if let error = error {
                reject("VPN_MESSAGE_ERROR", error.localizedDescription, error)
            } else {
                // Also update shared storage
                self.updateSharedBlacklist(add: domain)
                resolve(nil)
            }
        }
    }

    @objc func removeDomainFromBlacklist(_ domain: String,
                                        resolver resolve: @escaping RCTPromiseResolveBlock,
                                        rejecter reject: @escaping RCTPromiseRejectBlock) {

        sendMessageToProvider(type: "removeBlacklist", domain: domain) { error in
            if let error = error {
                reject("VPN_MESSAGE_ERROR", error.localizedDescription, error)
            } else {
                // Also update shared storage
                self.updateSharedBlacklist(remove: domain)
                resolve(nil)
            }
        }
    }

    @objc func addDomainToWhitelist(_ domain: String,
                                   resolver resolve: @escaping RCTPromiseResolveBlock,
                                   rejecter reject: @escaping RCTPromiseRejectBlock) {

        sendMessageToProvider(type: "addWhitelist", domain: domain) { error in
            if let error = error {
                reject("VPN_MESSAGE_ERROR", error.localizedDescription, error)
            } else {
                // Also update shared storage
                self.updateSharedWhitelist(add: domain)
                resolve(nil)
            }
        }
    }

    @objc func removeDomainFromWhitelist(_ domain: String,
                                        resolver resolve: @escaping RCTPromiseResolveBlock,
                                        rejecter reject: @escaping RCTPromiseRejectBlock) {

        sendMessageToProvider(type: "removeWhitelist", domain: domain) { error in
            if let error = error {
                reject("VPN_MESSAGE_ERROR", error.localizedDescription, error)
            } else {
                // Also update shared storage
                self.updateSharedWhitelist(remove: domain)
                resolve(nil)
            }
        }
    }

    @objc func updateDNSServer(_ dnsServer: String,
                              resolver resolve: @escaping RCTPromiseResolveBlock,
                              rejecter reject: @escaping RCTPromiseRejectBlock) {

        sendMessageToProvider(type: "updateDNS", dnsServer: dnsServer) { error in
            if let error = error {
                reject("VPN_MESSAGE_ERROR", error.localizedDescription, error)
            } else {
                resolve(nil)
            }
        }
    }

    // MARK: - Private Methods

    private func loadVPNConfiguration(completion: ((Error?) -> Void)? = nil) {
        print("🔄 Loading VPN configuration...")

        NETunnelProviderManager.loadAllFromPreferences { [weak self] managers, error in
            guard let self = self else { return }

            if let error = error {
                print("❌ Error loading VPN configurations: \(error.localizedDescription)")
                completion?(error)
                return
            }

            print("📦 Found \(managers?.count ?? 0) VPN configuration(s)")

            if let manager = managers?.first {
                print("✓ Using existing VPN configuration")
                print("  Description: \(manager.localizedDescription ?? "none")")
                print("  Enabled: \(manager.isEnabled)")
                print("  Provider Bundle ID: \((manager.protocolConfiguration as? NETunnelProviderProtocol)?.providerBundleIdentifier ?? "none")")

                // CRITICAL FIX: Ensure DNS configuration is correct (fix old configs)
                if let providerProtocol = manager.protocolConfiguration as? NETunnelProviderProtocol {
                    let currentDNS = providerProtocol.providerConfiguration?["dnsServer"] as? String ?? ""
                    let expectedDNS = "https://i-dns.wnluo.com/dns-query"

                    if currentDNS != expectedDNS {
                        print("⚠️ DNS configuration mismatch!")
                        print("  Current: \(currentDNS)")
                        print("  Expected: \(expectedDNS)")
                        print("🔧 Updating DNS configuration...")

                        providerProtocol.providerConfiguration = [
                            "dnsServer": expectedDNS
                        ]
                        manager.protocolConfiguration = providerProtocol

                        manager.saveToPreferences { error in
                            if let error = error {
                                print("❌ Failed to update DNS configuration: \(error.localizedDescription)")
                            } else {
                                print("✅ DNS configuration updated successfully")
                            }
                            self.vpnManager = manager
                            completion?(error)
                        }
                        return
                    }
                }

                self.vpnManager = manager
                completion?(nil)
            } else {
                // Create new VPN configuration
                print("⚠️ No existing VPN configuration, creating new one...")
                self.createVPNConfiguration(completion: completion)
            }
        }
    }

    private func createVPNConfiguration(completion: ((Error?) -> Void)? = nil) {
        print("🆕 Creating new VPN configuration...")

        let manager = NETunnelProviderManager()
        manager.localizedDescription = "iDNS Family Protection"

        let providerProtocol = NETunnelProviderProtocol()
        providerProtocol.providerBundleIdentifier = "com.idns.wnlluo.DNSPacketTunnelProvider"
        providerProtocol.serverAddress = "iDNS VPN"
        providerProtocol.providerConfiguration = [
            "dnsServer": "https://i-dns.wnluo.com/dns-query" // I-DNS DoH
        ]

        manager.protocolConfiguration = providerProtocol
        manager.isEnabled = true

        print("  Description: \(manager.localizedDescription ?? "none")")
        print("  Provider Bundle ID: \(providerProtocol.providerBundleIdentifier)")
        print("  Server Address: \(providerProtocol.serverAddress ?? "none")")
        print("  DNS Server: \(providerProtocol.providerConfiguration?["dnsServer"] ?? "none")")
        print("💾 Saving VPN configuration...")

        manager.saveToPreferences { error in
            if let error = error {
                print("❌ Failed to save VPN configuration: \(error.localizedDescription)")
                completion?(error)
                return
            }

            print("✓ VPN configuration saved")
            print("🔄 Reloading VPN configuration...")

            manager.loadFromPreferences { error in
                if let error = error {
                    print("❌ Failed to reload VPN configuration: \(error.localizedDescription)")
                } else {
                    print("✅ VPN configuration created and loaded successfully")
                }
                self.vpnManager = manager
                completion?(error)
            }
        }
    }

    private func observeVPNStatus() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(vpnStatusDidChange),
            name: .NEVPNStatusDidChange,
            object: nil
        )
    }

    @objc private func vpnStatusDidChange() {
        guard let manager = vpnManager else { return }

        let status = manager.connection.status
        let isConnected = status == .connected

        print("========================================")
        print("📡 VPN Status Changed")
        print("Status: \(statusString(status))")
        print("Status Raw Value: \(status.rawValue)")
        print("Is Connected: \(isConnected)")
        print("========================================")

        if hasListeners {
            sendEvent(withName: "VPNStatusChanged", body: isConnected)
        }
    }

    private func statusString(_ status: NEVPNStatus) -> String {
        switch status {
        case .invalid: return "Invalid"
        case .disconnected: return "Disconnected"
        case .connecting: return "Connecting"
        case .connected: return "Connected"
        case .reasserting: return "Reasserting"
        case .disconnecting: return "Disconnecting"
        @unknown default: return "Unknown"
        }
    }

    private func observeDNSEvents() {
        // Observe Darwin notifications from the VPN extension
        let center = CFNotificationCenterGetDarwinNotifyCenter()
        let observer = Unmanaged.passUnretained(self).toOpaque()

        CFNotificationCenterAddObserver(
            center,
            observer,
            { (center, observer, name, object, userInfo) in
                guard let observer = observer else { return }
                let mySelf = Unmanaged<DNSVPNModule>.fromOpaque(observer).takeUnretainedValue()
                mySelf.handleDNSEvent()
            },
            "com.idns.dnsEvent" as CFString,
            nil,
            .deliverImmediately
        )
    }

    private func handleDNSEvent() {
        guard hasListeners else { return }

        // Read DNS events from shared storage
        guard let sharedDefaults = UserDefaults(suiteName: appGroupIdentifier),
              let events = sharedDefaults.array(forKey: "dnsEvents") as? [[String: Any]],
              let lastEvent = events.last else {
            return
        }

        // Send to React Native
        sendEvent(withName: "DNSRequest", body: lastEvent)
    }

    private func sendMessageToProvider(type: String, domain: String? = nil, dnsServer: String? = nil, completion: @escaping (Error?) -> Void) {
        guard let manager = vpnManager,
              let session = manager.connection as? NETunnelProviderSession else {
            completion(NSError(domain: "DNSVPNModule", code: -1, userInfo: [NSLocalizedDescriptionKey: "VPN not connected"]))
            return
        }

        let message: [String: String?] = [
            "type": type,
            "domain": domain,
            "dnsServer": dnsServer
        ]

        guard let messageData = try? JSONEncoder().encode(message) else {
            completion(NSError(domain: "DNSVPNModule", code: -1, userInfo: [NSLocalizedDescriptionKey: "Failed to encode message"]))
            return
        }

        do {
            try session.sendProviderMessage(messageData) { _ in
                completion(nil)
            }
        } catch {
            completion(error)
        }
    }

    private func updateSharedBlacklist(add addDomain: String? = nil, remove removeDomain: String? = nil) {
        guard let sharedDefaults = UserDefaults(suiteName: appGroupIdentifier) else { return }

        var blacklist = sharedDefaults.array(forKey: "blacklist") as? [String] ?? []

        if let domain = addDomain {
            if !blacklist.contains(domain) {
                blacklist.append(domain)
            }
        } else if let domain = removeDomain {
            blacklist.removeAll { $0 == domain }
        }

        sharedDefaults.set(blacklist, forKey: "blacklist")
        // Note: synchronize() is deprecated in iOS 12+. UserDefaults auto-saves.
    }

    private func updateSharedWhitelist(add addDomain: String? = nil, remove removeDomain: String? = nil) {
        guard let sharedDefaults = UserDefaults(suiteName: appGroupIdentifier) else { return }

        var whitelist = sharedDefaults.array(forKey: "whitelist") as? [String] ?? []

        if let domain = addDomain {
            if !whitelist.contains(domain) {
                whitelist.append(domain)
            }
        } else if let domain = removeDomain {
            whitelist.removeAll { $0 == domain }
        }

        sharedDefaults.set(whitelist, forKey: "whitelist")
        // Note: synchronize() is deprecated in iOS 12+. UserDefaults auto-saves.
    }
}
