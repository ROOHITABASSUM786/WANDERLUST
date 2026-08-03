if (typeof listing !== "undefined" && listing && listing.geometry && listing.geometry.coordinates && listing.geometry.coordinates.length === 2) {
    // GeoJSON format in MongoDB stores coordinates as [longitude, latitude]
    // Leaflet requires [latitude, longitude], so we extract longitude (index 0) and latitude (index 1):
    const lng = listing.geometry.coordinates[0];
    const lat = listing.geometry.coordinates[1];

    // Initialize Leaflet map centered at [lat, lng] with zoom level 9
    const map = L.map('map').setView([lat, lng], 9);

    // Add OpenStreetMap free tile layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Add marker at listing location with popup
    L.marker([lat, lng]).addTo(map)
        .bindPopup(`<h4>${listing.location}</h4><p>Exact location provided after booking</p>`)
        .openPopup();
}