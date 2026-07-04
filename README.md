<div align="center">
  <img src="assets/logo.svg" alt="ChessCourse Logo" width="150" height="150" />
  
  # ChessCourse

  **A complete AI-Powered Chess Learning Platform powered by Stockfish 17.**

  [![License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square)](LICENSE)
  [![Engine](https://img.shields.io/badge/Engine-Stockfish_17-purple.svg?style=flat-square)](#)
  [![UI](https://img.shields.io/badge/UI-Clean_Dark_Mode-00d4aa.svg?style=flat-square)](#)
  [![Made With](https://img.shields.io/badge/Made_with-Vanilla_JS-f7df1e.svg?style=flat-square)](#)
</div>

---

## Preview

<div align="center">
  <img src="assets/preview.png" alt="ChessCourse Preview" style="border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);" />
</div>

## Features

-  **AI-Powered Analysis**: Instant best-move recommendations with multi-line analysis powered by Stockfish 17.
-  **Structured Courses**: Curated learning paths covering opening fundamentals, tactics, strategy, and endgames.
-  **Real-time Practice**: Play against the AI at adjustable Elo strengths or use the board as a free-form analyzer.
-  **Premium UI**: Clean, developer-focused dark mode design. No "AI slop" or excessive visual noise.
-  **Smart Move Classification**: Opening moves are intelligently ranked (Best, Excellent, Good) rather than relying purely on centipawn loss.
-  **SAN Conversion**: Outputs Standard Algebraic Notation (SAN) instead of raw UCI for better readability.

## Local Development

To run this project locally, you need a local server (like XAMPP or Python's `http.server`) to avoid CORS restrictions with the Web Worker that runs Stockfish.

1. **Clone the repository:**
   ```bash
   git clone https://github.com/dimasrahmandaalfarizi/chess-ai-helper.git
   ```
2. **Move to your local server directory:**
   If you use XAMPP, move the folder to `C:\xampp\htdocs\`.
3. **Open in browser:**
   Navigate to `http://localhost/chess-ai-helper/` in your web browser.

## Technologies Used

- **HTML5 & CSS3**: Custom modern dark theme.
- **Vanilla JavaScript**: Core application logic.
- **[chess.js](https://github.com/jhlywa/chess.js)**: Move generation, validation, and SAN/FEN conversion.
- **[chessboard.js](https://chessboardjs.com/)**: Board rendering and drag-and-drop interaction.
- **[Stockfish.js](https://github.com/nmrugg/stockfish.js/)**: The world's strongest chess engine compiled to WebAssembly/JS.
- **[Lucide Icons](https://lucide.dev/)**: Clean, minimal iconography.

## License

This project is open-source and available under the MIT License.
