# Buddy TV

A lightweight desktop media player application built with Electron for organizing and watching movies and TV series locally.

![Buddy TV](https://img.shields.io/badge/Version-0.1.0-blue.svg)
![Platform](https://img.shields.io/badge/Platform-Windows-red.svg)
![License](https://img.shields.io/badge/License-MIT-darkgreen.svg)

## ✨ Features

- 🎬 **Media Library Management** - Organize movies and TV series with rich metadata
- 📺 **Local Video Playback** - Custom player with intuitive controls
- 🕒 **Resume Playback** - Automatically continue from where you left off
- 🔍 **Smart Search** - Find content across your entire media library
- 📝 **Subtitle Support** - SSA, SRT, VTT formats
- 🎨 **Modern Dark UI** - Sleek, responsive interface
- ⌨️ **Keyboard Shortcuts** - Full keyboard navigation support
- 🔊 **Audio Controls** - Volume, fullscreen, and playback speed

## 🚀 Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher)
- npm or yarn package manager

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/buddy-tv.git
cd buddy-tv

# Install dependencies
npm install

# Start the application
npm start
```

### Building for Distribution

```bash
# Build for your current platform
npm run build

# Build for all platforms
npm run build:all
```

## 📁 Project Structure

```
buddy-tv/
├── main.js              # Electron main process
├── renderer.js          # Frontend application logic
├── index.html           # Main application window
├── styles.css           # Application styling
├── package.json         # Dependencies and scripts
├── Movies/              # Media directory
│   └── metadata.template.json  # Metadata template
└── Assets/              # Static assets
    └── buddy-logo.svg   # Application logo
```

## 🎬 Supported Formats

### Video
- ✅ **MP4** - Recommended format
- ✅ **WebM** - Open-source format
- ✅ **Ogg (OGV)** - Patent-free format
- ✅ **MOV** - QuickTime format
- ⚠️ **MKV** - Opens in default media player

### Subtitles
- ✅ **SSA** - Advanced SubStation Alpha
- ✅ **SRT** - SubRip Text
- ✅ **VTT** - WebVTT

## ⚙️ Configuration

### Setting Up Your Media Library

1. **Create the Movies directory structure:**
   ```
   Movies/
   ├── metadata.json      # Your media metadata
   ├── Subtitles/         # Subtitle files
   ├── Thumbnails/        # Movie/show thumbnails
   └── ImageTitles/       # Title cards
   ```

2. **Use the metadata template:**
   Copy `Movies/metadata.template.json` to `Movies/metadata.json` and customize with your media.

### Metadata Format

```json
{
  "movies": {
    "unique_id": {
      "title": "Movie Title",
      "type": "movie|series",
      "pg_rating": "PG-13",
      "duration": "2h 15m",
      "video": {
        "filename": "movie.mp4"
      },
      "subtitles": {
        "filename": "movie.srt"
      },
      "description": "Movie description...",
      "extras": {
        "year": 2024,
        "genre": ["Action", "Drama"],
        "creator": "Director Name"
      },
      "thumbnail": {
        "filename": "thumbnail.jpg"
      }
    }
  }
}
```

## 🎮 Controls

### Keyboard Shortcuts
- `Space` - Play/Pause
- `←/→` - Seek 10 seconds
- `↑/↓` - Volume up/down
- `F` - Toggle fullscreen
- `M` - Mute/Unmute
- `Esc` - Exit fullscreen
- `Ctrl+F` - Search
- `Ctrl+Q` - Quit application

### Mouse Controls
- Click video to play/pause
- Drag progress bar to seek
- Click volume icon to mute/unmute
- Double-click video for fullscreen

## 🛠️ Development

### Scripts
- `npm start` - Start development server
- `npm run build` - Build application
- `npm run build:all` - Build for all platforms
- `npm run dev` - Development mode with hot reload

### Technologies Used
- **Electron** - Desktop application framework
- **HTML5/CSS3/JavaScript** - Frontend technologies
- **Node.js** - Runtime environment
- **CSS Grid/Flexbox** - Modern layout

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Electron team for the amazing framework
- Contributors and beta testers
- Open source community

## 📞 Support

- 🐛 **Bug Reports**: [Create an issue](https://github.com/yourusername/buddy-tv/issues)
- 💡 **Feature Requests**: [Start a discussion](https://github.com/yourusername/buddy-tv/discussions)
- 📧 **Questions**: Use the discussions section

---

**Made with ❤️ by the Buddy TV team**
