const API_BASE_URL = '';
const MAX_FACILITY_CARDS = 6;

// Global CKEditor instances
let aboutUsTextEditorInstance;
let academicsEditorInstance;
let admissionEditorInstance;
let facilitiesTextEditorInstance;

// --- UTILITY FUNCTIONS ---
function getElement(id) { return document.getElementById(id); }
function querySelector(selector) { return document.querySelector(selector); }
function querySelectorAll(selector) { return document.querySelectorAll(selector); }
function isAdminPage() { return window.location.pathname.includes('/admin.html'); }

// --- CORE API FETCHER ---
// Centralized function for making authenticated API calls.
async function apiFetch(endpoint, options = {}) {
    const token = localStorage.getItem('token');

    const defaultHeaders = { 'Accept': 'application/json' };

    if (token) {
        defaultHeaders['Authorization'] = `Bearer ${token}`;
    }

    // FormData sets its own Content-Type with a boundary. Don't override it.
    if (!(options.body instanceof FormData)) {
        defaultHeaders['Content-Type'] = 'application/json';
    }

    const finalOptions = {
        ...options,
        headers: { ...defaultHeaders, ...options.headers },
    };

    try {
        const response = await fetch(API_BASE_URL + endpoint, finalOptions);

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                console.error('Authentication error. Redirecting to login.');
                localStorage.removeItem('token');
                alert('Your session has expired or is invalid. Please log in again.');
                window.location.href = '/login.html?sessionExpired=true';
                throw new Error('Authentication Failed');
            }
            // For other errors, try to get a JSON message, otherwise fall back to text.
            const errorBody = await response.json().catch(() => response.text());
            const errorMessage = errorBody.message || errorBody.error || (typeof errorBody === 'string' ? errorBody : JSON.stringify(errorBody));
            console.error(`API Error on ${endpoint}: ${response.status}`, errorBody);
            throw new Error(`Server error: ${errorMessage}`);
        }

        // Handle successful responses with no content (e.g., DELETE)
        if (response.status === 204) {
            return null;
        }

        // Return the parsed JSON body for successful responses with content
        return await response.json();

    } catch (error) {
        // Log and re-throw the error so the calling function's catch block can handle it.
        // Avoid re-logging if it's our custom "Authentication Failed" error.
        if (error.message !== 'Authentication Failed') {
            console.error(`Network or processing error for ${endpoint}:`, error.message);
        }
        throw error;
    }
}


// --- INITIALIZATION ---
async function initAdminPage() {
    console.log("Initializing admin page components...");
    await initializeEditors();
    setupImagePreviews();
}

async function initializeEditors() {
  try {
    const editorConfig = {
        toolbar: [ 'heading', '|', 'bold', 'italic', 'link', 'bulletedList', 'numberedList', 'removeFormat', '|', 'undo', 'redo' ],
    };
    if (getElement('aboutUsTextEditor')) aboutUsTextEditorInstance = await ClassicEditor.create(getElement('aboutUsTextEditor'), editorConfig);
    if (getElement('academics-editor')) academicsEditorInstance = await ClassicEditor.create(getElement('academics-editor'), editorConfig);
    if (getElement('admission-editor')) admissionEditorInstance = await ClassicEditor.create(getElement('admission-editor'), editorConfig);
    if (getElement('facilitiesTextEditor')) facilitiesTextEditorInstance = await ClassicEditor.create(getElement('facilitiesTextEditor'), editorConfig);
  } catch (error) {
    console.error('Error initializing CKEditor:', error);
  }
}


