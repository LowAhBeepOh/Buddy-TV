const fs = require('fs');
const path = require('path');
const { ipcRenderer, shell } = require('electron');

let SubtitlesOctopus;
try {
    SubtitlesOctopus = require('libass-wasm');
    SubtitlesOctopus = SubtitlesOctopus && SubtitlesOctopus.default ? SubtitlesOctopus.default : SubtitlesOctopus;
} catch {
    SubtitlesOctopus = null;
}

// Configuration
const MOVIES_DIR = path.join(__dirname, 'Movies');
const METADATA_FILE = path.join(MOVIES_DIR, 'metadata.json');
const SERIES_FILE = path.join(MOVIES_DIR, 'series.json');

function toLocalUrl(absPath) {
    // Use file:// protocol for videos - works natively in Electron
    if (process.platform === 'win32') {
        const urlPath = absPath.replace(/\\/g, '/');
        return `file:///${urlPath}`;
    } else {
        return `file://${absPath}`;
    }
}

function getProgressData() {
    try {
        return JSON.parse(localStorage.getItem('buddy-tv-progress') || '{}');
    } catch {
        return {};
    }
}

function getSeriesState() {
    try {
        return JSON.parse(localStorage.getItem('buddy-tv-series-state') || '{}');
    } catch {
        return {};
    }
}

function setSeriesState(state) {
    localStorage.setItem('buddy-tv-series-state', JSON.stringify(state || {}));
}

function closeDetails() {
    if (!detailsOverlay) return;
    detailsOverlay.classList.add('hidden');
    detailsOverlay.setAttribute('aria-hidden', 'true');
    currentDetailsItem = null;
    currentDetailsType = null;
    if (detailsHeroImage) detailsHeroImage.src = '';
    if (detailsEpisodesList) detailsEpisodesList.innerHTML = '';
}

function openDetails() {
    if (!detailsOverlay) return;
    detailsOverlay.classList.remove('hidden');
    detailsOverlay.setAttribute('aria-hidden', 'false');
}

function setDetailsHeroImageFromPath(assetPath, fallbackTitle) {
    if (!detailsHeroImage) return;
    detailsHeroImage.alt = fallbackTitle || '';
    if (!assetPath) {
        detailsHeroImage.removeAttribute('src');
        return;
    }
    getFileUrl(assetPath).then(blobUrl => {
        if (blobUrl) {
            detailsHeroImage.src = blobUrl;
        } else {
            detailsHeroImage.removeAttribute('src');
        }
    });
}

function setDetailsMetaChips(chips) {
    if (!detailsMeta) return;
    detailsMeta.innerHTML = '';
    (chips || []).filter(Boolean).forEach(text => {
        const span = document.createElement('span');
        span.className = 'details-chip';
        span.textContent = String(text);
        detailsMeta.appendChild(span);
    });
}

function getResumeInfoForMovieId(movieId) {
    const progressData = getProgressData();
    const entry = progressData[movieId];
    if (!entry) return { canResume: false, startTime: 0, progress: 0 };
    const progress = entry.progress || 0;
    const startTime = entry.currentTime || 0;
    const canResume = progress > 0.05 && progress < 0.90;
    return { canResume, startTime, progress };
}

function buildEpisodeKey(season, episode) {
    return `S${season}E${episode}`;
}

function getEpisodesForSeriesTitle(seriesTitle) {
    const episodes = [];
    Object.keys(allMovies || {}).forEach(key => {
        const movie = allMovies[key];
        if (movie && movie.type === 'series' && movie.series_info && movie.series_info.name === seriesTitle) {
            episodes.push({ ...movie, id: key });
        }
    });
    episodes.sort((a, b) => {
        const sa = (a.series_info && a.series_info.season) || 0;
        const sb = (b.series_info && b.series_info.season) || 0;
        if (sa !== sb) return sa - sb;
        const ea = (a.series_info && a.series_info.episode) || 0;
        const eb = (b.series_info && b.series_info.episode) || 0;
        return ea - eb;
    });
    return episodes;
}

function findPrimaryEpisodeForSeries(seriesTitle) {
    const episodes = getEpisodesForSeriesTitle(seriesTitle);
    if (episodes.length === 0) return { episode: null, label: 'Watch', startTime: 0 };

    const progressData = getProgressData();
    const resumeCandidate = episodes.find(ep => {
        const entry = progressData[ep.id];
        return entry && entry.progress > 0.05 && entry.progress < 0.90;
    });
    if (resumeCandidate) {
        const entry = progressData[resumeCandidate.id];
        return { episode: resumeCandidate, label: 'Resume', startTime: entry.currentTime || 0 };
    }

    const state = getSeriesState();
    const lastCompleted = state && state[seriesTitle] ? state[seriesTitle] : null;
    if (lastCompleted && Number.isFinite(lastCompleted.season) && Number.isFinite(lastCompleted.episode)) {
        const idx = episodes.findIndex(ep => {
            return ep.series_info && ep.series_info.season === lastCompleted.season && ep.series_info.episode === lastCompleted.episode;
        });
        const nextEp = idx >= 0 ? episodes[idx + 1] : null;
        if (nextEp) return { episode: nextEp, label: 'Next Episode', startTime: 0 };
    }

    return { episode: episodes[0], label: 'Watch', startTime: 0 };
}

