//
//  DNSParserOptimized.swift
//  DNSCore
//
//  Optimized DNS parser with:
//  - P1-2: Zero-copy parsing using unsafe pointers
//  - Pre-allocated buffers for response construction
//  - Reduced memory allocations
//

import Foundation

// MARK: - DNS Parser Optimized
class DNSParserOptimized {

    // MARK: - Query Parsing (P1-2: Zero-copy)

    /// Parse DNS query with minimal memory allocations
    static func parseQuery(from packet: Data) -> DNSQuery? {
        guard packet.count >= 12 else { return nil }

        return packet.withUnsafeBytes { (bytes: UnsafeRawBufferPointer) -> DNSQuery? in
            guard let baseAddress = bytes.baseAddress else { return nil }

            // Extract transaction ID (zero-copy)
            let transactionID = baseAddress.load(fromByteOffset: 0, as: UInt16.self).bigEndian

            // Extract flags
            let flags = baseAddress.load(fromByteOffset: 2, as: UInt16.self).bigEndian

            // Check if query (QR bit = 0)
            guard (flags & 0x8000) == 0 else { return nil }

            // Extract question count
            let questionCount = baseAddress.load(fromByteOffset: 4, as: UInt16.self).bigEndian
            guard questionCount > 0 else { return nil }

            // Parse domain name (zero-copy)
            var offset = 12
            guard let domain = parseDomainNameZeroCopy(bytes: bytes, offset: &offset) else { return nil }

            // Extract query type
            guard offset + 4 <= packet.count else { return nil }
            let queryTypeValue = baseAddress.load(fromByteOffset: offset, as: UInt16.self).bigEndian
            offset += 2

            // Extract query class
            let queryClass = baseAddress.load(fromByteOffset: offset, as: UInt16.self).bigEndian
            guard queryClass == 1 else { return nil }

            let queryType = DNSQueryType(rawValue: queryTypeValue) ?? .A

            return DNSQuery(domain: domain, packet: packet, queryType: queryType, transactionID: transactionID)
        }
    }

    /// Parse domain name with zero-copy (P1-2)
    private static func parseDomainNameZeroCopy(bytes: UnsafeRawBufferPointer, offset: inout Int) -> String? {
        guard let baseAddress = bytes.baseAddress else { return nil }

        var labels: [String] = []
        var jumped = false
        var maxJumps = 5
        var labelBuffer = [UInt8]()
        labelBuffer.reserveCapacity(63)  // Max label length

        while offset < bytes.count && maxJumps > 0 {
            let length = Int(baseAddress.load(fromByteOffset: offset, as: UInt8.self))

            // Compression pointer
            if (length & 0xC0) == 0xC0 {
                guard offset + 1 < bytes.count else { return nil }
                let byte1 = baseAddress.load(fromByteOffset: offset, as: UInt8.self)
                let byte2 = baseAddress.load(fromByteOffset: offset + 1, as: UInt8.self)
                let pointer = Int(((UInt16(byte1) & 0x3F) << 8) | UInt16(byte2))

                if !jumped {
                    offset += 2
                    jumped = true
                }

                var pointerOffset = pointer
                guard let remainingLabels = parseDomainNameZeroCopy(bytes: bytes, offset: &pointerOffset) else { return nil }
                labels.append(remainingLabels)
                maxJumps -= 1
                break
            }

            // End of domain
            if length == 0 {
                offset += 1
                break
            }

            // Read label (zero-copy using unsafe pointer)
            offset += 1
            guard offset + length <= bytes.count else { return nil }

            // Copy bytes to buffer
            labelBuffer.removeAll(keepingCapacity: true)
            for i in 0..<length {
                labelBuffer.append(baseAddress.load(fromByteOffset: offset + i, as: UInt8.self))
            }

            guard let label = String(bytes: labelBuffer, encoding: .utf8) else { return nil }
            labels.append(label)
            offset += length
        }

        return labels.isEmpty ? nil : labels.joined(separator: ".")
    }

    // MARK: - Response Parsing (P1-2: Optimized)

