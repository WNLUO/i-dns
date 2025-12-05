//
//  DNSParser.swift
//  DNSCore
//
//  DNS packet parsing and construction utilities
//

import Foundation

// MARK: - DNS Query Types
enum DNSQueryType: UInt16 {
    case A = 1          // IPv4 address
    case AAAA = 28      // IPv6 address
    case HTTPS = 65     // HTTPS record
    case CNAME = 5      // Canonical name
    case MX = 15        // Mail exchange
    case TXT = 16       // Text record
    case NS = 2         // Name server
    case SOA = 6        // Start of authority

    var description: String {
        switch self {
        case .A: return "A"
        case .AAAA: return "AAAA"
        case .HTTPS: return "HTTPS"
        case .CNAME: return "CNAME"
        case .MX: return "MX"
        case .TXT: return "TXT"
        case .NS: return "NS"
        case .SOA: return "SOA"
        }
    }
}

// MARK: - DNS Response Codes
enum DNSResponseCode: UInt8 {
    case noError = 0        // NOERROR - successful query
    case formatError = 1    // FORMERR - format error
    case serverFailure = 2  // SERVFAIL - server failure
    case nameError = 3      // NXDOMAIN - domain does not exist
    case notImplemented = 4 // NOTIMP - not implemented
    case refused = 5        // REFUSED - query refused

    var description: String {
        switch self {
        case .noError: return "NOERROR"
        case .formatError: return "FORMERR"
        case .serverFailure: return "SERVFAIL"
        case .nameError: return "NXDOMAIN"
        case .notImplemented: return "NOTIMP"
        case .refused: return "REFUSED"
        }
    }
}

// MARK: - DNS Query Structure
struct DNSQuery {
    let domain: String
    let packet: Data
    let queryType: DNSQueryType
    let transactionID: UInt16

    init?(domain: String, packet: Data, queryType: DNSQueryType, transactionID: UInt16) {
        guard !domain.isEmpty else { return nil }
        self.domain = domain
        self.packet = packet
        self.queryType = queryType
        self.transactionID = transactionID
    }
}

// MARK: - DNS Response Structure
struct DNSResponse {
    let packet: Data
    let addresses: [String]
    let ttl: TimeInterval
    let responseCode: DNSResponseCode
    let answerCount: Int

    var isSuccess: Bool {
        return responseCode == .noError && answerCount > 0
    }

    var isEmpty: Bool {
        return responseCode == .noError && answerCount == 0
    }
}

// MARK: - DNS Parser
class DNSParser {

    // MARK: - Query Parsing

    /// Parse DNS query from packet data
    /// - Parameter packet: UDP payload containing DNS query
    /// - Returns: DNSQuery object or nil if parsing fails
    static func parseQuery(from packet: Data) -> DNSQuery? {
        guard packet.count >= 12 else { return nil }

        // Extract transaction ID (first 2 bytes)
        let transactionID = packet.withUnsafeBytes { $0.load(fromByteOffset: 0, as: UInt16.self) }.bigEndian

        // Extract flags (bytes 2-3)
        let flags = packet.withUnsafeBytes { $0.load(fromByteOffset: 2, as: UInt16.self) }.bigEndian

        // Check if it's a query (QR bit = 0)
        guard (flags & 0x8000) == 0 else { return nil }

        // Extract question count (bytes 4-5)
        let questionCount = packet.withUnsafeBytes { $0.load(fromByteOffset: 4, as: UInt16.self) }.bigEndian
        guard questionCount > 0 else { return nil }

        // Parse domain name (starts at byte 12)
        var offset = 12
        guard let domain = parseDomainName(from: packet, offset: &offset) else { return nil }

        // Extract query type (2 bytes after domain name)
        guard offset + 4 <= packet.count else { return nil }
        let queryTypeValue = packet.withUnsafeBytes { $0.load(fromByteOffset: offset, as: UInt16.self) }.bigEndian
        offset += 2

        // Extract query class (should be 1 for IN - Internet)
        let queryClass = packet.withUnsafeBytes { $0.load(fromByteOffset: offset, as: UInt16.self) }.bigEndian
        guard queryClass == 1 else { return nil }

        let queryType = DNSQueryType(rawValue: queryTypeValue) ?? .A

        return DNSQuery(domain: domain, packet: packet, queryType: queryType, transactionID: transactionID)
    }