function renderEpisodesList(seriesTitle) {
    if (!detailsEpisodes || !detailsEpisodesList) return;
    const episodes = getEpisodesForSeriesTitle(seriesTitle);
    detailsEpisodesList.innerHTML = '';

    if (episodes.length === 0) {
        detailsEpisodes.classList.add('hidden');
        return;
    }

    detailsEpisodes.classList.remove('hidden');
    const progressData = getProgressData();

    let lastSeason = null;
    episodes.forEach(ep => {
        const season = ep.series_info ? ep.series_info.season : null;
        if (season !== null && season !== lastSeason) {
            lastSeason = season;
            const seasonHeader = document.createElement('div');
            seasonHeader.className = 'season-header';
            seasonHeader.textContent = `Season ${season}`;
            detailsEpisodesList.appendChild(seasonHeader);
        }

        const row = document.createElement('div');
        row.className = 'episode-row';

        const thumbWrap = document.createElement('div');
        thumbWrap.className = 'episode-thumb';
        const img = document.createElement('img');
        img.alt = ep.title;
        thumbWrap.appendChild(img);

        const info = document.createElement('div');
        info.className = 'episode-info';
        const title = document.createElement('div');
        title.className = 'episode-title';
        title.textContent = ep.title;
        const sub = document.createElement('div');
        sub.className = 'episode-sub';
        const seasonNo = ep.series_info ? ep.series_info.season : '';
        const episodeNo = ep.series_info ? ep.series_info.episode : '';
        sub.textContent = `${buildEpisodeKey(seasonNo, episodeNo)}${ep.duration ? ` • ${ep.duration}` : ''}`;
        info.appendChild(title);
        info.appendChild(sub);

        const action = document.createElement('div');
        action.className = 'episode-action';

        const entry = progressData[ep.id];
        const canResume = entry && entry.progress > 0.05 && entry.progress < 0.90;
        action.textContent = canResume ? 'Resume' : 'Watch';

        row.appendChild(thumbWrap);
        row.appendChild(info);
        row.appendChild(action);

        let thumbPath = '';
        if (ep.thumbnail && ep.thumbnail.filename) {
            thumbPath = resolveAssetPath(ep.thumbnail.filename, 'Thumbnails');
        }
        if (thumbPath) {
            getFileUrl(thumbPath).then(blobUrl => {
                if (blobUrl) img.src = blobUrl;
            });
        }

        row.addEventListener('click', () => {
            playSfx('select');
            closeDetails();
            openPlayer(ep, canResume ? (entry.currentTime || 0) : 0);
        });

        row.addEventListener('mouseenter', () => playSfx('hover'));
        detailsEpisodesList.appendChild(row);
    });
}

function showMovieDetails(movie) {
    currentDetailsItem = movie;
    currentDetailsType = 'movie';
    openDetails();

    const resumeInfo = getResumeInfoForMovieId(movie.id);
    detailsTitle.textContent = movie.title || '';
    detailsDescription.textContent = movie.description || '';

    const chips = [];
    if (movie.extras && movie.extras.year) chips.push(movie.extras.year);
    if (movie.pg_rating) chips.push(movie.pg_rating);
    if (movie.duration) chips.push(movie.duration);
    if (movie.extras && movie.extras.creator) chips.push(movie.extras.creator);
    if (movie.extras && Array.isArray(movie.extras.genre)) chips.push(...movie.extras.genre);
    setDetailsMetaChips(chips);

    let heroPath = '';
    if (movie.thumbnail && movie.thumbnail.filename) {
        heroPath = resolveAssetPath(movie.thumbnail.filename, 'Thumbnails');
    }
    setDetailsHeroImageFromPath(heroPath, movie.title);

    detailsPrimaryLabel.textContent = resumeInfo.canResume ? 'Resume' : 'Watch';
    detailsPrimaryBtn.onclick = () => {
        playSfx('select');
        closeDetails();
        openPlayer(movie, resumeInfo.canResume ? resumeInfo.startTime : 0);
    };

    if (detailsEpisodes) detailsEpisodes.classList.add('hidden');
}

function showSeriesDetails(series) {
    currentDetailsItem = series;
    currentDetailsType = 'series';
    openDetails();

    detailsTitle.textContent = series.title || '';
    detailsDescription.textContent = series.description || '';

    const chips = [];
    if (series.extras && series.extras.year) chips.push(series.extras.year);
    chips.push('Series');
    if (series.extras && series.extras.creator) chips.push(series.extras.creator);
    if (series.extras && Array.isArray(series.extras.genre)) chips.push(...series.extras.genre);
    setDetailsMetaChips(chips);

    let heroPath = '';
    if (series.thumbnail && series.thumbnail.filename) {
        heroPath = resolveAssetPath(series.thumbnail.filename, 'Thumbnails');
    }
    setDetailsHeroImageFromPath(heroPath, series.title);

    const primary = findPrimaryEpisodeForSeries(series.title);
    detailsPrimaryLabel.textContent = primary.label;
    detailsPrimaryBtn.onclick = () => {
        if (!primary.episode) return;
        playSfx('select');
        closeDetails();
        openPlayer(primary.episode, primary.startTime || 0);
    };

    renderEpisodesList(series.title);
}

// Fetch files via IPC and return blob URL
async function getFileUrl(filePath) {
    try {
        const result = await ipcRenderer.invoke('serve-file', filePath);
        if (!result.success) {
            console.error('Failed to load file:', result.error);
            return null;
        }
        // Convert base64 to blob
        const binaryString = atob(result.data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: result.mimeType });
        return URL.createObjectURL(blob);
    } catch (error) {
        console.error('IPC serve-file error:', error);
        return null;
    }
}

function resolveAssetPath(filename, defaultSubdir) {
    if (!filename || typeof filename !== 'string') return '';
    const cleaned = filename.replace(/^[/\\]+/, '');
    const hasSubPath = cleaned.includes('/') || cleaned.includes('\\');

    const candidates = [
        hasSubPath ? path.join(MOVIES_DIR, cleaned) : path.join(MOVIES_DIR, defaultSubdir, cleaned),
        path.join(MOVIES_DIR, cleaned),
        hasSubPath ? path.join(MOVIES_DIR, defaultSubdir, path.basename(cleaned)) : ''
    ].filter(Boolean);

    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    return '';
}

function getVideoMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
        case '.mp4':
            return 'video/mp4';
        case '.webm':
            return 'video/webm';
        case '.ogv':
            return 'video/ogg';
        case '.mov':
            return 'video/quicktime';
        case '.mkv':
            // MKV is not supported by HTML5 video player, return empty to trigger error
            return '';
        default:
            return '';
    }
}

// DOM Elements
const movieGrid = document.getElementById('movie-grid');
const videoPlayer = document.getElementById('video-player');
const homeView = document.getElementById('home-view');
const playerView = document.getElementById('player-view');
const backBtn = document.getElementById('back-btn');
const playPauseBtn = document.getElementById('play-pause-btn');
const volumeBtn = document.getElementById('volume-btn');
const volumeSlider = document.getElementById('volume-slider');
const subtitlesBtn = document.getElementById('subtitles-btn');
const progressBarContainer = document.getElementById('progress-container');
const progressBar = document.getElementById('progress-bar');
const timeDisplay = document.getElementById('time-display');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const videoTitle = document.getElementById('video-title');
const controlsOverlay = document.getElementById('controls-overlay');
const searchInput = document.getElementById('search-input');
const searchOverlay = document.getElementById('search-overlay');
const searchTrigger = document.querySelector('.search-trigger');
const continueWatchingSection = document.getElementById('continue-watching-section');
const continueWatchingGrid = document.getElementById('continue-watching-grid');
const exitBtn = document.getElementById('exit-btn');
const mainGridTitle = document.getElementById('main-grid-title');
const backToHomeBtn = document.getElementById('back-to-home-btn');

const detailsOverlay = document.getElementById('details-overlay');
const detailsBackdrop = document.getElementById('details-backdrop');
const detailsCloseBtn = document.getElementById('details-close');
const detailsHeroImage = document.getElementById('details-hero-image');
const detailsTitle = document.getElementById('details-title');
const detailsMeta = document.getElementById('details-meta');
const detailsDescription = document.getElementById('details-description');
const detailsPrimaryBtn = document.getElementById('details-primary-btn');
const detailsPrimaryLabel = document.getElementById('details-primary-label');
const detailsEpisodes = document.getElementById('details-episodes');
const detailsEpisodesList = document.getElementById('details-episodes-list');

function setGridMessage(text) {
    movieGrid.innerHTML = '';
    const el = document.createElement('div');
    el.className = 'empty-message';
    el.textContent = text;
    movieGrid.appendChild(el);
}

// State
let isPlaying = false;
let subtitlesEnabled = true;
let currentMovie = null;
let controlsTimeout;
let lastProgressSavedSecond = -1;
let allMovies = {}; // Store movie metadata
let allSeries = {}; // Store series metadata
let currentViewMode = 'home'; // 'home' or 'series-detail'

let assRendererInstance = null;
let assSubCanvas = null;

let currentDetailsItem = null;
let currentDetailsType = null;

// Audio Context for SFX
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSfx(type) {
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    if (type === 'hover') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(400, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(600, audioCtx.currentTime + 0.05);
        gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.05);
    } else if (type === 'select') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(600, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    }
}

// Load Data
function loadData() {
    try {
        // Load Series
        if (fs.existsSync(SERIES_FILE)) {
            const seriesData = fs.readFileSync(SERIES_FILE, 'utf-8');
            const parsedSeries = JSON.parse(seriesData);
            allSeries = parsedSeries && parsedSeries.series ? parsedSeries.series : {};
        }

        // Load Movies/Episodes
        if (fs.existsSync(METADATA_FILE)) {
            const data = fs.readFileSync(METADATA_FILE, 'utf-8');
            const metadata = JSON.parse(data);
            allMovies = metadata && metadata.movies ? metadata.movies : {};
            
            // Initial Render
            renderHomeGrid();
            updateContinueWatching();
        } else {
            console.error('Metadata file not found:', METADATA_FILE);
            setGridMessage('No metadata found.');
        }
    } catch (err) {
        console.error('Error loading data:', err);
        setGridMessage(`Error loading data: ${err.message}`);
    }
}

// Render Home Grid (Movies + Series Cards)
function renderHomeGrid() {
    currentViewMode = 'home';
    mainGridTitle.textContent = 'All Movies & Series';
    backToHomeBtn.classList.add('hidden');
    movieGrid.innerHTML = '';

    // 1. Render Series Cards
    Object.keys(allSeries || {}).forEach(seriesKey => {
        const series = allSeries[seriesKey];
        series.id = seriesKey;
        const card = createSeriesCard(series);
        movieGrid.appendChild(card);
    });

    // 2. Render Movie Cards (skip episodes that belong to a series if we want to group them, 
    //    but for now let's just render everything that is NOT type='series' OR render all movies if no series info)
    
    Object.keys(allMovies || {}).forEach(key => {
        const movie = allMovies[key];
        movie.id = key;

        // If it's a series episode, we skip it on home grid IF we have a series card for it?
        // Logic: if type is 'series', skip. User clicks Series Card -> sees episodes.
        if (movie.type === 'series') {
            // Check if we have a series definition for this
            // We need a way to link them. For now, we assume title matching or just hide all type='series'
            return; 
        }

        const card = createMovieCard(movie);
        movieGrid.appendChild(card);
    });

    if (movieGrid.children.length === 0) {
        setGridMessage('No movies or series found.');
    }
}

