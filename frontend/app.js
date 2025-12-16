const API_URL = window.location.hostname === 'localhost' 
  ? 'http://localhost:3000/api' 
  : '/api';

let map;
let markers = [];
let token = localStorage.getItem('token');
let currentUser = null;
let selectedLocation = null;
let isAddingPin = false;
let previewMarker = null;
let streetTileLayer = null;
let satelliteTileLayer = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  if (token) {
    showApp();
  }
});

// Auth functions
function showLogin() {
  document.getElementById('loginForm').style.display = 'block';
  document.getElementById('registerForm').style.display = 'none';
}

function showRegister() {
  document.getElementById('loginForm').style.display = 'none';
  document.getElementById('registerForm').style.display = 'block';
}

async function login() {
  const username = document.getElementById('loginUsername').value;
  const password = document.getElementById('loginPassword').value;
  const errorDiv = document.getElementById('loginError');

  try {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (!response.ok) {
      errorDiv.textContent = data.error || 'Login failed';
      errorDiv.style.display = 'block';
      return;
    }

    token = data.token;
    currentUser = data.user;
    localStorage.setItem('token', token);
    showApp();
  } catch (error) {
    errorDiv.textContent = 'Network error';
    errorDiv.style.display = 'block';
  }
}

async function register() {
  const username = document.getElementById('registerUsername').value;
  const password = document.getElementById('registerPassword').value;
  const referralCode = document.getElementById('registerReferralCode').value;
  const errorDiv = document.getElementById('registerError');

  try {
    const response = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, referralCode })
    });

    const data = await response.json();

    if (!response.ok) {
      errorDiv.textContent = data.error || 'Registration failed';
      errorDiv.style.display = 'block';
      return;
    }

    token = data.token;
    currentUser = data.user;
    localStorage.setItem('token', token);
    showApp();
  } catch (error) {
    errorDiv.textContent = 'Network error';
    errorDiv.style.display = 'block';
  }
}

function logout() {
  token = null;
  currentUser = null;
  localStorage.removeItem('token');
  document.getElementById('authContainer').classList.add('active');
  document.getElementById('appContainer').classList.remove('active');
  if (map) {
    map.remove();
    map = null;
  }
}

function showApp() {
  document.getElementById('authContainer').classList.remove('active');
  document.getElementById('appContainer').classList.add('active');
  
  // Get current user info
  const tokenPayload = JSON.parse(atob(token.split('.')[1]));
  currentUser = { id: tokenPayload.id, username: tokenPayload.username, is_admin: tokenPayload.is_admin };
  const adminBadge = currentUser.is_admin ? 'ADMIN' : '';
  document.getElementById('userNameDisplay').textContent = `👤 ${currentUser.username}${adminBadge}`;
  
  initMap();
  loadPins();
  loadGroups();
  loadReferrals();
}

// Map functions
function initMap() {
  if (map) return;
  
  map = L.map('map').setView([53.4129, -8.2439], 7); // Default to Ireland

  streetTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
  });

  satelliteTileLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: '© Esri',
    maxZoom: 18
  });

  streetTileLayer.addTo(map);

  // Click to place preview marker and set location when adding pin
  map.on('click', (e) => {
    if (isAddingPin) {
      selectedLocation = e.latlng;
      document.getElementById('pinLat').value = e.latlng.lat.toFixed(6);
      document.getElementById('pinLon').value = e.latlng.lng.toFixed(6);
      isAddingPin = false;
      document.getElementById('addPinError').textContent = '';
      document.getElementById('addPinError').style.display = 'none';
      updatePreviewMarker(e.latlng);
    } else {
      // Allow clicking map to place a preview marker even when not in add mode
      updatePreviewMarker(e.latlng);
    }
  });

  // Try to get user's location
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition((position) => {
      map.setView([position.coords.latitude, position.coords.longitude], 13);
    });
  }
}