// --- DATA FETCHING ---
async function fetchSettings() {
  try {
    // apiFetch returns the final settings object directly.
    const serverSettings = await apiFetch(`/api/settings`);

    const defaults = {
      schoolName: '', defaultHeroTitle: 'Welcome to Our School',
      schoolTagline: '', defaultHeroTagline: 'Nurturing Future Leaders',
      schoolLocationFooter: '', defaultSchoolLocationFooter: 'No location available contact admin.',
      logoURL: '', defaultLogoURL: '/uploads/logo-default.png',
      aboutUsImageURL: '', defaultAboutImageURL: '/uploads/about-us-default.jpg',
      academicsImageURL: '', defaultAcademicsImageURL: '/uploads/academics-default.jpg',
      schoolFont: "'Poppins', sans-serif", schoolTheme: 'light',
      aboutUsText: '<p>Default About Us. Configure in admin.</p>',
      academics: '<p>Default Academics. Configure in admin.</p>',
      admission: '<p>Default Admissions. Configure in admin.</p>',
      facilitiesText: '<p>Default Facilities Overview. Configure in admin.</p>',
      socialLinks: { facebook: '', twitter: '', instagram: '', linkedin: '', youtube: '' },
      socialWhatsapp: '', contactMapEmbedURL: '',
      facilityCards: Array(MAX_FACILITY_CARDS).fill({ iconClass: '', title: '', description: '' }),
      aboutGradient: { color1: '#e0c3fc', color2: '#8ec5fc', color3: '#000000', color4: '#000000', direction: 'to right' },
      admissionsGradient: { color1: '#007bff', color2: '#6f42c1', color3: '#000000', color4: '#000000', direction: '135deg' },
      academicsGradient: { color1: '#f8f9fa', color2: '#e9ecef', color3: '#000000', color4: '#000000', direction: 'to bottom right' },
      facilitiesGradient: { color1: '#f8f9fa', color2: '#ffffff', color3: '#000000', color4: '#000000', direction: 'to right' },
      contactGradient: { color1: '#ffffff', color2: '#e9ecef', color3: '#000000', color4: '#000000', direction: 'to right' },
      heroGradient: { color1: '#007bff', color2: '#6f42c1', color3: '#fd7e14', color4: '#00c6ff', direction: '45deg'},
      defaultCarouselImageURL: '/uploads/placeholder-carousel.jpg ',
      defaultCarouselAltText: 'Our Beautiful Campus', defaultCarouselLink: '#about',
      contactFormAction: 'whatsapp', schoolContactEmail: '', adminSchoolWhatsappNumber: ''
    };

    const completeSettings = {
        ...defaults,
        ...(serverSettings || {}), // Use fallback in case server returns null
        socialLinks: { ...defaults.socialLinks, ...(serverSettings?.socialLinks || {}) },
        facilityCards: Array.isArray(serverSettings?.facilityCards) && serverSettings.facilityCards.length > 0
            ? serverSettings.facilityCards.map(card => ({ ...{ iconClass: '', title: '', description: '' }, ...card })).slice(0, MAX_FACILITY_CARDS)
            : defaults.facilityCards,
        aboutGradient: { ...defaults.aboutGradient, ...(serverSettings?.aboutGradient || {}) },
        admissionsGradient: { ...defaults.admissionsGradient, ...(serverSettings?.admissionsGradient || {}) },
        academicsGradient: { ...defaults.academicsGradient, ...(serverSettings?.academicsGradient || {}) },
        facilitiesGradient: { ...defaults.facilitiesGradient, ...(serverSettings?.facilitiesGradient || {}) },
        contactGradient: { ...defaults.contactGradient, ...(serverSettings?.contactGradient || {}) },
        heroGradient: { ...defaults.heroGradient, ...(serverSettings?.heroGradient || {}) }
    };
    
    // Ensure the facility cards array is always the correct length for the admin UI
    while (completeSettings.facilityCards.length < MAX_FACILITY_CARDS) {
        completeSettings.facilityCards.push({ iconClass: '', title: '', description: '' });
    }

    return completeSettings;
  } catch (error) {
    console.error('Final catch in fetchSettings:', error.message);
    if (!error.message.includes('Authentication Failed')) {
        alert('Failed to load initial settings. Some defaults may be used. Check console.');
    }
    return null; // Return null so the calling function can handle failure
  }
}

async function fetchCarouselImages() {
  try {
    const images = await apiFetch(`/api/carousel`);
    return Array.isArray(images) ? images : [];
  } catch (error) {
    console.error('Final catch in fetchCarouselImages:', error.message);
    return []; // Return empty array on failure
  }
}

async function fetchUsers() {
    try {
        const users = await apiFetch('/api/users');
        console.log("Fetched users:", users);
        // Here you would typically populate a user list in the UI
    } catch (error) {
        console.error('Failed to fetch users:', error.message);
        if (!error.message.includes('Authentication Failed')) {
            alert(`Could not fetch users: ${error.message}`);
        }
    }
}


// --- DATA SAVING & UPLOADING ---
async function saveSettingsToServer(settingsToSave) {
    try {
        const result = await apiFetch('/api/settings', {
            method: 'POST',
            body: JSON.stringify({ settings: settingsToSave }),
        });
        console.log('Settings saved successfully on server:', result);
        return result;
    } catch (error) {
        console.error('Error saving settings to server:', error.message);
        // Re-throw so the main save function knows about the failure
        throw error;
    }
}