    /// Parse domain name from DNS packet
    /// - Parameters:
    ///   - packet: DNS packet data
    ///   - offset: Current offset in packet (will be updated)
    /// - Returns: Domain name string or nil if parsing fails
    static func parseDomainName(from packet: Data, offset: inout Int) -> String? {
        var labels: [String] = []
        var jumped = false
        var maxJumps = 5  // Prevent infinite loops

        while offset < packet.count && maxJumps > 0 {
            let length = Int(packet[offset])

            // Check for compression pointer (top 2 bits set)
            if (length & 0xC0) == 0xC0 {
                guard offset + 1 < packet.count else { return nil }
                let pointer = Int(((UInt16(packet[offset]) & 0x3F) << 8) | UInt16(packet[offset + 1]))
                if !jumped {
                    offset += 2  // Only advance offset on first jump
                    jumped = true
                }
                var pointerOffset = pointer
                guard let remainingLabels = parseDomainName(from: packet, offset: &pointerOffset) else { return nil }
                labels.append(remainingLabels)
                maxJumps -= 1
                break
            }

            // End of domain name
            if length == 0 {
                offset += 1
                break
            }

            // Read label
            offset += 1
            guard offset + length <= packet.count else { return nil }
            let labelData = packet.subdata(in: offset..<offset + length)
            guard let label = String(data: labelData, encoding: .utf8) else { return nil }
            labels.append(label)
            offset += length
        }

        return labels.isEmpty ? nil : labels.joined(separator: ".")
    }

    // MARK: - Response Parsing

    /// Parse DNS response packet
    /// - Parameter packet: DNS response data
    /// - Returns: DNSResponse object or nil if parsing fails
    static func parseResponse(from packet: Data) -> DNSResponse? {
        guard packet.count >= 12 else { return nil }

        // Extract flags (bytes 2-3)
        let flags = packet.withUnsafeBytes { $0.load(fromByteOffset: 2, as: UInt16.self) }.bigEndian

        // Check if it's a response (QR bit = 1)
        guard (flags & 0x8000) != 0 else { return nil }

        // Extract response code (last 4 bits of flags)
        let rcode = UInt8(flags & 0x000F)
        let responseCode = DNSResponseCode(rawValue: rcode) ?? .serverFailure

        // Extract answer count (bytes 6-7)
        let answerCount = Int(packet.withUnsafeBytes { $0.load(fromByteOffset: 6, as: UInt16.self) }.bigEndian)

        // Extract TTL and addresses from answer section
        var ttl: TimeInterval = 300  // Default 5 minutes
        var addresses: [String] = []

        if answerCount > 0 {
            var offset = 12

            // Skip question section
            let questionCount = Int(packet.withUnsafeBytes { $0.load(fromByteOffset: 4, as: UInt16.self) }.bigEndian)
            for _ in 0..<questionCount {
                guard let _ = parseDomainName(from: packet, offset: &offset) else { break }
                offset += 4  // Skip QTYPE and QCLASS
            }

            // Parse answer section
            for _ in 0..<answerCount {
                guard let _ = parseDomainName(from: packet, offset: &offset) else { break }
                guard offset + 10 <= packet.count else { break }

                let recordType = packet.withUnsafeBytes { $0.load(fromByteOffset: offset, as: UInt16.self) }.bigEndian
                offset += 2  // TYPE
                offset += 2  // CLASS

                let recordTTL = packet.withUnsafeBytes { $0.load(fromByteOffset: offset, as: UInt32.self) }.bigEndian
                ttl = min(TimeInterval(recordTTL), 3600)  // Cap at 1 hour
                offset += 4  // TTL

                let dataLength = Int(packet.withUnsafeBytes { $0.load(fromByteOffset: offset, as: UInt16.self) }.bigEndian)
                offset += 2  // RDLENGTH

                guard offset + dataLength <= packet.count else { break }

                // Parse A record (IPv4)
                if recordType == 1 && dataLength == 4 {
                    let ip = packet.subdata(in: offset..<offset + 4)
                    let address = ip.map { String($0) }.joined(separator: ".")
                    addresses.append(address)
                }
                // Parse AAAA record (IPv6)
                else if recordType == 28 && dataLength == 16 {
                    let ip = packet.subdata(in: offset..<offset + 16)
                    var addressParts: [String] = []
                    for i in stride(from: 0, to: 16, by: 2) {
                        let part = UInt16(ip[i]) << 8 | UInt16(ip[i + 1])
                        addressParts.append(String(format: "%x", part))
                    }
                    addresses.append(addressParts.joined(separator: ":"))
                }

                offset += dataLength
            }
        }

        return DNSResponse(
            packet: packet,
            addresses: addresses,
            ttl: ttl,
            responseCode: responseCode,
            answerCount: answerCount
        )
    }

    // MARK: - Response Construction

