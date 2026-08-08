// Select elements from HTML
const logForm = document.getElementById('logForm');
const logList = document.getElementById('logList');

// Load existing logs when the page opens
document.addEventListener('DOMContentLoaded', displayLogs);

logForm.addEventListener('submit', function(event) {
    event.preventDefault(); // Stop page from refreshing

    // Grab values from form inputs
    const vessel = document.getElementById('vessel').value;
    const destination = document.getElementById('destination').value;
    const hours = document.getElementById('hours').value;

    const newLog = {
        id: Date.now(),
        vessel,
        destination,
        hours,
        date: new Date().toLocaleDateString()
    };

    // Save to localStorage
    const savedLogs = JSON.parse(localStorage.getItem('sailing_logs') || '[]');
    savedLogs.push(newLog);
    localStorage.setItem('sailing_logs', JSON.stringify(savedLogs));

    // Reset form and refresh display
    logForm.reset();
    displayLogs();
});

function displayLogs() {
    logList.innerHTML = '';
    const savedLogs = JSON.parse(localStorage.getItem('sailing_logs') || '[]');

    if (savedLogs.length === 0) {
        logList.innerHTML = '<li>No logs recorded yet.</li>';
        return;
    }

    savedLogs.forEach(log => {
        const li = document.createElement('li');
        li.textContent = `${log.date}: ${log.vessel} to ${log.destination} (${log.hours} hrs)`;
        logList.appendChild(li);
    });
}