async function handleImageUpload(inputId, previewId, currentUrlId, endpoint, formDataKey) {
    const uploadInput = getElement(inputId);
    let finalURL = getElement(currentUrlId).value;

    if (uploadInput && uploadInput.files[0]) {
        const formData = new FormData();
        formData.append(formDataKey, uploadInput.files[0]);
        try {
            const result = await apiFetch(`/api/${endpoint}`, {
                method: 'POST',
                body: formData
            });

            if (result && result.url) {
                finalURL = result.url;
                getElement(currentUrlId).value = finalURL;
                const preview = getElement(previewId);
                if (preview) {
                    preview.src = finalURL;
                    preview.style.display = 'block';
                }
            } else {
                throw new Error(`URL not found in ${formDataKey} upload response.`);
            }
        } catch (error) {
            console.error(`Error during ${formDataKey} upload process:`, error);
            // Re-throw so the main save function can abort
            throw new Error(`Failed to upload ${formDataKey}: ${error.message}`);
        }
    }
    return finalURL;
}

// --- MAIN ADMIN ACTIONS ---
async function saveAdminSettings() {
    if (!isAdminPage()) return;
    const saveButton = querySelector('.container > button.btn-primary');
    const originalButtonText = saveButton.innerHTML;
    saveButton.disabled = true;
    saveButton.innerHTML = 'Saving... <span class="spinner-border spinner-border-sm"></span>';

    try {
        // Handle image uploads first
        const finalLogoURL = await handleImageUpload('logoUpload', 'logoPreviewAdmin', 'currentLogoURL', 'upload-logo', 'logo');
        const finalAboutImageURL = await handleImageUpload('aboutImageUpload', 'aboutImagePreviewAdmin', 'currentAboutImageURL', 'upload-about-image', 'aboutImage');
        const finalAcademicsImageURL = await handleImageUpload('academicsImageUpload', 'academicsImagePreviewAdmin', 'currentAcademicsImageURL', 'upload-academics-image', 'academicsImage');

        // Collect all text and select data
        const facilityCards = [];
        for (let i = 0; i < MAX_FACILITY_CARDS; i++) {
            const iconClass = getElement(`facilityIcon${i}`)?.value.trim() || '';
            const title = getElement(`facilityTitle${i}`)?.value.trim() || '';
            const description = getElement(`facilityDesc${i}`)?.value.trim() || '';
            if (iconClass || title || description) {
                facilityCards.push({ iconClass, title, description });
            }
        }

        const settingsToSave = {
            schoolName: getElement('schoolName')?.value || '',
            defaultHeroTitle: getElement('defaultHeroTitle')?.value || '',
            schoolTagline: getElement('school-tagline')?.value || '',
            schoolLocationFooter: getElement('school-location-footer')?.value || '',
            defaultHeroTagline: getElement('defaultHeroTagline')?.value || '',
            logoURL: finalLogoURL, defaultLogoURL: getElement('defaultLogoURL')?.value || '',
            aboutUsImageURL: finalAboutImageURL, defaultAboutImageURL: getElement('defaultAboutImageURL')?.value || '',
            academicsImageURL: finalAcademicsImageURL, defaultAcademicsImageURL: getElement('defaultAcademicsImageURL')?.value || '',
            schoolFont: getElement('fontSelect')?.value || "'Poppins', sans-serif",
            schoolTheme: getElement('themeSelect')?.value || "light",
            aboutUsText: aboutUsTextEditorInstance ? aboutUsTextEditorInstance.getData() : '',
            academics: academicsEditorInstance ? academicsEditorInstance.getData() : '',
            admission: admissionEditorInstance ? admissionEditorInstance.getData() : '',
            facilitiesText: facilitiesTextEditorInstance ? facilitiesTextEditorInstance.getData() : '',
            socialLinks: {
                facebook: getElement('socialFacebook')?.value.trim() || '', twitter: getElement('socialTwitter')?.value.trim() || '',
                instagram: getElement('socialInstagram')?.value.trim() || '', linkedin: getElement('socialLinkedIn')?.value.trim() || '',
                youtube: getElement('socialYouTube')?.value.trim() || '',
            },
            socialWhatsapp: getElement('socialWhatsapp')?.value.trim() || '',
            contactMapEmbedURL: extractSrcFromIframe(getElement('contactMapEmbedURL')?.value.trim() || ''),
            facilityCards: facilityCards,
            defaultCarouselImageURL: getElement('defaultCarouselImageURL')?.value.trim() || '',
            defaultCarouselAltText: getElement('defaultCarouselAltText')?.value.trim() || '',
            defaultCarouselLink: getElement('defaultCarouselLink')?.value.trim() || '',
            contactFormAction: querySelector('input[name="contactFormAction"]:checked')?.value || 'whatsapp',
            schoolContactEmail: getElement('schoolContactEmail')?.value.trim() || '',
            adminSchoolWhatsappNumber: getElement('adminSchoolWhatsappNumber')?.value.trim() || '',
        };

        const gradientSections = ['hero', 'about', 'admissions', 'academics', 'facilities', 'contact'];
        gradientSections.forEach(section => {
            if (getElement(`${section}GradientColor1`)) {
                settingsToSave[`${section}Gradient`] = {
                    color1: getElement(`${section}GradientColor1`).value, color2: getElement(`${section}GradientColor2`).value,
                    color3: getElement(`${section}GradientColor3`).value, color4: getElement(`${section}GradientColor4`).value,
                    direction: getElement(`${section}GradientDirection`).value || 'to right',
                };
            }
        });

        // Save everything to the server
        await saveSettingsToServer(settingsToSave);
        alert('Settings saved successfully!');
        await loadAdminData();

    } catch (error) {
        console.error('Error during saveAdminSettings:', error.message);
        if (!error.message.includes('Authentication Failed')) {
            alert(`Could not save settings: ${error.message}`);
        }
    } finally {
        saveButton.disabled = false;
        saveButton.innerHTML = originalButtonText;
    }
}