    /// Create DNS response packet with given IP addresses
    /// - Parameters:
    ///   - query: Original DNS query
    ///   - addresses: IP addresses to include in response
    ///   - ttl: Time-to-live value
    /// - Returns: Complete DNS response packet
    static func createResponse(for query: DNSQuery, addresses: [String], ttl: UInt32 = 300) -> Data {
        var response = Data()

        // Copy transaction ID and question section from original query
        let questionSection = query.packet.prefix(query.packet.count)

        // Build response header
        var header = Data(count: 12)

        // Transaction ID (bytes 0-1)
        header[0] = UInt8((query.transactionID >> 8) & 0xFF)
        header[1] = UInt8(query.transactionID & 0xFF)

        // Flags (bytes 2-3): Response, Recursion Available
        header[2] = 0x81  // QR=1, Opcode=0, AA=0, TC=0, RD=1
        header[3] = 0x80  // RA=1, Z=0, RCODE=0

        // Question count (bytes 4-5)
        header[4] = 0x00
        header[5] = 0x01

        // Answer count (bytes 6-7)
        let answerCount = UInt16(addresses.count)
        header[6] = UInt8((answerCount >> 8) & 0xFF)
        header[7] = UInt8(answerCount & 0xFF)

        // Authority and Additional counts (bytes 8-11) = 0
        header[8] = 0x00
        header[9] = 0x00
        header[10] = 0x00
        header[11] = 0x00

        response.append(header)

        // Copy question section (skip first 12 bytes of header from query)
        let questionData = query.packet.dropFirst(12)
        response.append(questionData)

        // Add answer records
        for address in addresses {
            // Add pointer to domain name (compression)
            response.append(contentsOf: [0xC0, 0x0C])  // Pointer to offset 12

            // Type (A or AAAA)
            if address.contains(":") {
                // AAAA record (IPv6)
                response.append(contentsOf: [0x00, 0x1C])
            } else {
                // A record (IPv4)
                response.append(contentsOf: [0x00, 0x01])
            }

            // Class (IN)
            response.append(contentsOf: [0x00, 0x01])

            // TTL (4 bytes)
            response.append(UInt8((ttl >> 24) & 0xFF))
            response.append(UInt8((ttl >> 16) & 0xFF))
            response.append(UInt8((ttl >> 8) & 0xFF))
            response.append(UInt8(ttl & 0xFF))

            // RDLENGTH and RDATA
            if address.contains(":") {
                // IPv6: 16 bytes
                response.append(contentsOf: [0x00, 0x10])
                let parts = address.split(separator: ":").map { UInt16($0, radix: 16) ?? 0 }
                for part in parts {
                    response.append(UInt8((part >> 8) & 0xFF))
                    response.append(UInt8(part & 0xFF))
                }
            } else {
                // IPv4: 4 bytes
                response.append(contentsOf: [0x00, 0x04])
                let parts = address.split(separator: ".").compactMap { UInt8($0) }
                response.append(contentsOf: parts)
            }
        }

        return response
    }

    /// Create NXDOMAIN response (domain blocked)
    /// - Parameter query: Original DNS query
    /// - Returns: DNS response packet with NXDOMAIN error
    static func createBlockResponse(for query: DNSQuery) -> Data {
        var response = Data(query.packet)

        // Set flags: Response, NXDOMAIN (RCODE=3)
        response[2] = 0x81  // QR=1, Opcode=0, AA=0, TC=0, RD=1
        response[3] = 0x83  // RA=1, Z=0, RCODE=3 (NXDOMAIN)

        // Answer count = 0
        response[6] = 0x00
        response[7] = 0x00

        return response
    }

    /// Create SERVFAIL response
    /// - Parameter query: Original DNS query
    /// - Returns: DNS response packet with SERVFAIL error
    static func createServfailResponse(for query: DNSQuery) -> Data {
        var response = Data(query.packet)

        // Set flags: Response, SERVFAIL (RCODE=2)
        response[2] = 0x81  // QR=1, Opcode=0, AA=0, TC=0, RD=1
        response[3] = 0x82  // RA=1, Z=0, RCODE=2 (SERVFAIL)

        // Answer count = 0
        response[6] = 0x00
        response[7] = 0x00

        return response
    }

    /// Create empty response (NOERROR with 0 answers)
    /// - Parameter query: Original DNS query
    /// - Returns: DNS response packet with no answers
    static func createEmptyResponse(for query: DNSQuery) -> Data {
        var response = Data(query.packet)

        // Set flags: Response, NOERROR (RCODE=0)
        response[2] = 0x81  // QR=1, Opcode=0, AA=0, TC=0, RD=1
        response[3] = 0x80  // RA=1, Z=0, RCODE=0 (NOERROR)

        // Answer count = 0
        response[6] = 0x00
        response[7] = 0x00

        return response
    }
}
