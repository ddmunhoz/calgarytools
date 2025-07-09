document.addEventListener('DOMContentLoaded', function() {
    console.log("DOM Loaded. Initializing application.");
    // --- DOM Elements ---
    const searchForm = document.getElementById('search-form');
    const searchInput = document.getElementById('searchInput');
    const dropdown = document.getElementById('locationDropdown');
    const slideImg = document.getElementById('slide');
    const addFavoriteBtn = document.getElementById('add-favorite-btn');
    const toggleFavoritesBtn = document.getElementById('toggle-favorites-btn');
    const favoritesContainer = document.getElementById('favorites-container');
    const favoritesList = document.getElementById('favorites-list');
    const cycleFavoritesBtn = document.getElementById('cycle-favorites-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const settingsSaveBtn = document.getElementById('settings-save');
    const settingsCancelBtn = document.getElementById('settings-cancel');
    const cycleIntervalInput = document.getElementById('cycle-interval-input');
    const forceRefreshBtn = document.getElementById('force-refresh-btn');
    const shareBtn = document.getElementById('share-btn');

    // --- State Variables ---
    const images = ["9", "8", "7", "6", "5", "4", "3", "2", "1", "0"];
    let i = 0;
    let currentLocation = null;
    let map;
    const markerObjects = {};
    const cameraDataMap = new Map();
    let favorites = [];
    let favoritesVisible = false;
    let cycleIntervalId = null;
    let currentFavoriteIndex = 0;
    let cycleSpeed = 5;

    // --- Helper Functions ---
    function getLocId(url) {
        if (!url) return '';
        const match = url.match(/\/([^\/]+)\.jpg$/i);
        return match ? match[1].toLowerCase() : '';
    }

    // --- Settings Functions ---
    function loadSettings() {
        const storedSpeed = localStorage.getItem('cycleSpeed');
        if (storedSpeed) {
            cycleSpeed = parseInt(storedSpeed, 10);
            console.log(`Loaded cycle speed from localStorage: ${cycleSpeed}s`);
        }
        cycleIntervalInput.value = cycleSpeed;
    }

    function saveSettings() {
        const newSpeed = parseInt(cycleIntervalInput.value, 10);
        if (newSpeed && newSpeed > 0) {
            cycleSpeed = newSpeed;
            localStorage.setItem('cycleSpeed', cycleSpeed);
            console.log(`Settings saved. New cycle speed: ${cycleSpeed}s`);
            settingsModal.style.display = 'none';
            if (cycleIntervalId) {
                console.log("Restarting cycle with new speed.");
                stopCycle();
                startCycle();
            }
        } else {
            alert('Please enter a valid number greater than 0.');
        }
    }

    function forceRefreshData() {
        console.log("Forcing cache drop and data refresh.");
        localStorage.removeItem(CACHE_KEY_DATA);
        localStorage.removeItem(CACHE_KEY_TIMESTAMP);
        settingsModal.style.display = 'none';
        alert("Cache has been cleared. Refreshing page to fetch new data.");
        location.reload();
    }

    // --- Favorites Functions ---
    function loadFavorites() {
        const storedFavorites = localStorage.getItem('calgaryCameraFavorites');
        if (storedFavorites) {
            favorites = JSON.parse(storedFavorites);
            console.log(`Loaded ${favorites.length} favorites from localStorage.`);
        }
    }

    function saveFavorites() {
        localStorage.setItem('calgaryCameraFavorites', JSON.stringify(favorites));
        console.log(`${favorites.length} favorites saved to localStorage.`);
    }

    function renderFavoritesList() {
        favoritesList.innerHTML = '';
        toggleFavoritesBtn.style.display = favorites.length > 0 ? 'inline-block' : 'none';
        cycleFavoritesBtn.style.display = favorites.length > 1 ? 'inline-block' : 'none';

        if (favorites.length > 0) {
            if (favoritesVisible) {
                favoritesContainer.style.display = 'flex';
                toggleFavoritesBtn.textContent = 'Hide Favorites';
            } else {
                favoritesContainer.style.display = 'none';
                toggleFavoritesBtn.textContent = 'Show Favorites';
            }
            favorites.forEach(fav => {
                const camera = cameraDataMap.get(fav.id);
                if (camera) {
                    const displayName = fav.alias ? 
                        `<span class="favorite-alias">${fav.alias}</span><br><span class="favorite-original-name">(${camera.camera_location})</span>` : 
                        `<span class="favorite-alias">${camera.camera_location}</span>`;

                    const li = document.createElement('li');
                    li.className = 'favorite-item';
                    li.innerHTML = `<span class="favorite-name" data-locid="${fav.id}">${displayName}</span>
                                    <div class="favorite-actions">
                                        <span class="edit-favorite-btn" data-locid="${fav.id}" title="Edit alias"><i class="fas fa-pencil"></i></span>
                                        <span class="remove-favorite-btn" data-locid="${fav.id}" title="Remove favorite"><i class="fas fa-trash-can"></i></span>
                                    </div>`;
                    favoritesList.appendChild(li);
                }
            });
        } else {
            favoritesContainer.style.display = 'none';
            stopCycle();
        }
    }

    function addFavorite(locId) {
        stopCycle();
        if (locId && !favorites.some(fav => fav.id === locId)) {
            console.log(`Adding camera '${locId}' to favorites.`);
            favorites.push({ id: locId, alias: '' });
            saveFavorites();
            renderFavoritesList();
            updateFavoriteButton(locId);
        }
    }

    function editFavoriteAlias(locId) {
        const favorite = favorites.find(fav => fav.id === locId);
        if (!favorite) return;

        const newAlias = prompt("Enter a new alias for this favorite:", favorite.alias);
        
        if (newAlias !== null) {
            favorite.alias = newAlias.trim();
            console.log(`Updated alias for '${locId}' to '${favorite.alias}'.`);
            saveFavorites();
            renderFavoritesList();
        }
    }

    function removeFavorite(locId) {
        stopCycle();
        console.log(`Removing camera '${locId}' from favorites.`);
        favorites = favorites.filter(fav => fav.id !== locId);
        saveFavorites();
        renderFavoritesList();
        updateFavoriteButton(currentLocation);
    }
    
    function updateFavoriteButton(locId) {
        const isSharedCycle = new URLSearchParams(window.location.search).has('cycle');
        if (isSharedCycle) {
            addFavoriteBtn.textContent = 'Add to My Favorites';
            addFavoriteBtn.classList.remove('in-favorites');
            addFavoriteBtn.disabled = false;
            return;
        }

        if (favorites.some(fav => fav.id === locId)) {
            addFavoriteBtn.textContent = 'In Favorites';
            addFavoriteBtn.classList.add('in-favorites');
            addFavoriteBtn.disabled = true;
        } else {
            addFavoriteBtn.textContent = 'Add to Favorite';
            addFavoriteBtn.classList.remove('in-favorites');
            addFavoriteBtn.disabled = false;
        }
    }

    // --- Cycle Functions ---
    function startCycle() {
        if (cycleIntervalId || favorites.length < 2) return;
        console.log(`Starting favorites cycle at ${cycleSpeed}s interval.`);
        cycleFavoritesBtn.textContent = 'Stop Cycle';
        cycleFavoritesBtn.classList.add('active');
        
        const startIndex = favorites.findIndex(fav => fav.id === currentLocation);
        currentFavoriteIndex = (startIndex === -1) ? 0 : startIndex;

        cycleIntervalId = setInterval(switchToNextFavorite, cycleSpeed * 1000);
    }

    function stopCycle() {
        if (!cycleIntervalId) return;
        console.log("Stopping favorites cycle.");
        clearInterval(cycleIntervalId);
        cycleIntervalId = null;
        cycleFavoritesBtn.textContent = 'Cycle Favorites';
        cycleFavoritesBtn.classList.remove('active');
    }

    function switchToNextFavorite() {
        currentFavoriteIndex = (currentFavoriteIndex + 1) % favorites.length;
        const nextFavoriteId = favorites[currentFavoriteIndex].id;
        console.log(`Cycling to next favorite: ${nextFavoriteId}`);
        selectCamera(nextFavoriteId, true);
    }

    // --- Main Camera and UI Functions ---
    function updateSlideshowImage() {
        if (currentLocation) {
            slideImg.src = `http://trafficcam.calgary.ca/ss/${images[i]}/${currentLocation}.jpg`;
            i = (i + 1) % images.length;
        }
    }

    function selectCamera(locId, fromCycle = false) {
        if (!fromCycle) stopCycle();
        if (!locId || !cameraDataMap.has(locId)) return;
        
        console.log(`Selecting camera: ${locId}`);
        const camera = cameraDataMap.get(locId);
        currentLocation = locId;
        searchInput.value = camera.camera_location;
        i = 0;
        updateSlideshowImage();
        updateFavoriteButton(locId);

        const selectedMarker = markerObjects[locId];
        if (selectedMarker) {
            map.setView(selectedMarker.getLatLng(), 15);
            selectedMarker.openPopup();
        }
    }
    
    // --- DATA FETCHING, CACHING, & GEOCODING ---
    const CACHE_KEY_DATA = 'calgaryCameraData';
    const CACHE_KEY_TIMESTAMP = 'calgaryCameraTimestamp';
    const CACHE_DURATION_MS = 60 * 60 * 1000;

    async function geocodeAddress(address) {
        console.log(`Geocoding address: ${address}`);
        const queryAddress = `${address}, Calgary, AB`;
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(queryAddress)}&format=json&limit=1`;
        
        try {
            const response = await fetch(url, { headers: { 'User-Agent': 'CalgaryTrafficCamViewer/1.0' } });
            if (!response.ok) throw new Error(`Nominatim API error! status: ${response.status}`);
            
            const data = await response.json();
            if (data && data.length > 0) {
                const { lat, lon } = data[0];
                console.log(`Address found at: Lat ${lat}, Lon ${lon}`);
                return [parseFloat(lat), parseFloat(lon)];
            } else {
                console.log("Address not found via geocoding.");
                return null;
            }
        } catch (error) {
            console.error("Geocoding failed:", error);
            return null;
        }
    }

    function initializeApp(data) {
        console.log("Processing camera data to build UI.");
        data.sort((a, b) => (a.camera_location || '').localeCompare(b.camera_location || ''));
        
        const videoIcon = L.divIcon({
            html: '<i class="fas fa-video"></i>',
            className: 'camera-map-icon',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });
        
        data.forEach(item => {
            const locId = getLocId(item.camera_url?.url);
            if (locId && item.camera_location) {
                cameraDataMap.set(locId, item);
                const div = document.createElement('div');
                div.className = 'dropdown-item';
                div.dataset.locid = locId;
                div.textContent = item.camera_location;
                dropdown.appendChild(div);

                if (item.point?.coordinates?.length === 2) {
                    const latLng = [item.point.coordinates[1], item.point.coordinates[0]];
                    const marker = L.marker(latLng, { icon: videoIcon }).addTo(map).bindPopup(`<b>${item.camera_location}</b>`);
                    markerObjects[locId] = marker;
                    marker.on('click', () => selectCamera(locId));
                }
            }
        });

        const urlParams = new URLSearchParams(window.location.search);
        const cameraToSelect = urlParams.get('camera');
        const camerasToCycle = urlParams.get('cycle');

        if (camerasToCycle) {
            console.log("URL parameter found: Initializing shared cycle.");
            const sharedFavorites = camerasToCycle.split(',').filter(id => cameraDataMap.has(id));
            if (sharedFavorites.length > 0) {
                favorites = sharedFavorites.map(id => ({id: id, alias: ''}));
                favoritesVisible = true;
                renderFavoritesList();
                selectCamera(favorites[0].id);
                startCycle();
            } else {
                loadFavorites();
                renderFavoritesList();
                selectCamera(cameraDataMap.keys().next().value);
            }
        } else if (cameraToSelect && cameraDataMap.has(cameraToSelect)) {
            console.log(`URL parameter found: Selecting camera '${cameraToSelect}'.`);
            loadFavorites();
            renderFavoritesList();
            selectCamera(cameraToSelect);
        } else {
            console.log("No valid URL parameters found, selecting random startup camera.");
            loadFavorites();
            renderFavoritesList();
            
            const cameraIds = Array.from(cameraDataMap.keys());
            if (cameraIds.length > 0) {
                const randomIndex = Math.floor(Math.random() * cameraIds.length);
                const randomCameraId = cameraIds[randomIndex];
                console.log(`Selected random camera: ${randomCameraId}`);
                selectCamera(randomCameraId);
            }
        }
        
        setTimeout(() => {
            map.invalidateSize();
            console.log("Map size invalidated for proper rendering.");
        }, 100);
    }

    function getTrafficCameraData() {
        const cachedData = localStorage.getItem(CACHE_KEY_DATA);
        const cachedTimestamp = localStorage.getItem(CACHE_KEY_TIMESTAMP);
        const now = Date.now();

        if (cachedData && cachedTimestamp && (now - cachedTimestamp < CACHE_DURATION_MS)) {
            const ageInMinutes = Math.round((now - cachedTimestamp) / 60000);
            console.log(`Loading camera data from local cache. Data is ${ageInMinutes} minutes old.`);
            initializeApp(JSON.parse(cachedData));
            return;
        }

        console.log('Fetching new camera data from API.');
        fetch('https://data.calgary.ca/resource/k7p9-kppz.json')
            .then(response => {
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                return response.json();
            })
            .then(data => {
                console.log('Successfully fetched new data. Caching...');
                localStorage.setItem(CACHE_KEY_DATA, JSON.stringify(data));
                localStorage.setItem(CACHE_KEY_TIMESTAMP, now.toString());
                initializeApp(data);
            })
            .catch(error => {
                console.error('Error fetching new data:', error);
                if (cachedData) {
                    console.log('Using stale cache as a fallback.');
                    initializeApp(JSON.parse(cachedData));
                }
            });
    }

    // --- Initial Setup ---
    loadSettings();
    map = L.map('map').setView([51.0447, -114.0719], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    getTrafficCameraData();
    setInterval(updateSlideshowImage, 1000);

    // --- Event Listeners ---
    addFavoriteBtn.addEventListener('click', () => addFavorite(currentLocation));
    toggleFavoritesBtn.addEventListener('click', () => {
        favoritesVisible = !favoritesVisible;
        renderFavoritesList();
    });
    cycleFavoritesBtn.addEventListener('click', () => {
        if (cycleIntervalId) stopCycle();
        else startCycle();
    });
    shareBtn.addEventListener('click', () => {
        const baseUrl = window.location.href.split('?')[0];
        let shareUrl;

        if (cycleIntervalId && favorites.length > 0) {
            shareUrl = `${baseUrl}?cycle=${favorites.map(fav => fav.id).join(',')}`;
        } else if (currentLocation) {
            shareUrl = `${baseUrl}?camera=${currentLocation}`;
        } else {
            shareUrl = baseUrl;
        }

        navigator.clipboard.writeText(shareUrl).then(() => {
            const originalText = shareBtn.textContent;
            shareBtn.textContent = 'Copied!';
            shareBtn.classList.add('copied');
            shareBtn.disabled = true;

            setTimeout(() => {
                shareBtn.textContent = originalText;
                shareBtn.classList.remove('copied');
                shareBtn.disabled = false;
            }, 2500);
        }).catch(err => {
            console.error('Failed to copy link: ', err);
            alert('Failed to copy link.');
        });
    });

    favoritesList.addEventListener('click', e => {
        const editBtn = e.target.closest('.edit-favorite-btn');
        if (editBtn) {
            editFavoriteAlias(editBtn.dataset.locid);
            return;
        }

        const removeBtn = e.target.closest('.remove-favorite-btn');
        if (removeBtn) {
            if (!new URLSearchParams(window.location.search).has('cycle')) {
                removeFavorite(removeBtn.dataset.locid);
            } else {
                alert("Cannot remove items from a shared cycle list.");
            }
            return;
        }

        const nameSpan = e.target.closest('.favorite-name');
        if (nameSpan) {
            selectCamera(nameSpan.dataset.locid);
            return;
        }
    });
    
    dropdown.addEventListener('click', e => {
        if (e.target.classList.contains('dropdown-item')) {
            selectCamera(e.target.dataset.locid);
            dropdown.style.display = 'none';
        }
    });
    
    searchInput.addEventListener('input', function() {
        const filter = searchInput.value.toLowerCase();
        const items = dropdown.querySelectorAll('.dropdown-item');
        let hasVisibleItems = false;
        items.forEach(item => {
            const isVisible = item.textContent.toLowerCase().includes(filter);
            item.style.display = isVisible ? '' : 'none';
            if (isVisible) hasVisibleItems = true;
        });
        dropdown.style.display = hasVisibleItems ? 'block' : 'none';
    });
    
    searchForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const searchTerm = searchInput.value.trim();
        if (!searchTerm) return;
        
        dropdown.style.display = 'none';
        searchInput.blur();
        const coords = await geocodeAddress(searchTerm);
        
        if (coords) {
            map.setView(coords, 16);
        } else {
            alert(`Address "${searchTerm}" not found.`);
        }
    });

    document.addEventListener('click', e => {
        if (document.getElementById('map-view-wrapper') && !document.getElementById('map-view-wrapper').contains(e.target)) {
            dropdown.style.display = 'none';
        }
    });

    // Settings Modal Listeners
    settingsBtn.addEventListener('click', () => { settingsModal.style.display = 'flex'; });
    settingsCancelBtn.addEventListener('click', () => { settingsModal.style.display = 'none'; });
    settingsSaveBtn.addEventListener('click', saveSettings);
    forceRefreshBtn.addEventListener('click', forceRefreshData);
});