async function uploadCarouselImage() {
    const fileInput = getElement('carousel-image-upload');
    const altInput = getElement('carousel-image-alt');
    const linkInput = getElement('carousel-image-link');

    if (!fileInput.files[0]) { alert('Please select an image file.'); return; }
    if (!altInput.value.trim()) { alert('Please provide Alt Text / Caption.'); return; }

    const formData = new FormData();
    formData.append('carouselImage', fileInput.files[0]);
    formData.append('altText', altInput.value.trim());
    formData.append('linkURL', linkInput.value.trim());

    try {
        await apiFetch(`/api/carousel`, { method: 'POST', body: formData });
        alert('Carousel image uploaded successfully!');
        fileInput.value = ''; altInput.value = ''; linkInput.value = '';
        await loadAdminData();
    } catch (error) {
        console.error('Error uploading carousel image:', error.message);
        if (!error.message.includes('Authentication Failed')) {
            alert(`Error uploading carousel image: ${error.message}`);
        }
    }
}

async function removeCarouselImageAdmin(id) {
    if (!id) { alert('Error: Image ID is missing.'); return; }
    if (!confirm('Are you sure you want to delete this carousel image?')) return;
    try {
        await apiFetch(`/api/carousel/${id}`, { method: 'DELETE' });
        alert('Carousel image removed successfully.');
        await loadAdminData();
    } catch (error) {
        console.error('Error removing carousel image:', error.message);
        if (!error.message.includes('Authentication Failed')) {
            alert(`Error removing image: ${error.message}`);
        }
    }
}

async function logoutAdmin() {
    if (confirm('Are you sure you want to logout?')) {
        try {
            // Call the API to invalidate the session on the server side (if applicable)
            await apiFetch(`/api/logout`, { method: 'POST' });
            
            // If the call succeeds, clear local data and redirect
            localStorage.removeItem('token');
            alert('Logout successful.');
            window.location.href = '/login.html';
        } catch (error) {
            console.error('Error during logout process:', error.message);
            // apiFetch already handles the auth error alert and redirect.
            // This is a fallback for other issues. Still log the user out.
            if (!error.message.includes('Authentication Failed')) {
                alert('An unexpected error occurred during logout. Redirecting to login.');
            }
            localStorage.removeItem('token'); // Ensure token is cleared even on failure
            window.location.href = '/login.html';
        }
    }
}


// --- DOM MANIPULATION & UI LOGIC (Admin and Public) ---