async function loadPins() {
  try {
    const response = await fetch(`${API_URL}/pins`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) {
      console.error('Failed to load pins, status:', response.status);
      throw new Error('Failed to load pins');
    }

    const pins = await response.json();
    console.log('Loaded pins:', pins.length);
    
    // Clear existing markers
    markers.forEach(marker => marker.remove());
    markers = [];

    // Add markers to map
    pins.forEach(pin => {
      const isOwnPin = pin.user_id === currentUser.id;
      const icon = L.divIcon({
        html: `<div style="background:${isOwnPin ? '#4CAF50' : '#2196F3'};width:25px;height:25px;border-radius:50%;border:3px solid white;"></div>`,
        className: '',
        iconSize: [25, 25]
      });

      const marker = L.marker([pin.latitude, pin.longitude], { icon, pinId: pin.id }).addTo(map);
      
      let popupContent = `
        <strong>${pin.title}</strong><br>
        <small>by ${pin.username}</small><br>
        ${pin.description ? `<p>${pin.description}</p>` : ''}
      `;

      if (pin.images && pin.images.length > 0) {
        pin.images.forEach(img => {
          if (img) {
            const imgUrl = API_URL.replace('/api', '') + `/uploads/${img}`;
            popupContent += `<img src="${imgUrl}" class="popup-image" alt="Pin image">`;
          }
        });
      }

      if (isOwnPin) {
        popupContent += `<br><button onclick="deletePin(${pin.id})" style="margin-top:10px;padding:5px 10px;background:#f44336;color:white;border:none;border-radius:3px;cursor:pointer;">Delete</button>`;
      }

      marker.bindPopup(popupContent);
      markers.push(marker);
    });

    // Update pins list in sidebar
    const pinsList = document.getElementById('pinsList');
    let displayPins = currentUser.is_admin ? pins : pins.filter(p => p.user_id === currentUser.id);
    
    if (displayPins.length === 0) {
      pinsList.innerHTML = '<p style="color:#999;">No pins yet</p>';
    } else {
      // Sort alphabetically by title
      const sortedPins = displayPins.sort((a, b) => a.title.localeCompare(b.title));
      
      pinsList.innerHTML = (currentUser.is_admin ? '<p style="color:#FFB700; margin-bottom: 12px;"><small>📍 All Pins</small></p>' : '') + sortedPins.map(pin => `
        <div class="pin-item" style="cursor: pointer; padding: 12px; margin-bottom: 8px;" 
             onclick="goToPin(${pin.latitude}, ${pin.longitude}, ${pin.id})">
          <h4 style="margin: 0;">${pin.title}</h4>
          ${currentUser.is_admin ? `<small style="color: #999;">by ${pin.username}</small>` : ''}
        </div>
      `).join('');
    }
  } catch (error) {
    console.error('Load pins error:', error);
  }
}

async function addPin() {
  const title = document.getElementById('pinTitle').value;
  const description = document.getElementById('pinDescription').value;
  const lat = document.getElementById('pinLat').value;
  const lon = document.getElementById('pinLon').value;
  const images = document.getElementById('pinImages').files;
  const errorDiv = document.getElementById('addPinError');

  if (!title || !lat || !lon) {
    errorDiv.textContent = 'Title, latitude, and longitude are required';
    errorDiv.style.display = 'block';
    return;
  }

  const formData = new FormData();
  formData.append('title', title);
  formData.append('description', description);
  formData.append('latitude', lat);
  formData.append('longitude', lon);

  for (let i = 0; i < Math.min(images.length, 5); i++) {
    formData.append('images', images[i]);
  }

  try {
    const response = await fetch(`${API_URL}/pins`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });

    if (!response.ok) {
      let errorMessage = 'Failed to add pin';
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        try {
          const data = await response.json();
          errorMessage = data.error || errorMessage;
        } catch (e) {
          errorMessage = 'Server error (invalid response format)';
        }
      } else {
        try {
          const text = await response.text();
          errorMessage = text || errorMessage;
        } catch (e) {
          errorMessage = 'Server error';
        }
      }
      throw new Error(errorMessage);
    }
    const data = await response.json();
    console.log('Pin created successfully:', data);

    // Remove preview marker
    if (previewMarker) {
      map.removeLayer(previewMarker);
      previewMarker = null;
    }

    closeModal('addPinModal');
    document.getElementById('pinTitle').value = '';
    document.getElementById('pinDescription').value = '';
    document.getElementById('pinLat').value = '';
    document.getElementById('pinLon').value = '';
    document.getElementById('pinImages').value = '';
    
    // Reload pins to show the new one
    await loadPins();
  } catch (error) {
    console.error('Add pin error:', error);
    errorDiv.textContent = error.message;
    errorDiv.style.display = 'block';
    errorDiv.style.background = '#f44336';
  }
}