// Render Series Detail View
function renderSeriesView(series) {
    currentViewMode = 'series-detail';
    mainGridTitle.textContent = series.title;
    backToHomeBtn.classList.remove('hidden');
    movieGrid.innerHTML = '';

    // Find all episodes for this series
    // Matching logic: check if movie.series_info.name matches series.title
    const episodes = [];
    Object.keys(allMovies).forEach(key => {
        const movie = allMovies[key];
        movie.id = key;
        if (movie.type === 'series' && movie.series_info && movie.series_info.name === series.title) {
            episodes.push(movie);
        }
    });

    // Sort episodes
    episodes.sort((a, b) => {
        const sa = a.series_info.season || 0;
        const sb = b.series_info.season || 0;
        if (sa !== sb) return sa - sb;
        return (a.series_info.episode || 0) - (b.series_info.episode || 0);
    });

    if (episodes.length === 0) {
        setGridMessage('No episodes found.');
    } else {
        episodes.forEach(episode => {
            const card = createMovieCard(episode);
            movieGrid.appendChild(card);
        });
    }
}

function createSeriesCard(series) {
    const card = document.createElement('div');
    card.className = 'movie-card';
    card.tabIndex = 0;

    let thumbPath = '';
    if (series.thumbnail && series.thumbnail.filename) {
        thumbPath = resolveAssetPath(series.thumbnail.filename, 'Thumbnails');
    }

    card.innerHTML = `
        <div class="poster-wrapper">
            <img class="poster-image" alt="${series.title}">
        </div>
        <div class="movie-info">
            <div class="movie-title">${series.title}</div>
            <div class="movie-year">Series • ${series.extras ? series.extras.year : ''}</div>
        </div>
    `;

    // Load image asynchronously
    if (thumbPath) {
        getFileUrl(thumbPath).then(blobUrl => {
            if (blobUrl) {
                const img = card.querySelector('.poster-image');
                img.src = blobUrl;
            } else {
                card.querySelector('.poster-wrapper').innerHTML = `<div class="poster-placeholder">${series.title}</div>`;
            }
        });
    } else {
        card.querySelector('.poster-wrapper').innerHTML = `<div class="poster-placeholder">${series.title}</div>`;
    }

    card.addEventListener('click', () => {
        playSfx('select');
        showSeriesDetails(series);
    });

    card.addEventListener('mouseenter', () => playSfx('hover'));
    
    return card;
}

function createMovieCard(movie) {
    const card = document.createElement('div');
    card.className = 'movie-card';
    card.tabIndex = 0;
    
    let thumbPath = '';
    if (movie.thumbnail && movie.thumbnail.filename) {
        thumbPath = resolveAssetPath(movie.thumbnail.filename, 'Thumbnails');
    }

    let badgesHtml = '';
    if (movie.pg_rating) {
        badgesHtml += `<div class="badge rating">${movie.pg_rating}</div>`;
    }
    if (movie.duration) {
        badgesHtml += `<div class="badge duration">${movie.duration}</div>`;
    }

    let subTitle = movie.extras && movie.extras.year ? movie.extras.year : '';
    if (movie.type === 'series' && movie.series_info) {
        subTitle = `S${movie.series_info.season} E${movie.series_info.episode}`;
    }

    card.innerHTML = `
        <div class="poster-wrapper">
            <img class="poster-image" alt="${movie.title}">
            ${badgesHtml}
        </div>
        <div class="movie-info">
            <div class="movie-title">${movie.title}</div>
            <div class="movie-year">${subTitle}</div>
        </div>
    `;

    // Load image asynchronously
    if (thumbPath) {
        getFileUrl(thumbPath).then(blobUrl => {
            if (blobUrl) {
                const img = card.querySelector('.poster-image');
                img.src = blobUrl;
            } else {
                card.querySelector('.poster-wrapper').innerHTML = `<div class="poster-placeholder">No Image</div>${badgesHtml}`;
            }
        });
    } else {
        card.querySelector('.poster-wrapper').innerHTML = `<div class="poster-placeholder">No Image</div>${badgesHtml}`;
    }

    card.addEventListener('click', () => {
        playSfx('select');
        showMovieDetails(movie);
    });
    
    card.addEventListener('mouseenter', () => {
        playSfx('hover');
    });

    card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            playSfx('select');
            showMovieDetails(movie);
        }
    });

    return card;
}

// Search UI
searchTrigger.addEventListener('click', () => {
    searchOverlay.classList.toggle('open');
    if (searchOverlay.classList.contains('open')) {
        searchInput.focus();
    }
});

searchInput.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase();
    
    // If empty query, restore current view
    if (!query) {
        if (currentViewMode === 'home') renderHomeGrid();
        return; 
    }

    movieGrid.innerHTML = '';

    // Search Movies & Episodes
    Object.keys(allMovies).forEach(key => {
        const movie = allMovies[key];
        const titleMatch = movie.title.toLowerCase().includes(query);
        const genreMatch = movie.extras && movie.extras.genre && movie.extras.genre.some(g => g.toLowerCase().includes(query));
        
        if (titleMatch || genreMatch) {
            movie.id = key;
            movieGrid.appendChild(createMovieCard(movie));
        }
    });

    // Search Series
    Object.keys(allSeries).forEach(key => {
        const series = allSeries[key];
        if (series.title.toLowerCase().includes(query)) {
            series.id = key;
            movieGrid.appendChild(createSeriesCard(series));
        }
    });
});

backToHomeBtn.addEventListener('click', () => {
    renderHomeGrid();
});

document.getElementById('home-btn').addEventListener('click', () => {
    renderHomeGrid();
});

// Continue Watching Logic
function updateContinueWatching() {
    const progressData = JSON.parse(localStorage.getItem('buddy-tv-progress') || '{}');
    const continueList = [];
    
    Object.keys(progressData).forEach(movieId => {
        const data = progressData[movieId];
        if (data.progress > 0.05 && data.progress < 0.90) {
            if (allMovies[movieId]) {
                continueList.push({
                    ...allMovies[movieId],
                    id: movieId,
                    savedProgress: data.progress,
                    savedTime: data.currentTime
                });
            }
        }
    });

    if (continueList.length > 0) {
        continueWatchingSection.classList.remove('hidden');
        continueWatchingGrid.innerHTML = '';
        continueList.forEach(movie => {
            const card = createContinueCard(movie);
            continueWatchingGrid.appendChild(card);
        });
    } else {
        continueWatchingSection.classList.add('hidden');
    }
}

