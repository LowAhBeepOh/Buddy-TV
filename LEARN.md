# LEARN.md - Understanding Buddy TV

Welcome to the learning guide for Buddy TV! This document will help you understand how the application works, from the basic concepts to the advanced implementation details.

(This is for a friend of mine to understand how HTML/JS works, you're welcome)

## 📚 Table of Contents

1. [Project Overview](#project-overview)
2. [Technology Stack](#technology-stack)
3. [Architecture](#architecture)
4. [Core Components](#core-components)
5. [Key Features Explained](#key-features-explained)
6. [Code Walkthrough](#code-walkthrough)
7. [How to Extend](#how-to-extend)
8. [Best Practices](#best-practices)

## 🎯 Project Overview

Buddy TV is a desktop media player built with Electron. It combines web technologies (HTML, CSS, JavaScript) with Node.js to create a cross-platform desktop application.

### What Makes This Special?

- **Electron Framework**: Uses web technologies to build desktop apps
- **File System Access**: Can read local files and directories
- **Custom Media Player**: Built-in video player with custom controls
- **Metadata Management**: JSON-based system for organizing media

## 🛠️ Technology Stack

### Frontend (Renderer Process)
- **HTML5**: Structure of the application
- **CSS3**: Styling with modern features like Grid and Flexbox
- **JavaScript (ES6+)**: Application logic and user interactions
- **DOM Manipulation**: Dynamic content rendering

### Backend (Main Process)
- **Node.js**: Runtime environment
- **Electron APIs**: Desktop application features
- **File System (fs)**: Reading files and directories
- **IPC (Inter-Process Communication)**: Communication between processes

### Key Libraries
- **Electron**: Desktop application framework
- **Node.js built-in modules**: fs, path, etc.

## 🏗️ Architecture

### Two-Process Model

Electron applications have two main processes:

#### 1. Main Process (`main.js`)
- Creates and manages application windows
- Handles system-level operations
- Manages file system access
- Controls application lifecycle

#### 2. Renderer Process (`renderer.js`)
- Runs the user interface
- Handles user interactions
- Manages DOM elements
- Communicates with main process via IPC

### Communication Flow

```
User Action → Renderer Process → IPC → Main Process → File System → IPC → Renderer Process → UI Update
```

## 🧩 Core Components

### 1. Main Process (`main.js`)

**Key Functions:**
- `createWindow()`: Creates the application window
- IPC Handlers: Handle requests from renderer
- File operations: Read media files and metadata

**Important Concepts:**
```javascript
// Creating a window
const win = new BrowserWindow({
  width: 1280,
  height: 720,
  frame: false,  // Custom title bar
  fullscreen: true,
  webPreferences: {
    nodeIntegration: true,  // Allow Node.js in renderer
    contextIsolation: false
  }
});

// IPC Handler for file serving
ipcMain.handle('serve-file', async (event, filePath) => {
  const data = fs.readFileSync(filePath);
  return {
    success: true,
    data: data.toString('base64'),
    mimeType: getMimeType(filePath)
  };
});
```

### 2. Renderer Process (`renderer.js`)

**Key Functions:**
- UI rendering and updates
- Event handling
- Media player controls
- Search functionality

**Important Concepts:**
```javascript
// Loading metadata
async function loadMovies() {
  const response = await window.electronAPI.loadMovies();
  const movies = response.movies;
  renderMovieGrid(movies);
}

// Playing a video
function playMovie(movieId) {
  const movie = movies[movieId];
  const videoElement = document.getElementById('video-player');
  videoElement.src = `file://${movie.video.filename}`;
  videoElement.play();
}
```

### 3. User Interface (`index.html` + `styles.css`)

**Structure:**
- Semantic HTML5 elements
- Responsive design with CSS Grid
- Custom video player controls
- Dark theme styling

## 🎬 Key Features Explained

### 1. Media Library Management

**How it works:**
1. Reads `metadata.json` file
2. Parses movie/series information
3. Renders thumbnails and titles
4. Handles user interactions

**Code Example:**
```javascript
// Loading metadata
const metadata = await fs.readFile('Movies/metadata.json', 'utf8');
const data = JSON.parse(metadata);

// Rendering movies
data.movies.forEach(movie => {
  createMovieCard(movie);
});
```

### 2. Video Playback

**How it works:**
1. Uses HTML5 `<video>` element
2. Custom controls overlay
3. Keyboard and mouse event handling
4. Progress tracking for resume feature

**Code Example:**
```javascript
// Custom play/pause
function togglePlayPause() {
  const video = document.getElementById('video-player');
  if (video.paused) {
    video.play();
  } else {
    video.pause();
  }
}

// Progress tracking
video.addEventListener('timeupdate', () => {
  const progress = (video.currentTime / video.duration) * 100;
  updateProgressBar(progress);
  savePlaybackPosition(video.currentTime);
});
```

### 3. Search Functionality

**How it works:**
1. Captures user input
2. Filters movies based on title/description
3. Updates UI with filtered results

**Code Example:**
```javascript
function searchMovies(query) {
  const filtered = Object.values(movies).filter(movie => 
    movie.title.toLowerCase().includes(query.toLowerCase()) ||
    movie.description.toLowerCase().includes(query.toLowerCase())
  );
  renderMovieGrid(filtered);
}
```

### 4. Subtitle Support

**How it works:**
1. Detects subtitle file formats
2. Parses subtitle content
3. Synchronizes with video timeline
4. Renders subtitles on screen

## 🚶 Code Walkthrough

### Startup Sequence

1. **main.js starts**
   ```javascript
   app.whenReady().then(createWindow);
   ```

2. **Window creation**
   ```javascript
   function createWindow() {
     const win = new BrowserWindow({...});
     win.loadFile('index.html');
   }
   ```

3. **Renderer loads**
   ```javascript
   // renderer.js
   document.addEventListener('DOMContentLoaded', () => {
     loadMovies();
     setupEventListeners();
   });
   ```

### Movie Selection Flow

1. **User clicks movie thumbnail**
2. **Renderer captures click event**
3. **Requests video file via IPC**
4. **Main process reads file and returns base64 data**
5. **Renderer sets video source and plays**

### File Serving Mechanism

```javascript
// In main.js
ipcMain.handle('serve-file', async (event, filePath) => {
  try {
    const data = fs.readFileSync(filePath);
    return {
      success: true,
      data: data.toString('base64'),
      mimeType: getMimeType(filePath)
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// In renderer.js
async function loadVideo(filePath) {
  const response = await window.electronAPI.serveFile(filePath);
  if (response.success) {
    const videoElement = document.getElementById('video-player');
    videoElement.src = `data:${response.mimeType};base64,${response.data}`;
  }
}
```

## 🔧 How to Extend

### Adding New Features

1. **New Media Format Support**
   ```javascript
   // Add to getMimeType function
   function getMimeType(filePath) {
     const ext = path.extname(filePath).toLowerCase();
     const mimeTypes = {
       '.mp4': 'video/mp4',
       '.webm': 'video/webm',
       '.mkv': 'video/x-matroska',  // New format
       // ... other formats
     };
     return mimeTypes[ext] || 'application/octet-stream';
   }
   ```

2. **Custom Themes**
   ```css
   /* Add new theme class */
   body.light-theme {
     background-color: #ffffff;
     color: #333333;
   }
   
   /* Theme switcher */
   function switchTheme(theme) {
     document.body.className = `${theme}-theme`;
   }
   ```

3. **Additional Metadata Fields**
   ```javascript
   // Extend metadata schema
   const movieSchema = {
     // ... existing fields
     ratings: {
       imdb: 8.5,
       rotten_tomatoes: 92
     },
     cast: ["Actor 1", "Actor 2"],
     director: "Director Name"
   };
   ```

### Best Practices for Extensions

1. **Follow the existing code style**
2. **Use async/await for file operations**
3. **Handle errors gracefully**
4. **Update both main and renderer processes when needed**
5. **Test on different platforms**

## 💡 Best Practices

### Code Organization
- **Separate concerns**: Keep UI logic separate from file operations
- **Use meaningful function names**
- **Add comments for complex logic**
- **Follow consistent naming conventions**

### Performance
- **Lazy load large files**
- **Use efficient DOM manipulation**
- **Implement proper error handling**
- **Optimize image loading**

### Security
- **Validate file paths**
- **Sanitize user input**
- **Use secure file serving methods**
- **Implement proper error messages**

### User Experience
- **Provide visual feedback**
- **Handle edge cases gracefully**
- **Implement keyboard shortcuts**
- **Ensure responsive design**

## 🎓 Learning Resources

### Electron Documentation
- [Official Electron Docs](https://www.electronjs.org/docs)
- [Electron API Reference](https://www.electronjs.org/docs/api)

### Web Technologies
- [MDN Web Docs](https://developer.mozilla.org/)
- [HTML5 Video API](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement)
- [CSS Grid Guide](https://css-tricks.com/snippets/css/complete-guide-grid/)

### JavaScript
- [Modern JavaScript Tutorial](https://javascript.info/)
- [Async/Await Guide](https://javascript.info/async-await)

## 🤝 Contributing to Buddy TV

When contributing to this project:

1. **Understand the architecture** first
2. **Test your changes** on multiple platforms
3. **Follow the existing code style**
4. **Document your changes**
5. **Consider backward compatibility**

---

*This learning guide is designed to help developers of all skill levels understand and contribute to Buddy TV. If you have questions or suggestions for improvement, please open an issue or start a discussion.*