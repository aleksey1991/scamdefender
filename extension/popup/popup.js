document.addEventListener('DOMContentLoaded', async () => {
    const statusDiv = document.getElementById('status');
    const scoreDiv = document.getElementById('score');

    try {
        // Query the active tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (tab && tab.url) {
            console.log('Current tab URL:', tab.url);

            // Extract domain name from URL
            const url = new URL(tab.url);
            const domain = url.hostname;

            // Display the domain name in the status div
            statusDiv.textContent = `Analyzing: ${domain}`;

            // Show placeholder score
            scoreDiv.textContent = 'Risk Score: 0';
        } else {
            statusDiv.textContent = 'No active tab found';
            scoreDiv.textContent = 'Risk Score: 0';
        }
    } catch (error) {
        console.error('Error:', error);
        statusDiv.textContent = 'Error loading page info';
        scoreDiv.textContent = 'Risk Score: 0';
    }
});