function createContinueCard(movie) {
    const card = document.createElement('div');
    card.className = 'continue-card';
    
    let thumbPath = '';
    if (movie.thumbnail && movie.thumbnail.filename) {
        thumbPath = resolveAssetPath(movie.thumbnail.filename, 'Thumbnails');
    }
    
    const percentage = Math.round(movie.savedProgress * 100);

    card.innerHTML = `
        <div class="continue-thumb-wrap">
            <img class="continue-thumbnail" alt="${movie.title}">
            <div class="badge duration">${percentage}%</div>
        </div>
        <div class="continue-info">
            <div class="continue-title">${movie.title}</div>
            <progress class="continue-progress" value="${percentage}" max="100"></progress>
        </div>
    `;

    // Load image asynchronously
    if (thumbPath) {
        getFileUrl(thumbPath).then(blobUrl => {
            if (blobUrl) {
                const img = card.querySelector('.continue-thumbnail');
                img.src = blobUrl;
            } else {
                const thumb = card.querySelector('.continue-thumbnail');
                thumb.replaceWith(document.createElement('div')).classList = 'continue-thumbnail poster-placeholder';
            }
        });
    } else {
        const thumb = card.querySelector('.continue-thumbnail');
        const placeholder = document.createElement('div');
        placeholder.className = 'continue-thumbnail poster-placeholder';
        placeholder.textContent = 'No Image';
        thumb.replaceWith(placeholder);
    }
    
    card.addEventListener('click', () => {
        playSfx('select');
        showMovieDetails(movie);
    });
    
    card.addEventListener('mouseenter', () => playSfx('hover'));

    return card;
}

function saveProgress(movieId, currentTime, duration) {
    if (!duration) return;
    const progress = currentTime / duration;
    const data = JSON.parse(localStorage.getItem('buddy-tv-progress') || '{}');
    
    data[movieId] = {
        currentTime,
        duration,
        progress,
        lastWatched: Date.now()
    };
    
    localStorage.setItem('buddy-tv-progress', JSON.stringify(data));
}

// Subtitle Loading
async function loadSubtitles(filename) {
    const subPath =
        resolveAssetPath(filename, 'Subtitles') ||
        resolveAssetPath(path.join('Subtitles', filename), 'Subtitles');

    if (!subPath) {
        console.error('Subtitle file not found:', filename);
        return;
    }

    const content = await fs.promises.readFile(subPath, 'utf-8');
    const ext = path.extname(subPath).toLowerCase();

    unloadSubtitles();

    if (ext === '.ssa' || ext === '.ass') {
        await loadAssSubtitlesWithLibass(content);
        return;
    }

    let vttContent = '';
    if (ext === '.srt') {
        vttContent = convertSrtToVttWithPositioning(content);
    } else if (ext === '.vtt') {
        vttContent = content;
    } else {
        console.warn('Unsupported subtitle format:', ext);
        return;
    }

    const blob = new Blob([vttContent], { type: 'text/vtt' });
    const url = URL.createObjectURL(blob);

    const track = document.createElement('track');
    track.kind = 'subtitles';
    track.label = 'English';
    track.srclang = 'en';
    track.src = url;
    track.default = true;

    videoPlayer.appendChild(track);
    if (!subtitlesEnabled) {
        track.track.mode = 'hidden';
    }
}

function unloadSubtitles() {
    const tracks = videoPlayer.querySelectorAll('track');
    tracks.forEach(track => {
        try {
            if (track.src && track.src.startsWith('blob:')) {
                URL.revokeObjectURL(track.src);
            }
        } catch {
            // ignore
        }
        track.remove();
    });

    if (assRendererInstance) {
        try {
            assRendererInstance.dispose();
        } catch {
            // ignore
        }
        assRendererInstance = null;
    }
    if (assSubCanvas) {
        assSubCanvas.remove();
        assSubCanvas = null;
    }
}

function getLibassWorkerUrl() {
    const candidates = [
        path.join(__dirname, 'node_modules', 'libass-wasm', 'dist', 'js', 'subtitles-octopus-worker.js'),
        path.join(__dirname, 'node_modules', 'libass-wasm', 'dist', 'js', 'libassjs-worker.js'),
        path.join(__dirname, 'node_modules', 'libass-wasm', 'dist', 'libassjs-worker.js'),
        path.join(__dirname, 'node_modules', 'libass-wasm', 'libassjs-worker.js'),
        path.join(__dirname, 'node_modules', 'libass-wasm', 'dist', 'libassjs-worker.js')
    ];

    for (const p of candidates) {
        if (fs.existsSync(p)) return toLocalUrl(p);
    }
    return '';
}

function getLibassLegacyWorkerUrl() {
    const candidates = [
        path.join(__dirname, 'node_modules', 'libass-wasm', 'dist', 'js', 'subtitles-octopus-worker-legacy.js'),
        path.join(__dirname, 'node_modules', 'libass-wasm', 'dist', 'js', 'libassjs-worker-legacy.js'),
        path.join(__dirname, 'node_modules', 'libass-wasm', 'dist', 'libassjs-worker-legacy.js'),
        path.join(__dirname, 'node_modules', 'libass-wasm', 'libassjs-worker-legacy.js'),
        path.join(__dirname, 'node_modules', 'libass-wasm', 'dist', 'libassjs-worker-legacy.js')
    ];

    for (const p of candidates) {
        if (fs.existsSync(p)) return toLocalUrl(p);
    }
    return '';
}