    static func parseResponse(from packet: Data) -> DNSResponse? {
        guard packet.count >= 12 else { return nil }

        return packet.withUnsafeBytes { (bytes: UnsafeRawBufferPointer) -> DNSResponse? in
            guard let baseAddress = bytes.baseAddress else { return nil }

            // Extract flags
            let flags = baseAddress.load(fromByteOffset: 2, as: UInt16.self).bigEndian
            guard (flags & 0x8000) != 0 else { return nil }

            // Extract response code
            let rcode = UInt8(flags & 0x000F)
            let responseCode = DNSResponseCode(rawValue: rcode) ?? .serverFailure

            // Extract answer count
            let answerCount = Int(baseAddress.load(fromByteOffset: 6, as: UInt16.self).bigEndian)

            var ttl: TimeInterval = 300
            var addresses: [String] = []

            if answerCount > 0 {
                var offset = 12

                // Skip question section
                let questionCount = Int(baseAddress.load(fromByteOffset: 4, as: UInt16.self).bigEndian)
                for _ in 0..<questionCount {
                    guard let _ = parseDomainNameZeroCopy(bytes: bytes, offset: &offset) else { break }
                    offset += 4
                }

                // Parse answer section
                addresses.reserveCapacity(answerCount)

                for _ in 0..<answerCount {
                    guard let _ = parseDomainNameZeroCopy(bytes: bytes, offset: &offset) else { break }
                    guard offset + 10 <= packet.count else { break }

                    let recordType = baseAddress.load(fromByteOffset: offset, as: UInt16.self).bigEndian
                    offset += 4  // TYPE + CLASS

                    let recordTTL = baseAddress.load(fromByteOffset: offset, as: UInt32.self).bigEndian
                    ttl = min(TimeInterval(recordTTL), 3600)
                    offset += 4  // TTL

                    let dataLength = Int(baseAddress.load(fromByteOffset: offset, as: UInt16.self).bigEndian)
                    offset += 2  // RDLENGTH

                    guard offset + dataLength <= packet.count else { break }

                    // Parse A record (IPv4) - zero-copy
                    if recordType == 1 && dataLength == 4 {
                        let ip1 = baseAddress.load(fromByteOffset: offset, as: UInt8.self)
                        let ip2 = baseAddress.load(fromByteOffset: offset + 1, as: UInt8.self)
                        let ip3 = baseAddress.load(fromByteOffset: offset + 2, as: UInt8.self)
                        let ip4 = baseAddress.load(fromByteOffset: offset + 3, as: UInt8.self)

                        // Pre-allocate string capacity
                        var address = ""
                        address.reserveCapacity(15)  // Max "255.255.255.255"
                        address.append("\(ip1).\(ip2).\(ip3).\(ip4)")
                        addresses.append(address)
                    }
                    // Parse AAAA record (IPv6) - optimized
                    else if recordType == 28 && dataLength == 16 {
                        var address = ""
                        address.reserveCapacity(39)  // Max IPv6 length

                        for i in stride(from: 0, to: 16, by: 2) {
                            let byte1 = baseAddress.load(fromByteOffset: offset + i, as: UInt8.self)
                            let byte2 = baseAddress.load(fromByteOffset: offset + i + 1, as: UInt8.self)
                            let part = UInt16(byte1) << 8 | UInt16(byte2)

                            if i > 0 { address.append(":") }
                            address.append(String(part, radix: 16))
                        }

                        addresses.append(address)
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
    }

    // MARK: - Response Construction (P1-2: Pre-allocated buffers)

    /// Create DNS response with pre-allocated buffer
    static func createResponse(for query: DNSQuery, addresses: [String], ttl: UInt32 = 300) -> Data {
        // Pre-calculate response size
        var estimatedSize = query.packet.count  // Header + question
        for address in addresses {
            estimatedSize += 12  // Name pointer + type + class + ttl + rdlength
            estimatedSize += address.contains(":") ? 16 : 4  // IPv6 or IPv4
        }

        var response = Data(capacity: estimatedSize)

        // Build header
        var header = Data(count: 12)
        header[0] = UInt8((query.transactionID >> 8) & 0xFF)
        header[1] = UInt8(query.transactionID & 0xFF)
        header[2] = 0x81
        header[3] = 0x80
        header[4] = 0x00
        header[5] = 0x01

        let answerCount = UInt16(addresses.count)
        header[6] = UInt8((answerCount >> 8) & 0xFF)
        header[7] = UInt8(answerCount & 0xFF)
        header[8] = 0x00
        header[9] = 0x00
        header[10] = 0x00
        header[11] = 0x00

        response.append(header)

        // Copy question section
        let questionData = query.packet.dropFirst(12)
        response.append(questionData)

        // Add answer records (optimized)
        for address in addresses {
            response.append(contentsOf: [0xC0, 0x0C])  // Compression pointer

            // Type
            if address.contains(":") {
                response.append(contentsOf: [0x00, 0x1C])  // AAAA
            } else {
                response.append(contentsOf: [0x00, 0x01])  // A
            }

            // Class + TTL
            response.append(contentsOf: [0x00, 0x01])  // IN class
            response.append(UInt8((ttl >> 24) & 0xFF))
            response.append(UInt8((ttl >> 16) & 0xFF))
            response.append(UInt8((ttl >> 8) & 0xFF))
            response.append(UInt8(ttl & 0xFF))

            // RDLENGTH + RDATA
            if address.contains(":") {
                // IPv6
                response.append(contentsOf: [0x00, 0x10])
                let parts = address.split(separator: ":").map { UInt16($0, radix: 16) ?? 0 }
                for part in parts {
                    response.append(UInt8((part >> 8) & 0xFF))
                    response.append(UInt8(part & 0xFF))
                }
            } else {
                // IPv4
                response.append(contentsOf: [0x00, 0x04])
                let parts = address.split(separator: ".").compactMap { UInt8($0) }
                response.append(contentsOf: parts)
            }
        }

        return response
    }

    /// Create NXDOMAIN response (optimized, in-place modification)
    static func createBlockResponse(for query: DNSQuery) -> Data {
        var response = Data(query.packet)

        response[2] = 0x81
        response[3] = 0x83  // NXDOMAIN
        response[6] = 0x00
        response[7] = 0x00

        return response
    }

    /// Create SERVFAIL response (optimized, in-place modification)
    static func createServfailResponse(for query: DNSQuery) -> Data {
        var response = Data(query.packet)

        response[2] = 0x81
        response[3] = 0x82  // SERVFAIL
        response[6] = 0x00
        response[7] = 0x00

        return response
    }

    /// Create empty response (optimized, in-place modification)
    static func createEmptyResponse(for query: DNSQuery) -> Data {
        var response = Data(query.packet)

        response[2] = 0x81
        response[3] = 0x80  // NOERROR
        response[6] = 0x00
        response[7] = 0x00

        return response
    }
}