// Load data into the main admin form or public-facing site
async function loadAdminData() {
  try {
    if (isAdminPage()) {
      const token = localStorage.getItem('token');
      if (!token) {
        console.log('No token found. Redirecting to login.');
        window.location.href = '/login.html?unauthorized=true';
        return; // Stop execution
      }
    }

    const [settings, carouselImages] = await Promise.all([
        fetchSettings(),
        fetchCarouselImages()
    ]);

    if (!settings) {
        console.error("Failed to load settings, aborting page render.");
        if (isAdminPage()) alert("Could not load core site settings. Page may not function correctly.");
        return;
    }

    applyBaseSettings(settings);

    if (isAdminPage()) {
      populateAdminForm(settings, carouselImages);
    } else {
      populatePublicPage(settings, carouselImages);
    }

    // Set dynamic year in footer, etc.
    const currentYear = new Date().getFullYear();
    querySelectorAll('[data-current-year]').forEach(el => el.textContent = currentYear);
    querySelectorAll('[data-next-year]').forEach(el => el.textContent = currentYear + 1);

  } catch (error) {
    console.error('Critical error during loadAdminData:', error.message);
  }
}

function populateAdminForm(settings, carouselImages) {
    getElement('schoolName').value = settings.schoolName || '';
    getElement('defaultHeroTitle').value = settings.defaultHeroTitle || '';
    getElement('school-tagline').value = settings.schoolTagline || '';
    getElement('school-location-footer').value = settings.schoolLocationFooter || '';
    getElement('defaultHeroTagline').value = settings.defaultHeroTagline || '';

    getElement('currentLogoURL').value = settings.logoURL || '';
    getElement('logoPreviewAdmin').src = settings.logoURL || '#';
    getElement('logoPreviewAdmin').style.display = settings.logoURL ? 'block' : 'none';
    getElement('defaultLogoURL').value = settings.defaultLogoURL || '';

    getElement('currentAboutImageURL').value = settings.aboutUsImageURL || '';
    getElement('aboutImagePreviewAdmin').src = settings.aboutUsImageURL || '#';
    getElement('aboutImagePreviewAdmin').style.display = settings.aboutUsImageURL ? 'block' : 'none';
    getElement('defaultAboutImageURL').value = settings.defaultAboutImageURL || '';

    getElement('currentAcademicsImageURL').value = settings.academicsImageURL || '';
    getElement('academicsImagePreviewAdmin').src = settings.academicsImageURL || '#';
    getElement('academicsImagePreviewAdmin').style.display = settings.academicsImageURL ? 'block' : 'none';
    getElement('defaultAcademicsImageURL').value = settings.defaultAcademicsImageURL || '';

    if (aboutUsTextEditorInstance) aboutUsTextEditorInstance.setData(settings.aboutUsText || '');
    if (academicsEditorInstance) academicsEditorInstance.setData(settings.academics || '');
    if (admissionEditorInstance) admissionEditorInstance.setData(settings.admission || '');
    if (facilitiesTextEditorInstance) facilitiesTextEditorInstance.setData(settings.facilitiesText || '');

    getElement('fontSelect').value = settings.schoolFont || "'Poppins', sans-serif";
    getElement('themeSelect').value = settings.schoolTheme || "light";

    getElement('socialWhatsapp').value = settings.socialWhatsapp || '';
    getElement('contactMapEmbedURL').value = settings.contactMapEmbedURL || '';
    const socialLinks = settings.socialLinks || {};
    getElement('socialFacebook').value = socialLinks.facebook || '';
    getElement('socialTwitter').value = socialLinks.twitter || '';
    getElement('socialInstagram').value = socialLinks.instagram || '';
    getElement('socialLinkedIn').value = socialLinks.linkedin || '';
    getElement('socialYouTube').value = socialLinks.youtube || '';

    generateFacilityCardInputsAdmin(settings.facilityCards || []);

    getElement('defaultCarouselImageURL').value = settings.defaultCarouselImageURL || '';
    getElement('defaultCarouselAltText').value = settings.defaultCarouselAltText || '';
    getElement('defaultCarouselLink').value = settings.defaultCarouselLink || '';

    const contactAction = settings.contactFormAction || 'whatsapp';
    getElement('contactActionEmail').checked = contactAction === 'email';
    getElement('contactActionWhatsapp').checked = contactAction !== 'email';
    getElement('schoolContactEmail').value = settings.schoolContactEmail || '';
    getElement('adminSchoolWhatsappNumber').value = settings.adminSchoolWhatsappNumber || '';

    loadGradientSettings(settings);
    displayCarouselImagesAdmin(carouselImages);
}

function populatePublicPage(settings, carouselImages) {
    applyPublicSchoolDisplaySettings(settings);
    populateCarouselPublic(carouselImages, settings);
    populateFacilityCardsPublic(settings.facilityCards || [], settings.facilitiesText);
    populateSocialLinksPublic(settings.socialLinks || {}, settings.socialWhatsapp);
    applyMapPublic(settings.contactMapEmbedURL);
}

