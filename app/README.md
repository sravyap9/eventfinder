# Sidequests v2 (React + quiz recommender)

The classic page (`../index.html`, plain JavaScript) is untouched. This is a second page at `/v2/`.

- `src/ml.js` the recommender: TF-IDF + interest groups + price/time/day features, logistic regression prior from the quiz, online SGD from thumbs up/down, MMR re-ranking. No DOM code.
- `src/ml.test.js` unit tests for it: `npm test`
- `src/quiz.js`, `Quiz.jsx`, `Results.jsx`, `App.jsx` the React screens and state.

```
cd app
npm install
npm run dev     # http://localhost:5173, reads ../events.json
npm test
npm run build   # writes ../v2, which GitHub Pages serves
```

Commit `../v2` after a build. `events.json` is read at runtime, so the twice daily data refresh needs no rebuild.