async function loadAssSubtitlesWithLibass(assContent) {
    if (!SubtitlesOctopus) {
        console.error('libass-wasm is not available; cannot render SSA/ASS styling/positioning.');
        return;
    }

    const ensureVideoHasSize = async () => {
        if (videoPlayer.readyState < 1) {
            await new Promise(resolve => videoPlayer.addEventListener('loadedmetadata', resolve, { once: true }));
        }

        const start = Date.now();
        while ((videoPlayer.offsetWidth === 0 || videoPlayer.offsetHeight === 0) && Date.now() - start < 2000) {
            await new Promise(resolve => requestAnimationFrame(resolve));
        }
    };

    const getFallbackFontUrl = () => {
        const winDir = process.env.WINDIR || 'C:\\Windows';
        const candidates = [
            path.join(winDir, 'Fonts', 'arial.ttf'),
            path.join(winDir, 'Fonts', 'segoeui.ttf'),
            path.join(winDir, 'Fonts', 'tahoma.ttf')
        ];
        for (const p of candidates) {
            try {
                if (fs.existsSync(p)) return toLocalUrl(p);
            } catch {
                // ignore
            }
        }
        return '';
    };

    await ensureVideoHasSize();

    const workerUrl = getLibassWorkerUrl();
    if (!workerUrl) {
        console.error('Could not locate libass worker file in node_modules.');
        return;
    }

    const legacyWorkerUrl = getLibassLegacyWorkerUrl();
    const fallbackFont = getFallbackFontUrl();
    const options = {
        video: videoPlayer,
        subContent: assContent,
        workerUrl,
        ...(legacyWorkerUrl ? { legacyWorkerUrl } : {}),
        ...(fallbackFont ? { fallbackFont } : {}),
        onError: err => console.error('ASS renderer error:', err)
    };

    try {
        assRendererInstance = new SubtitlesOctopus(options);

        if (assRendererInstance && assRendererInstance.canvas) {
            assSubCanvas = assRendererInstance.canvas;
            assSubCanvas.classList.add('ass-subtitles-canvas');
            if (!subtitlesEnabled) {
                assSubCanvas.style.display = 'none';
            }
        }
    } catch (e) {
        console.error('Failed to initialize ASS renderer:', e);
        unloadSubtitles();
    }
}

function convertSrtToVttWithPositioning(srt) {
    const normalized = String(srt || '').replace(/^\uFEFF/, '');
    const blocks = normalized.split(/\r?\n\r?\n+/);
    const cues = [];

    for (const block of blocks) {
        const lines = block.split(/\r?\n/).filter(l => l.trim().length > 0);
        if (lines.length < 2) continue;

        let idx = 0;
        if (/^\d+$/.test(lines[0].trim())) {
            idx = 1;
        }
        if (!lines[idx] || !lines[idx].includes('-->')) continue;

        const timeLine = lines[idx];
        const textLines = lines.slice(idx + 1);
        let text = textLines.join('\n');

        let align = null;
        const anMatch = text.match(/\{\\an(\d)\}/);
        if (anMatch) {
            const an = parseInt(anMatch[1], 10);
            if ([7, 8, 9].includes(an)) align = 'top';
            else if ([4, 5, 6].includes(an)) align = 'middle';
            else if ([1, 2, 3].includes(an)) align = 'bottom';
            text = text.replace(/\{\\an\d\}/g, '');
        }

        const vttTimeLine = timeLine.replace(/(\d{2}):(\d{2}):(\d{2}),(\d{3})/g, '$1:$2:$3.$4');
        const settings = align ? (align === 'top' ? ' line:0%' : align === 'middle' ? ' line:50%' : '') : '';

        cues.push(`${vttTimeLine}${settings}\n${text}\n`);
    }

    return `WEBVTT\n\n${cues.join('\n')}`;
}

async function convertSsaToVttAsync(ssa) {
    const lines = ssa.split(/\r?\n/);
    const vttParts = ['WEBVTT\n\n'];
    let format = [];
    let eventsStarted = false;

    let i = 0;
    const chunkSize = 800;

    while (i < lines.length) {
        const end = Math.min(i + chunkSize, lines.length);
        for (; i < end; i++) {
            const line = lines[i];

            if (!eventsStarted) {
                if (line.trim().startsWith('[Events]')) eventsStarted = true;
                continue;
            }

            if (line.startsWith('Format:')) {
                format = line
                    .substring(7)
                    .split(',')
                    .map(s => s.trim().toLowerCase());
                continue;
            }

            if (line.startsWith('Dialogue:') && format.length > 0) {
                const parts = line.substring(9).split(',');
                const values = [];
                let currentPart = 0;

                for (let j = 0; j < format.length - 1; j++) {
                    values.push(parts[j]);
                    currentPart = j + 1;
                }

                values.push(parts.slice(currentPart).join(','));

                const startIdx = format.indexOf('start');
                const endIdx = format.indexOf('end');
                const textIdx = format.indexOf('text');

                if (startIdx !== -1 && endIdx !== -1 && textIdx !== -1) {
                    const start = convertSsaTime(values[startIdx]);
                    const endTime = convertSsaTime(values[endIdx]);
                    let text = values[textIdx] || '';
                    text = text.replace(/{.*?}/g, '');
                    text = text.replace(/\\N/g, '\n');
                    text = text.replace(/\\n/g, '\n');
                    vttParts.push(`${start} --> ${endTime}\n${text}\n\n`);
                }
            }
        }

        await new Promise(resolve => setTimeout(resolve, 0));
    }

    return vttParts.join('');
}

