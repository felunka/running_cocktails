// NFC handler with a static writeTag method that shortens a URL via POST
// to https://short.felunka.de/shorten and writes the resulting short URL
// to an NFC tag using the Web NFC API.

export default class NFCHandler {
  // Returns true if the current browser environment appears to support
  // writing NFC tags via the Web NFC API.
  // This checks for the presence of NDEFWriter and a permissive
  // Permission API (optional). It deliberately returns a boolean and
  // does not request permissions.
  static isWriteSupported() {
    try {
      // Basic check: NDEFWriter must exist
      if (typeof window === 'undefined' || !('NDEFReader' in window)) return false

      // If Permissions API exists, we can check for 'nfc' permission name
      // Some browsers may not implement 'nfc' in Permissions; this is optional.
      if (navigator && typeof navigator.permissions !== 'undefined' && typeof navigator.permissions.query === 'function') {
        // We can't synchronously determine the permission state without an async call,
        // so we simply return true here because NDEFWriter exists. Consumers who need
        // to know the permission state should call the Permissions API themselves.
        return true
      }

      return true
    } catch (e) {
      return false
    }
  }
  // Attempts to shorten the provided `longUrl` and write the resulting
  // short URL to an NFC tag. Returns a Promise that resolves when the
  // write completes, or rejects with an Error.
  static async writeTag(longUrl) {
    if (typeof longUrl !== 'string' || !longUrl) {
      throw new TypeError('longUrl must be a non-empty string')
    }

    // Shorten the URL via the provided API
    const shortenEndpoint = 'https://short.felunka.de/shorten'

    let shortCode
    try {
      const resp = await fetch(shortenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: longUrl }),
      })

      if (!resp.ok) {
        const bodyText = await resp.text().catch(() => '')
        throw new Error(`Shortener returned ${resp.status}: ${bodyText}`)
      }

      const data = await resp.json()
      if (!data || typeof data.short_url !== 'string') {
        throw new Error('Shortener response missing short_url')
      }

      shortCode = data.short_url
      if (!shortCode) throw new Error('Empty short code received')
    } catch (err) {
      throw new Error(`Failed to shorten URL: ${err.message}`)
    }

    const urlToWrite = `https://short.felunka.de/${shortCode}`

    // Feature detect Web NFC
    if (!('NDEFReader' in window)) {
      throw new Error('Web NFC not supported in this browser')
    }

    try {
      const ndef = new NDEFReader()
      // request permission and write
      await ndef.write({
        records: [{ recordType: "url", data: urlToWrite }],
      });
      return { success: true, written: urlToWrite }
    } catch (err) {
      throw new Error(`Failed to write NFC tag: ${err.message}`)
    }
  }
}