function generateFacilityCardInputsAdmin(facilityCardsData = []) {
    const container = getElement('facilityCardsAdminContainer');
    if (!container) return;
    container.innerHTML = '<p class="text-muted">Fill in the details for each facility card you want to display on the public page.</p>';
    for (let i = 0; i < MAX_FACILITY_CARDS; i++) {
        const cardData = facilityCardsData[i] || { iconClass: '', title: '', description: '' };
        const cardDiv = document.createElement('div');
        cardDiv.className = 'facility-card-admin mb-3 p-3 border rounded';
        cardDiv.innerHTML = `
            <h5>Facility Card ${i + 1}</h5>
            <div class="mb-2">
                <label for="facilityIcon${i}" class="form-label small">Icon Class (e.g., bi-building-gear)</label>
                <input type="text" id="facilityIcon${i}" class="form-control form-control-sm" value="${cardData.iconClass || ''}" placeholder="bi-building-gear">
            </div>
            <div class="mb-2">
                <label for="facilityTitle${i}" class="form-label small">Title</label>
                <input type="text" id="facilityTitle${i}" class="form-control form-control-sm" value="${cardData.title || ''}" placeholder="Card Title">
            </div>
            <div>
                <label for="facilityDesc${i}" class="form-label small">Description</label>
                <textarea id="facilityDesc${i}" class="form-control form-control-sm" rows="2" placeholder="Short description">${cardData.description || ''}</textarea>
            </div>
        `;
        container.appendChild(cardDiv);
    }
}

function loadGradientSettings(settings) {
    const sections = ['hero', 'about', 'admissions', 'academics', 'facilities', 'contact'];
    sections.forEach(section => {
        const gradientData = settings[`${section}Gradient`] || {};
        const getVal = (id) => getElement(`${section}Gradient${id}`);
        if (getVal('Color1')) {
            getVal('Color1').value = gradientData.color1 || '#000000';
            getVal('Color2').value = gradientData.color2 || '#000000';
            getVal('Color3').value = gradientData.color3 || '#000000';
            getVal('Color4').value = gradientData.color4 || '#000000';
            getVal('Direction').value = gradientData.direction || 'to right';
        }
    });
}

function displayCarouselImagesAdmin(images) {
    const container = getElement('carousel-images-container');
    if (!container) return;
    container.innerHTML = '';
    if (!images || images.length === 0) {
        container.innerHTML = '<p class="text-muted">No carousel images uploaded. Add one below.</p>';
        return;
    }
    images.forEach(image => {
        const div = document.createElement('div');
        div.className = 'carousel-image-entry';
        const fileName = image.file_name || 'N/A';
        div.innerHTML = `
            <div class="carousel-image-info">
                <img src="${image.image_url}" alt="${image.alt_text || 'Carousel'}" class="carousel-image-preview">
                <span>${image.alt_text || 'Unnamed'} (${fileName})</span>
                ${image.link_url ? `<span><br><small>Links to: ${image.link_url}</small></span>` : ''}
            </div>
            <button class="btn btn-sm btn-danger" onclick="removeCarouselImageAdmin('${image.id}')" title="Delete Image"><i class="bi bi-trash"></i></button>
        `;
        container.appendChild(div);
    });
}

function applyBaseSettings(settings) {
    document.documentElement.setAttribute('data-theme', settings.schoolTheme || 'light');
    document.documentElement.style.setProperty('--dynamic-body-font', settings.schoolFont || "'Poppins', sans-serif");
}