async function deletePin(pinId) {
  if (!confirm('Are you sure you want to delete this pin?')) return;

  try {
    const response = await fetch(`${API_URL}/pins/${pinId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) throw new Error('Failed to delete pin');

    loadPins();
  } catch (error) {
    alert('Failed to delete pin');
  }
}

// Groups functions
async function loadGroups() {
  try {
    const response = await fetch(`${API_URL}/groups`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) throw new Error('Failed to load groups');

    const groups = await response.json();
    const groupsList = document.getElementById('groupsList');

    if (groups.length === 0) {
      groupsList.innerHTML = '<p style="color:#999;">No groups yet</p>';
    } else {
      groupsList.innerHTML = groups.map(group => `
        <div class="group-item">
          <h4>${group.name}</h4>
          <p>👥 ${group.member_count} members</p>
          <p><small>Invite Code: <span class="code-display">${group.invite_code}</span></small></p>
          <button class="small-button secondary" onclick="viewGroupMembers(${group.id})">View Members</button>
          <button class="small-button danger" onclick="leaveGroup(${group.id})">Leave</button>
        </div>
      `).join('');
    }
  } catch (error) {
    console.error('Load groups error:', error);
  }
}

async function createGroup() {
  const name = document.getElementById('groupName').value;
  const errorDiv = document.getElementById('createGroupError');

  if (!name) {
    errorDiv.textContent = 'Group name is required';
    errorDiv.style.display = 'block';
    return;
  }

  try {
    const response = await fetch(`${API_URL}/groups`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ name })
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to create group');
    }

    closeModal('createGroupModal');
    document.getElementById('groupName').value = '';
    loadGroups();
    loadPins(); // Reload pins to show group members' pins
  } catch (error) {
    errorDiv.textContent = error.message;
    errorDiv.style.display = 'block';
  }
}

async function joinGroup() {
  const inviteCode = document.getElementById('joinGroupCode').value;
  const errorDiv = document.getElementById('joinGroupError');

  if (!inviteCode) {
    errorDiv.textContent = 'Invite code is required';
    errorDiv.style.display = 'block';
    return;
  }

  try {
    const response = await fetch(`${API_URL}/groups/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ inviteCode })
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to join group');
    }

    closeModal('joinGroupModal');
    document.getElementById('joinGroupCode').value = '';
    loadGroups();
    loadPins(); // Reload pins to show group members' pins
  } catch (error) {
    errorDiv.textContent = error.message;
    errorDiv.style.display = 'block';
  }
}

async function leaveGroup(groupId) {
  if (!confirm('Are you sure you want to leave this group?')) return;

  try {
    const response = await fetch(`${API_URL}/groups/${groupId}/leave`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) throw new Error('Failed to leave group');

    loadGroups();
    loadPins(); // Reload pins as group members' pins will no longer be visible
  } catch (error) {
    alert('Failed to leave group');
  }
}

async function viewGroupMembers(groupId) {
  try {
    const response = await fetch(`${API_URL}/groups/${groupId}/members`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) throw new Error('Failed to load members');

    const members = await response.json();
    alert('Group Members:\n\n' + members.map(m => `• ${m.username}`).join('\n'));
  } catch (error) {
    alert('Failed to load group members');
  }
}

// Referrals functions
async function loadReferrals() {
  try {
    const response = await fetch(`${API_URL}/referrals`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) throw new Error('Failed to load referral codes');

    const codes = await response.json();
    const referralsList = document.getElementById('referralsList');

    if (codes.length === 0) {
      referralsList.innerHTML = '<p style="color:#999;">No referral codes yet</p>';
    } else {
      referralsList.innerHTML = codes.map(code => `
        <div class="code-item">
          <div class="code-display">${code.code}</div>
          <p>${code.is_used ? '✅ Used' : '⏳ Available'}</p>
          ${code.used_at ? `<p><small>Used on: ${new Date(code.used_at).toLocaleDateString()}</small></p>` : ''}
        </div>
      `).join('');
    }
  } catch (error) {
    console.error('Load referrals error:', error);
  }
}

async function generateReferralCode() {
  try {
    const response = await fetch(`${API_URL}/referrals/generate`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!response.ok) throw new Error('Failed to generate code');

    loadReferrals();
  } catch (error) {
    alert('Failed to generate referral code');
  }
}

