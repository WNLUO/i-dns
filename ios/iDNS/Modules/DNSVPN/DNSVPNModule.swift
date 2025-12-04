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
    private let appGroupIdentifier = "group.org.reactjs.native.example.iDNS"

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

        loadVPNConfiguration { [weak self] error in
            if let error = error {
                reject("VPN_CONFIG_ERROR", "Failed to load VPN configuration: \(error.localizedDescription)", error)
                return
            }

            guard let self = self, let manager = self.vpnManager else {
                reject("VPN_MANAGER_ERROR", "VPN manager not initialized", nil)
                return
            }

            do {
                try manager.connection.startVPNTunnel()
                resolve(true)
            } catch {
                reject("VPN_START_ERROR", "Failed to start VPN: \(error.localizedDescription)", error)
            }
        }
    }

    @objc func stopVPN(_ resolve: @escaping RCTPromiseResolveBlock,
                      rejecter reject: @escaping RCTPromiseRejectBlock) {

        guard let manager = vpnManager else {
            reject("VPN_MANAGER_ERROR", "VPN manager not initialized", nil)
            return
        }

        manager.connection.stopVPNTunnel()
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
        NETunnelProviderManager.loadAllFromPreferences { [weak self] managers, error in
            guard let self = self else { return }

            if let error = error {
                completion?(error)
                return
            }

            if let manager = managers?.first {
                self.vpnManager = manager
                completion?(nil)
            } else {
                // Create new VPN configuration
                self.createVPNConfiguration(completion: completion)
            }
        }
    }

    private func createVPNConfiguration(completion: ((Error?) -> Void)? = nil) {
        let manager = NETunnelProviderManager()
        manager.localizedDescription = "iDNS Family Protection"

        let providerProtocol = NETunnelProviderProtocol()
        providerProtocol.providerBundleIdentifier = "org.reactjs.native.example.iDNS.DNSPacketTunnelProvider"
        providerProtocol.serverAddress = "iDNS VPN"
        providerProtocol.providerConfiguration = [
            "dnsServer": "94.140.14.14" // AdGuard DNS Family Protection
        ]

        manager.protocolConfiguration = providerProtocol
        manager.isEnabled = true

        manager.saveToPreferences { error in
            if let error = error {
                completion?(error)
                return
            }

            manager.loadFromPreferences { error in
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
        guard let manager = vpnManager, hasListeners else { return }

        let isConnected = manager.connection.status == .connected
        sendEvent(withName: "VPNStatusChanged", body: isConnected)
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

    private func updateSharedBlacklist(add domain: String? = nil, remove: String? = nil) {
        guard let sharedDefaults = UserDefaults(suiteName: appGroupIdentifier) else { return }

        var blacklist = sharedDefaults.array(forKey: "blacklist") as? [String] ?? []

        if let domain = add {
            if !blacklist.contains(domain) {
                blacklist.append(domain)
            }
        } else if let domain = remove {
            blacklist.removeAll { $0 == domain }
        }

        sharedDefaults.set(blacklist, forKey: "blacklist")
        sharedDefaults.synchronize()
    }

    private func updateSharedWhitelist(add domain: String? = nil, remove: String? = nil) {
        guard let sharedDefaults = UserDefaults(suiteName: appGroupIdentifier) else { return }

        var whitelist = sharedDefaults.array(forKey: "whitelist") as? [String] ?? []

        if let domain = add {
            if !whitelist.contains(domain) {
                whitelist.append(domain)
            }
        } else if let domain = remove {
            whitelist.removeAll { $0 == domain }
        }

        sharedDefaults.set(whitelist, forKey: "whitelist")
        sharedDefaults.synchronize()
    }
}