function applyPublicSchoolDisplaySettings(settings) {
    const finalSchoolName = settings.schoolName || settings.defaultHeroTitle || 'Our School';
    const finalTagline = settings.schoolTagline || settings.defaultHeroTagline || 'Nurturing Young Minds';
    const finalSchoolLocationFooter = settings.schoolLocationFooter || settings.defaultSchoolLocationFooter;

    getElement('pageTitle').textContent = `${finalSchoolName} | ${finalTagline.substring(0, 50)}`;
    getElement('metaDescription').content = `Welcome to ${finalSchoolName}. ${finalTagline}.`;

    querySelectorAll('.school-name').forEach(el => el.textContent = finalSchoolName);
    ['heroSchoolName', 'navSchoolNameDisplay', 'aboutSchoolName', 'footerSchoolNameDisplay', 'footerCopyrightSchoolName'].forEach(id => {
        const el = getElement(id);
        if (el) el.textContent = finalSchoolName;
    });

    const logoUrlToUse = settings.logoURL || settings.defaultLogoURL;
    ['logoURL', 'footerLogoURL'].forEach(id => {
        const el = getElement(id);
        if (el) { el.src = logoUrlToUse; el.alt = `${finalSchoolName} Logo`; }
    });
    setDynamicFavicon(logoUrlToUse);

    getElement('aboutUsImage').src = settings.aboutUsImageURL || settings.defaultAboutImageURL;
    getElement('aboutUsImage').alt = `About ${finalSchoolName}`;
    getElement('school-location-footer').textContent = finalSchoolLocationFooter;
    
    const academicsImageEl = getElement('academicsImage'); 
    if(academicsImageEl) {
      academicsImageEl.src = settings.academicsImageURL || settings.defaultAcademicsImageURL;
      academicsImageEl.alt = `Academics at ${finalSchoolName}`;
    }

    querySelector('.about-us-info').innerHTML = settings.aboutUsText || '<p>Info coming soon.</p>';
    querySelector('.admission-info').innerHTML = settings.admission || '<p>Details coming soon.</p>';
    querySelector('.academics-info-container .academics-dynamic-content').innerHTML = settings.academics || '<p>Curriculum details soon.</p>';
    getElement('heroSchoolTagline').textContent = finalTagline;

    applySectionGradient('hero', settings.heroGradient);
    applySectionGradient('about', settings.aboutGradient);
    applySectionGradient('admissions', settings.admissionsGradient);
    applySectionGradient('academics', settings.academicsGradient);
    applySectionGradient('facilities', settings.facilitiesGradient);
    applySectionGradient('contact', settings.contactGradient);
}

function populateCarouselPublic(images, settings) {
    const carouselInner = getElement('carousel-inner');
    const carouselIndicators = getElement('carousel-indicators');
    if (!carouselInner || !carouselIndicators) return;
    carouselInner.innerHTML = ''; carouselIndicators.innerHTML = '';

    const effectiveImages = (images && images.length > 0) ? images : [{
        image_url: settings.defaultCarouselImageURL,
        alt_text: settings.defaultCarouselAltText,
        link_url: settings.defaultCarouselLink,
    }];

    if (!effectiveImages[0]?.image_url) { // No images and no default
        carouselInner.innerHTML = '<div class="carousel-item active"><div class="d-block w-100 bg-secondary" style="height: 400px;"></div></div>';
        return;
    }

    effectiveImages.forEach((image, index) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = `carousel-item${index === 0 ? ' active' : ''}`;
        let imgHtml = `<img src="${image.image_url}" class="d-block w-100" alt="${image.alt_text || 'School image'}">`;
        
        if (image.link_url && image.link_url.trim() !== '' && image.link_url.trim() !== '#') {
            const isExternal = image.link_url.startsWith('http');
            const targetLink = isExternal ? image.link_url : (image.link_url.startsWith('#') ? image.link_url : '#' + image.link_url);
            imgHtml = `<a href="${targetLink}" ${isExternal ? 'target="_blank" rel="noopener noreferrer"' : ''}>${imgHtml}</a>`;
        }
        itemDiv.innerHTML = imgHtml;
        carouselInner.appendChild(itemDiv);

        const indicatorButton = document.createElement('button');
        indicatorButton.type = 'button';
        indicatorButton.dataset.bsTarget = '#schoolCarousel';
        indicatorButton.dataset.bsSlideTo = index.toString();
        if (index === 0) {
            indicatorButton.className = 'active';
            indicatorButton.setAttribute('aria-current', 'true');
        }
        indicatorButton.setAttribute('aria-label', `Slide ${index + 1}`);
        carouselIndicators.appendChild(indicatorButton);
    });
}

function populateFacilityCardsPublic(facilityCardsData = [], facilitiesOverviewText) {
    const container = getElement('facilityCardsPublicContainer');
    if (!container) return;
    const activeCards = facilityCardsData.filter(card => card.title);
    if (activeCards.length === 0) {
        container.innerHTML = `<div class="col-12"><p class="text-center text-muted">${facilitiesOverviewText || 'Facilities details coming soon.'}</p></div>`;
        return;
    }
    container.innerHTML = activeCards.slice(0, MAX_FACILITY_CARDS).map(card => `
        <div class="col-md-6 col-lg-4 reveal">
          <div class="card facility-card h-100">
            <div class="card-body text-center">
              <i class="bi ${card.iconClass || 'bi-check-circle-fill'} display-4 text-primary mb-3"></i>
              <h5 class="card-title">${card.title}</h5>
              <p class="card-text">${card.description}</p>
            </div>
          </div>
        </div>`).join('');
}