// GPX Import
async function importGPX() {
  const fileInput = document.getElementById('gpxFile');
  const errorDiv = document.getElementById('importGPXError');
  const successDiv = document.getElementById('importGPXSuccess');

  if (!fileInput.files[0]) {
    errorDiv.textContent = 'Please select a GPX file';
    errorDiv.style.display = 'block';
    return;
  }

  const formData = new FormData();
  formData.append('gpxFile', fileInput.files[0]);

  try {
    const response = await fetch(`${API_URL}/import/gpx`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to import GPX');
    }

    errorDiv.style.display = 'none';
    successDiv.textContent = data.message;
    successDiv.style.display = 'block';
    fileInput.value = '';
    
    setTimeout(() => {
      closeModal('importGPXModal');
      loadPins();
    }, 2000);
  } catch (error) {
    errorDiv.textContent = error.message;
    errorDiv.style.display = 'block';
  }
}

// UI functions
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

function showSection(section) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById(`${section}Section`).classList.add('active');
  
  document.querySelectorAll('.tab-buttons button').forEach(b => b.classList.add('secondary'));
  document.getElementById(`${section}Tab`).classList.remove('secondary');
}

function openAddPinModal() {
  // Only clear title, description, and images - NOT coordinates
  document.getElementById('pinTitle').value = '';
  document.getElementById('pinDescription').value = '';
  document.getElementById('pinImages').value = '';
  
  // If there's a preview marker, use its coordinates
  if (previewMarker && selectedLocation) {
    document.getElementById('pinLat').value = selectedLocation.lat.toFixed(6);
    document.getElementById('pinLon').value = selectedLocation.lng.toFixed(6);
    document.getElementById('addPinError').style.display = 'none';
  } else {
    document.getElementById('addPinError').style.display = 'block';
    document.getElementById('addPinError').textContent = 'Click on the map to set location first';
    document.getElementById('addPinError').style.background = '#FF9800';
  }
  
  document.getElementById('addPinModal').classList.add('active');
}

function openCreateGroupModal() {
  document.getElementById('createGroupModal').classList.add('active');
  document.getElementById('createGroupError').style.display = 'none';
}

function openJoinGroupModal() {
  document.getElementById('joinGroupModal').classList.add('active');
  document.getElementById('joinGroupError').style.display = 'none';
}

function openImportGPXModal() {
  document.getElementById('importGPXModal').classList.add('active');
  document.getElementById('importGPXError').style.display = 'none';
  document.getElementById('importGPXSuccess').style.display = 'none';
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('active');
}

// Update preview marker on map
function updatePreviewMarker(latlng) {
  // Remove old marker if exists
  if (previewMarker) {
    map.removeLayer(previewMarker);
  }

  // Create new marker with distinctive style
  const icon = L.divIcon({
    html: `<div style="background:#FF6B6B;width:30px;height:30px;border-radius:50%;border:3px solid white;box-shadow:0 0 10px rgba(255,107,107,0.5);display:flex;align-items:center;justify-content:center;"><div style="width:8px;height:8px;background:white;border-radius:50%;"></div></div>`,
    className: '',
    iconSize: [30, 30]
  });

  previewMarker = L.marker(latlng, { icon }).addTo(map);

  // Show coordinates in popup
  const popupContent = `
    <strong>Spot Location</strong><br>
    Lat: ${latlng.lat.toFixed(6)}<br>
    Lon: ${latlng.lng.toFixed(6)}<br>
    <small>Click "Add Pin" to create</small>
  `;
  previewMarker.bindPopup(popupContent).openPopup();

  // Store location
  selectedLocation = latlng;
}

// Navigate to a specific pin on the map
function goToPin(lat, lng, pinId) {
  map.setView([lat, lng], 15);
  
  // Find and open the popup for this pin
  map.eachLayer(layer => {
    if (layer instanceof L.Marker && layer.options.pinId === pinId) {
      layer.openPopup();
    }
  });
}

// Map layer switcher
function changeMapLayer(layerType) {
  if (layerType === 'street') {
    map.removeLayer(satelliteTileLayer);
    map.addLayer(streetTileLayer);
    document.getElementById('btnStreet').classList.add('active');
    document.getElementById('btnSatellite').classList.remove('active');
  } else if (layerType === 'satellite') {
    map.removeLayer(streetTileLayer);
    map.addLayer(satelliteTileLayer);
    document.getElementById('btnSatellite').classList.add('active');
    document.getElementById('btnStreet').classList.remove('active');
  }
}

// Close modals when clicking outside
document.querySelectorAll('.modal').forEach(modal => {
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('active');
    }
  });
});