function convertSsaTime(timeStr) {
    const parts = timeStr.trim().split(':');
    if (parts.length === 3) {
        const h = parts[0].padStart(2, '0');
        const m = parts[1].padStart(2, '0');
        const s_parts = parts[2].split('.');
        const s = s_parts[0].padStart(2, '0');
        const cs = s_parts[1] || '00';
        const ms = (parseInt(cs) * 10).toString().padStart(3, '0');
        return `${h}:${m}:${s}.${ms}`;
    }
    return '00:00:00.000';
}

// Player Logic
function openPlayer(movie, startTime = 0) {
    currentMovie = movie;
    lastProgressSavedSecond = -1;
    subtitlesEnabled = true; // Reset subtitles state

    if (subtitlesBtn) {
        const icon = subtitlesBtn.querySelector('i');
        if (icon) icon.textContent = 'subtitles';
        subtitlesBtn.style.opacity = '0.8';
    }
    
    const videoPath = movie.video && movie.video.filename ? resolveAssetPath(movie.video.filename, '') : '';
    
    if (!videoPath || !fs.existsSync(videoPath)) {
        alert(`Video file not found: ${movie.video ? movie.video.filename : 'Unknown'}`);
        return;
    }

    unloadSubtitles();
    
    // Reset video element
    videoPlayer.textTracks && Array.from(videoPlayer.textTracks).forEach(track => {
        if (track.mode !== 'hidden') {
            track.mode = 'hidden';
        }
    });

    // Check for unsupported formats
    const ext = path.extname(videoPath).toLowerCase();
    if (ext === '.mkv') {
        // Show loading dialog
        const loadingDiv = document.createElement('div');
        loadingDiv.id = 'transcode-loading';
        loadingDiv.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.9);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 9999;
            font-size: 20px;
            color: white;
            font-family: var(--font-main);
        `;
        loadingDiv.innerHTML = '<div>Transcoding MKV to MP4... This may take a few minutes.</div>';
        document.body.appendChild(loadingDiv);

        // Transcode using ffmpeg
        ipcRenderer.invoke('transcode-mkv', videoPath).then(result => {
            loadingDiv.remove();
            
            if (result.success) {
                // Use transcoded file
                document.body.classList.add('player-open');
                
                unloadSubtitles();
                
                videoPlayer.textTracks && Array.from(videoPlayer.textTracks).forEach(track => {
                    if (track.mode !== 'hidden') {
                        track.mode = 'hidden';
                    }
                });
                
                videoPlayer.src = toLocalUrl(result.path);
                videoPlayer.load();
                videoTitle.textContent = movie.title;

                const subtitleCandidate = movie.subtitles && movie.subtitles.filename ? movie.subtitles.filename : '';
                if (subtitleCandidate) {
                    setTimeout(() => {
                        loadSubtitles(subtitleCandidate).catch(() => {});
                    }, 0);
                } else if (movie.video && movie.video.filename) {
                    const baseName = path.parse(movie.video.filename).name;
                    const exts = ['.ssa', '.ass', '.srt', '.vtt'];
                    for (const ext of exts) {
                        const found = resolveAssetPath(baseName + ext, 'Subtitles');
                        if (found) {
                            setTimeout(() => {
                                loadSubtitles(path.basename(found)).catch(() => {});
                            }, 0);
                            break;
                        }
                    }
                }

                // Set initial time
                videoPlayer.currentTime = startTime;
                playSfx('play');
                showControls();
            } else {
                alert(`Failed to transcode MKV: ${result.error}`);
            }
        });
        return;
    }

    const mime = getVideoMimeType(videoPath);
    if (mime) {
        const canPlay = videoPlayer.canPlayType(mime);
        if (!canPlay) {
            const shouldOpenExternal = confirm(
                `This video format isn't supported by the built-in player (${ext}).\n\nOpen it in your default media player instead?`
            );
            if (shouldOpenExternal) {
                shell.openPath(videoPath);
            }
            return;
        }
    }

    document.body.classList.add('player-open');
    videoPlayer.src = toLocalUrl(videoPath);
    videoPlayer.load();
    videoTitle.textContent = movie.title;

    const subtitleCandidate = movie.subtitles && movie.subtitles.filename ? movie.subtitles.filename : '';
    if (subtitleCandidate) {
        setTimeout(() => {
            loadSubtitles(subtitleCandidate).catch(() => {});
        }, 0);
    } else if (movie.video && movie.video.filename) {
        const baseName = path.parse(movie.video.filename).name;
        const exts = ['.ssa', '.ass', '.srt', '.vtt'];
        for (const ext of exts) {
            const found = resolveAssetPath(baseName + ext, 'Subtitles');
            if (found) {
                setTimeout(() => {
                    loadSubtitles(baseName + ext).catch(() => {});
                }, 0);
                break;
            }
        }
    }

    homeView.classList.remove('active');
    playerView.classList.add('active');
    showControls();
    
    const startPlayback = () => {
        if (startTime > 0 && Number.isFinite(videoPlayer.duration)) {
            try {
                videoPlayer.currentTime = Math.min(startTime, Math.max(0, videoPlayer.duration - 0.25));
            } catch {
                // ignore
            }
        }

        videoPlayer.play().then(() => {
            isPlaying = true;
            updatePlayPauseIcon();
        }).catch(err => console.error("Auto-play failed:", err));
    };

    if (videoPlayer.readyState >= 1) {
        startPlayback();
    } else {
        videoPlayer.addEventListener('loadedmetadata', startPlayback, { once: true });
    }
}

function closePlayer() {
    if (currentMovie && videoPlayer.duration) {
        saveProgress(currentMovie.id, videoPlayer.currentTime, videoPlayer.duration);
    }

    unloadSubtitles();
    
    videoPlayer.pause();
    videoPlayer.src = '';
    isPlaying = false;
    currentMovie = null;
    document.body.classList.remove('player-open');
    
    playerView.classList.remove('active');
    homeView.classList.add('active');
    
    updateContinueWatching();
}

