/**
 * Fetches domain registration age from RDAP (Registration Data Access Protocol) service.
 *
 * This function queries the RDAP service to retrieve domain registration information
 * and calculates the age of the domain in days from its registration date to today.
 *
 * @param {string} domain - The domain name to check (e.g., "example.com")
 * @returns {Promise<number>} The domain age in days, or -1 if the domain cannot be found or on error
 *
 * @example
 * const age = await getDomainAge("google.com");
 * if (age > 0) {
 *   console.log(`Domain is ${age} days old`);
 * } else {
 *   console.log("Domain age could not be determined");
 * }
 */
export async function getDomainAge(domain) {
  try {
    const response = await fetch(`https://rdap.org/domain/${domain}`);

    // Return -1 for non-200 responses (404, 500, etc.)
    if (!response.ok) {
      return -1;
    }

    const data = await response.json();

    // Validate response structure
    if (!data || !Array.isArray(data.events)) {
      return -1;
    }

    // Find the registration event
    const registrationEvent = data.events.find(
      (event) => event.eventAction === 'registration'
    );

    if (!registrationEvent || !registrationEvent.eventDate) {
      return -1;
    }

    // Parse registration date
    const registrationDate = new Date(registrationEvent.eventDate);

    // Validate date parsing
    if (isNaN(registrationDate.getTime())) {
      return -1;
    }

    // Calculate age in days
    const today = new Date();
    const ageInMilliseconds = today - registrationDate;
    const ageInDays = Math.floor(ageInMilliseconds / (1000 * 60 * 60 * 24));

    return ageInDays;
  } catch (error) {
    // Handle network errors, JSON parsing errors, or any other exceptions
    return -1;
  }
}