function populateSocialLinksPublic(socialLinks = {}, whatsappNumber) {
    const linkMapping = {
        'socialFacebookLink': socialLinks.facebook, 'socialTwitterLink': socialLinks.twitter,
        'socialInstagramLink': socialLinks.instagram, 'socialLinkedInLink': socialLinks.linkedin,
        'socialYouTubeLink': socialLinks.youtube,
    };
    for (const [elementId, url] of Object.entries(linkMapping)) {
        const linkElement = getElement(elementId);
        if (linkElement) {
            const parent = linkElement.parentElement; // The <li>
            if (url) { parent.style.display = 'inline-block'; linkElement.href = url; } 
            else { parent.style.display = 'none'; }
        }
    }
    const whatsappLinkEl = getElement('whatsappLink');
    if (whatsappLinkEl) {
        if (whatsappNumber) {
            whatsappLinkEl.style.display = 'flex';
            whatsappLinkEl.href = `https://wa.me/${whatsappNumber.replace(/\D/g, '')}`;
        } else { whatsappLinkEl.style.display = 'none'; }
    }
}

function applyMapPublic(mapEmbedURL) {
    const mapContainer = getElement('mapContainer');
    const schoolMapIframe = getElement('schoolMap');
    const mapPlaceholder = getElement('mapPlaceholder');
    if (schoolMapIframe && mapContainer && mapPlaceholder) {
        if (mapEmbedURL) {
            schoolMapIframe.src = mapEmbedURL;
            mapContainer.style.display = 'flex';
            mapPlaceholder.style.display = 'none';
        } else {
            mapContainer.style.display = 'none';
            mapPlaceholder.style.display = 'block';
        }
    }
}

function applySectionGradient(sectionId, gradientSettings) {
    const sectionElement = document.getElementById(sectionId);
    if (!sectionElement || !gradientSettings) { return; }
    const colors = [gradientSettings.color1, gradientSettings.color2, gradientSettings.color3, gradientSettings.color4]
        .filter(c => c && c.trim() && c.toLowerCase() !== '#000000' && c.toLowerCase() !== '#000');
    
    if (colors.length === 0) {
        sectionElement.style.backgroundImage = '';
        sectionElement.style.backgroundColor = '';
    } else if (colors.length === 1) {
        sectionElement.style.backgroundImage = '';
        sectionElement.style.backgroundColor = colors[0];
    } else {
        const direction = gradientSettings.direction || 'to right';
        sectionElement.style.backgroundColor = '';
        sectionElement.style.backgroundImage = `linear-gradient(${direction}, ${colors.join(', ')})`;
    }
}

function setDynamicFavicon(pngUrl) {
    if (!pngUrl) return;
    const favicon = getElement('favicon');
    const appleTouchIcon = getElement('apple-touch-favicon');
    if (favicon) favicon.href = pngUrl;
    if (appleTouchIcon) appleTouchIcon.href = pngUrl;
}

function extractSrcFromIframe(inputString) {
    if (inputString.includes('<iframe')) {
        const match = inputString.match(/src="([^"]+)"/);
        return match ? match[1] : inputString;
    }
    return inputString;
}

function setupImagePreviews() {
    ['logoUpload', 'aboutImageUpload', 'academicsImageUpload'].forEach(inputId => {
        const inputElement = getElement(inputId);
        if (inputElement) {
            inputElement.addEventListener('change', function() {
                const previewId = inputId.replace('Upload', 'PreviewAdmin');
                const previewElement = getElement(previewId);
                if (this.files && this.files[0]) {
                    previewElement.src = URL.createObjectURL(this.files[0]);
                    previewElement.style.display = 'block';
                }
            });
        }
    });
}

// --- GLOBAL ASSIGNMENTS & DOM READY ---
window.saveAdminSettings = saveAdminSettings;
window.uploadCarouselImage = uploadCarouselImage;
window.removeCarouselImageAdmin = removeCarouselImageAdmin;
window.logoutAdmin = logoutAdmin;
window.fetchUsers = fetchUsers;

document.addEventListener('DOMContentLoaded', async () => {
    if (isAdminPage()) {
        await initAdminPage();
    }
    await loadAdminData();
});