function togglePlay() {
    if (videoPlayer.paused) {
        videoPlayer.play().catch(() => {});
    } else {
        videoPlayer.pause();
    }
    updatePlayPauseIcon();
}

function updatePlayPauseIcon() {
    const icon = playPauseBtn.querySelector('i');
    icon.textContent = videoPlayer.paused ? 'play_arrow' : 'pause';
}

function formatTime(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = Math.floor(seconds % 60);
    return `${min}:${sec < 10 ? '0' + sec : sec}`;
}

// Event Listeners for Player Controls
backBtn.addEventListener('click', closePlayer);
playPauseBtn.addEventListener('click', togglePlay);

videoPlayer.addEventListener('play', updatePlayPauseIcon);
videoPlayer.addEventListener('pause', updatePlayPauseIcon);

videoPlayer.addEventListener('timeupdate', () => {
    const current = videoPlayer.currentTime;
    const duration = videoPlayer.duration || 0;
    if (!duration || !Number.isFinite(duration)) {
        timeDisplay.textContent = `${formatTime(current)} / 0:00`;
        return;
    }

    const progress = Math.min(100, Math.max(0, (current / duration) * 100));
    progressBar.style.width = `${progress}%`;
    timeDisplay.textContent = `${formatTime(current)} / ${formatTime(duration)}`;

    const sec = Math.floor(current);
    if (currentMovie && sec !== lastProgressSavedSecond && sec % 5 === 0) {
        lastProgressSavedSecond = sec;
        saveProgress(currentMovie.id, current, duration);
    }
});

videoPlayer.addEventListener('ended', () => {
    if (currentMovie) {
        const data = JSON.parse(localStorage.getItem('buddy-tv-progress') || '{}');
        delete data[currentMovie.id];
        localStorage.setItem('buddy-tv-progress', JSON.stringify(data));

        if (currentMovie.type === 'series' && currentMovie.series_info && currentMovie.series_info.name) {
            const seriesTitle = currentMovie.series_info.name;
            const state = getSeriesState();
            state[seriesTitle] = {
                season: currentMovie.series_info.season,
                episode: currentMovie.series_info.episode,
                updatedAt: Date.now()
            };
            setSeriesState(state);
        }
    }
    closePlayer();
});

if (detailsBackdrop) {
    detailsBackdrop.addEventListener('click', closeDetails);
}

if (detailsCloseBtn) {
    detailsCloseBtn.addEventListener('click', closeDetails);
}

videoPlayer.addEventListener('click', togglePlay);

progressBarContainer.addEventListener('click', (e) => {
    const rect = progressBarContainer.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    if (!videoPlayer.duration || !Number.isFinite(videoPlayer.duration)) return;
    videoPlayer.currentTime = pos * videoPlayer.duration;
});

volumeSlider.addEventListener('input', (e) => {
    const value = parseFloat(e.target.value);
    videoPlayer.volume = Number.isFinite(value) ? value : 1;
    updateVolumeIcon();
});

function updateVolumeIcon() {
    const icon = volumeBtn.querySelector('i');
    icon.textContent = videoPlayer.muted || videoPlayer.volume === 0 ? 'volume_off' : 'volume_up';
}

volumeBtn.addEventListener('click', () => {
    if (videoPlayer.muted) {
        videoPlayer.muted = false;
        volumeSlider.value = videoPlayer.volume;
    } else {
        videoPlayer.muted = true;
        volumeSlider.value = 0;
    }
    updateVolumeIcon();
});

fullscreenBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
        playerView.requestFullscreen();
    } else {
        document.exitFullscreen();
    }
});

subtitlesBtn.addEventListener('click', () => {
    const tracks = videoPlayer.querySelectorAll('track');
    subtitlesEnabled = !subtitlesEnabled;
    tracks.forEach(track => {
        track.track.mode = subtitlesEnabled ? 'showing' : 'hidden';
    });

    if (assSubCanvas) {
        assSubCanvas.style.display = subtitlesEnabled ? 'block' : 'none';
    }

    const icon = subtitlesBtn.querySelector('i');
    icon.textContent = subtitlesEnabled ? 'subtitles' : 'subtitles_off';
    subtitlesBtn.style.opacity = subtitlesEnabled ? '0.8' : '0.4';
});

function showControls() {
    controlsOverlay.style.opacity = '1';
    document.body.style.cursor = 'default';
    clearTimeout(controlsTimeout);
    controlsTimeout = setTimeout(() => {
        if (!videoPlayer.paused) {
            controlsOverlay.style.opacity = '0';
            document.body.style.cursor = 'none';
        }
    }, 3000);
}

document.addEventListener('mousemove', showControls);
document.addEventListener('keydown', showControls);

document.addEventListener('keydown', (e) => {
    if (playerView.classList.contains('active')) {
        switch(e.key) {
            case ' ':
            case 'k':
                e.preventDefault();
                togglePlay();
                break;
            case 'ArrowLeft':
                videoPlayer.currentTime = Math.max(0, videoPlayer.currentTime - 10);
                break;
            case 'ArrowRight':
                videoPlayer.currentTime = Math.min(videoPlayer.duration, videoPlayer.currentTime + 10);
                break;
            case 'Escape':
                if (document.fullscreenElement) {
                    document.exitFullscreen();
                } else {
                    closePlayer();
                }
                break;
        }
    } else if (detailsOverlay && !detailsOverlay.classList.contains('hidden')) {
        if (e.key === 'Escape') {
            closeDetails();
        }
    }
});

// Exit App
exitBtn.addEventListener('click', () => {
    ipcRenderer.send('app:exit');
});

// Initial Load
loadData();
