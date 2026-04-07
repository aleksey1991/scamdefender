/**
 * Extracts the bare domain from a URL.
 * Strips protocol, www prefix, and path/query/fragment.
 *
 * @param {string} url - The URL to extract the domain from
 * @returns {string} The bare domain (e.g., 'example.com')
 *
 * @example
 * extractDomain('https://www.example.com/path?q=1') // Returns 'example.com'
 * extractDomain('http://subdomain.example.com') // Returns 'subdomain.example.com'
 */
export function extractDomain(url) {
  try {
    // Parse the URL to extract hostname
    const urlObj = new URL(url);
    let hostname = urlObj.hostname;

    // Remove 'www.' prefix if present
    if (hostname.startsWith('www.')) {
      hostname = hostname.substring(4);
    }

    return hostname;
  } catch (error) {
    // If URL parsing fails, return empty string
    return '';
  }
}

/**
 * Determines if a URL should be checked for scam detection.
 * Excludes internal browser pages, local resources, and IP addresses.
 *
 * @param {string} url - The URL to check
 * @returns {boolean} True if the URL should be checked, false otherwise
 *
 * @example
 * isCheckableUrl('https://example.com') // Returns true
 * isCheckableUrl('chrome://settings') // Returns false
 * isCheckableUrl('http://localhost:3000') // Returns false
 */
export function isCheckableUrl(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }

  // Check for excluded protocols
  const excludedProtocols = [
    'chrome://',
    'chrome-extension://',
    'about:',
    'file://',
  ];

  for (const protocol of excludedProtocols) {
    if (url.startsWith(protocol)) {
      return false;
    }
  }

  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;

    // Check for localhost
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return false;
    }

    // Check for IP addresses (IPv4 pattern)
    const ipv4Pattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipv4Pattern.test(hostname)) {
      return false;
    }

    // Check for IPv6 addresses (simplified check - they contain colons)
    if (hostname.includes(':') || hostname.startsWith('[')) {
      return false;
    }

    return true;
  } catch (error) {
    // If URL parsing fails, don't check it
    return false;
  }
}

/**
 * Checks if a URL uses the HTTPS protocol.
 *
 * @param {string} url - The URL to check
 * @returns {boolean} True if the URL starts with 'https://', false otherwise
 *
 * @example
 * isHttps('https://example.com') // Returns true
 * isHttps('http://example.com') // Returns false
 * isHttps('ftp://example.com') // Returns false
 */
export function isHttps(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }

  return url.startsWith('https://');
}
